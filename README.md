# My Drive Server

Node.js server built with Clean Architecture and MVC pattern using TypeScript.

## Project Structure

```
src/
├── api/v1/                 # API versioning
│   ├── controllers/        # HTTP request handlers
│   ├── routes/            # API route definitions
│   ├── middleware/        # Request/response middleware
│   └── validators/        # Input validation
├── middleware/           # Shared middleware
├── models/               # Data models and entities
├── services/             # Business logic and services
├── utils/                # Utility functions
└── config/              # Application configuration
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `POST /api/v1/auth/refresh` - Refresh access token

### Files
- `GET /api/v1/files` - List user files
- `POST /api/v1/files/upload` - Upload file
- `GET /api/v1/files/:id` - Get file details
- `GET /api/v1/files/:id/download` - Download file
- `PUT /api/v1/files/:id` - Update file metadata
- `DELETE /api/v1/files/:id` - Delete file

### Folders
- `GET /api/v1/folders` - List folders
- `POST /api/v1/folders` - Create folder
- `GET /api/v1/folders/:id` - Get folder contents
- `PUT /api/v1/folders/:id` - Update folder
- `DELETE /api/v1/folders/:id` - Delete folder

### Sharing
- `POST /api/v1/share` - Share file/folder
- `GET /api/v1/share/:token` - Access shared content
- `GET /api/v1/share` - List shares for authenticated user
- `PATCH /api/v1/share/:id` - Update share (permissions, expiry, recipients, revoke)
- `POST /api/v1/share/:token/presign-upload` - Presign PUT for uploads when share permits `edit`
- `DELETE /api/v1/share/:id` - Revoke share

### S3
- `GET /api/v1/s3/list` - List S3 objects and folders under a user-scoped prefix

### User
- `GET /api/v1/user/profile` - Get user profile
- `PUT /api/v1/user/profile` - Update profile
- `GET /api/v1/user/storage` - Get storage usage

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests

#### Sharing Overview
- Secure link generation with random 48-char token and optional expiry.
- Permission-based access: `view`, `download`, `edit` (reserved for write actions).
- Optional recipient restrictions via `allowedEmails`.
- Activity logging for share create, access (view/download), and revoke events.

#### Create Share
- `POST /api/v1/share` (Authenticated)
- Body:
  - `type`: `file` | `folder`
  - `itemId`: string (ObjectId of file/folder)
  - `permissions`: array of `view` | `download` | `edit`
  - `expiresAt` (optional): ISO timestamp in the future
  - `allowedEmails` (optional): array of recipient emails
- Example:
```
curl -X POST "http://localhost:3000/api/v1/share" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "type":"file",
    "itemId":"<fileId>",
    "permissions":["view","download"],
    "expiresAt":"2025-12-31T23:59:59Z",
    "allowedEmails":["alice@example.com","bob@example.com"]
  }'
```
- Response (201):
  - `{ id, token, url, type, itemId, permissions, expiresAt?, allowedEmails? }`
  - `url` uses `BASE_URL` (default `http://localhost:<PORT>`).

#### Access Shared Content
- `GET /api/v1/share/:token`
- Query params:
  - `action`: `view` (default) or `download`
  - `email` (optional): required if share has `allowedEmails`
  - `expirationSeconds` (optional, download only): `300`–`86400` (default `3600`)
  - `recursive` (optional, folder + download): include subfolders when generating links
  - `limit` (optional, folder + download): max number of files to presign (default 100, max 1000)
- Behaviors:
  - `view`: returns metadata for the shared file or folder if `view` permission present.
  - `download`:
    - file share → returns JSON with a single presigned S3 URL when `download` permission present.
    - folder share → returns JSON listing presigned URLs for files in the folder (and optionally subfolders).
- Examples:
```
# View metadata
curl "http://localhost:3000/api/v1/share/<token>?action=view&email=alice@example.com"

# Generate presigned download URL (10 minutes) for a file
curl "http://localhost:3000/api/v1/share/<token>?action=download&email=alice@example.com&expirationSeconds=600"

# Generate presigned URLs for a folder (15 minutes), recursive, up to 200 files
curl "http://localhost:3000/api/v1/share/<token>?action=download&email=alice@example.com&expirationSeconds=900&recursive=true&limit=200"
```
- Sample responses:
```
# File download response
{
  "type": "file",
  "itemId": "<fileId>",
  "url": "https://s3...",
  "expiresAt": "2025-01-01T00:15:00Z"
}

# Folder download response
{
  "type": "folder",
  "folderId": "<folderId>",
  "count": 3,
  "items": [
    { "fileId": "<fileId1>", "key": "user123/folderA/file1.pdf", "url": "https://s3...", "expiresAt": "2025-01-01T00:15:00Z" },
    { "fileId": "<fileId2>", "key": "user123/folderA/sub/file2.png", "url": "https://s3...", "expiresAt": "2025-01-01T00:15:00Z" },
    { "fileId": "<fileId3>", "key": "user123/folderA/file3.zip", "url": "https://s3...", "expiresAt": "2025-01-01T00:15:00Z" }
  ]
}
```

#### AWS S3 Permissions
- Presigned URL generation uses `GetObjectCommand` from `@aws-sdk/client-s3`.
- Required IAM permission: `s3:GetObject` for the relevant bucket/key(s).
- No S3 calls occur for `view` actions; metadata is served from the database.

#### Revoke Share
- `DELETE /api/v1/share/:id` (Authenticated)
- Example:
```
curl -X DELETE "http://localhost:3000/api/v1/share/<id>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

#### Activity Logging
- Logs created via the server logger:
  - `Share link generated`, `Share accessed`, `Presigned download URL generated`, `Share revoked`.
- Include relevant context (user, item, permissions, token, actions).

#### Security Notes
- Tokens are random and unguessable; revocation immediately disables access.
- `allowedEmails` gate access to specified recipients when provided.
- Expired shares are rejected; `expiresAt` must be in the future.
- `edit` is reserved for endpoints that perform write operations.

#### Upload via Share (Edit Permission Required)
- `POST /api/v1/share/:token/presign-upload`
- Body:
  - `fileName` (optional for folders): preferred name; unique filename is generated
  - `contentType` (optional): MIME type to bind presign
  - `expirationSeconds` (optional): `300`–`3600` (default `900`)
- Behavior:
  - File shares presign to the same `s3Key` (overwrite allowed).
  - Folder shares presign to a unique key under `uploads/<ownerId>/<shareId>/<uniqueName>`.
  - When `AWS_SSE` is set, server-side encryption is enforced.
- Example:
```
curl -X POST "http://localhost:3000/api/v1/share/<token>/presign-upload" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName":"new-report.pdf",
    "contentType":"application/pdf",
    "expirationSeconds":900
  }'
```
- Response:
```
{
  "presignedUrl": "https://s3...",
  "s3Key": "uploads/<ownerId>/<shareId>/<uniqueName>",
  "expiresIn": 900,
  "type": "folder"
}
```

#### List Shares
- `GET /api/v1/share` (Authenticated)
- Returns all active shares for the user, with optional `allowedEmails` present only when set.

#### Update Share
- `PATCH /api/v1/share/:id` (Authenticated)
- Body fields are optional; only provided fields are updated:
  - `permissions`: array of `view` | `download` | `edit`
  - `expiresAt`: ISO timestamp in the future or `null` to clear
  - `allowedEmails`: array of recipient emails
  - `isRevoked`: boolean

#### S3 Listing
- `GET /api/v1/s3/list` (Authenticated)
- Query:
  - `base`: `files` | `folders` (`files` → `<userId>/`, `folders` → `folders/<userId>/`)
  - `path` (optional): relative path under base
  - `recursive` (optional): boolean
  - `maxKeys` (optional): 1–1000 (default 100)
  - `continuationToken` (optional): for pagination
- Response includes `objects`, `prefixes`, `isTruncated`, and `nextContinuationToken` only when present.

#### Security Best Practices
- Presigned URLs expire within constrained windows; choose the smallest practical `expirationSeconds`.
- Use `allowedEmails` for targeted sharing; requests must provide `email` when restriction is set.
- Prefer `view` for metadata-only access; limit `download` to necessary cases.
- `edit` grants write capability (PUT presign); audit carefully and revoke when no longer needed.
- Set `AWS_SSE` to enforce S3 server-side encryption for uploads.
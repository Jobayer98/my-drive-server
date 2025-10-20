# My Drive Server

A Node.js + TypeScript API for secure file storage, sharing, and AWS S3 integration. It follows a clean, layered structure with controllers, routes, services, and models, and ships with Swagger docs, JWT authentication, rate limiting, and robust logging.

## Project Overview
- Secure file handling backed by AWS S3 and MongoDB.
- Share files or folders via tokens with fine-grained permissions (`view`, `download`, `edit`), expiry, and optional recipient restrictions.
- Generate presigned GET URLs for downloads and presigned PUT URLs for uploads.
- List user-scoped S3 objects and folders by prefix with optional recursion and pagination.

## Tech Stack
- Runtime: `Node.js`, `Express`
- Language: `TypeScript`
- Storage: `MongoDB` via `Mongoose`
- Object Storage: `AWS S3` (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- Docs: `Swagger UI`
- Testing: `Jest`
- Logging: `winston`

## Prerequisites
- `Node.js >= 18`
- `MongoDB` (local or remote)
- AWS credentials with access to your S3 bucket

## Setup
```bash
# Install dependencies
npm install

# Copy environment template and configure
cp .env.example .env

# Start dev server
npm run dev

# Build and start production
npm run build
npm start

# Run tests
npm test
```

## Configuration (.env)
- `PORT` – API port (default `3000`)
- `BASE_URL` – Base URL for docs and links (default `http://localhost:3000`)
- `MONGO_URI` – MongoDB connection string
- `JWT_SECRET` – Secret for signing JWTs
- `AWS_REGION` – AWS region (e.g., `us-east-1`)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` – AWS credentials
- `S3_BUCKET` – Target S3 bucket name
- `AWS_SSE` (optional) – Server-side encryption mode (e.g., `AES256`)

## Scripts
- `npm run dev` – Start development server (ts-node-dev)
- `npm run build` – Compile TypeScript
- `npm start` – Run compiled server
- `npm test` – Run Jest tests

## API Overview
- Authentication
  - `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`
- Files
  - `GET /api/v1/files`, `POST /api/v1/files/upload`, `GET /api/v1/files/:id`, `GET /api/v1/files/:id/download`, `PUT /api/v1/files/:id`, `DELETE /api/v1/files/:id`
- Folders
  - `GET /api/v1/folders`, `POST /api/v1/folders`, `GET /api/v1/folders/:id`, `PUT /api/v1/folders/:id`, `DELETE /api/v1/folders/:id`
- Sharing
  - `POST /api/v1/share` – Create share
  - `GET /api/v1/share` – List shares (owner)
  - `PATCH /api/v1/share/:id` – Update share (permissions, expiry, recipients, revoke)
  - `DELETE /api/v1/share/:id` – Revoke share
  - `GET /api/v1/share/:token` – Access shared content (view or download)
  - `POST /api/v1/share/:token/presign-upload` – Presign PUT for uploads (requires `edit`)
- S3
  - `GET /api/v1/s3/list` – List objects/prefixes under user-scoped paths

## Usage Guidelines
- Authentication
  - Obtain a JWT via `POST /api/v1/auth/login` and include `Authorization: Bearer <token>` in requests.
- Upload via Share (requires `edit`)
```bash
curl -X POST "http://localhost:3000/api/v1/share/<token>/presign-upload" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName":"report.pdf",
    "contentType":"application/pdf",
    "expirationSeconds":900
  }'
```
- S3 Listing by Prefix
```bash
curl "http://localhost:3000/api/v1/s3/list?base=files&path=projects&recursive=true&maxKeys=200" \
  -H "Authorization: Bearer <token>"
```
- Access Shared Download (file)
```bash
curl "http://localhost:3000/api/v1/share/<token>?action=download&expirationSeconds=600"
```

## Swagger Documentation
- Open `http://localhost:3000/api-docs` for interactive API docs.

## Security Notes
- Presigned URLs expire within constrained windows (`GET` up to `86400`, `PUT` commonly `300-3600`).
- Use `allowedEmails` for recipient restrictions; clients must include `email` when required.
- `edit` grants write capability and is required for presigned uploads; audit and revoke when not needed.
- Set `AWS_SSE` to enforce server-side encryption for S3 uploads.

## Project Structure
```text
src/
├── api/v1/
│   ├── controllers/     # Request handlers
│   ├── routes/          # Route definitions (auth, files, folders, share, s3)
│   ├── middleware/      # Auth and other middleware
├── app.ts               # Express app setup
├── server.ts            # Server bootstrap
├── config/              # Database, rate limiter, swagger
├── models/              # Mongoose models (User, File, Folder, Share)
├── services/            # Business logic (auth, files, folders, s3, share)
├── utils/               # Logger, JWT, validators, response helpers
└── tests/               # Unit/integration tests
```

## Contributing
- Keep changes minimal and consistent with the existing style.
- Add tests for new logic when practical.
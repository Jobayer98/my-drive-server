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
- `DELETE /api/v1/share/:id` - Revoke share

### User
- `GET /api/v1/user/profile` - Get user profile
- `PUT /api/v1/user/profile` - Update profile
- `GET /api/v1/user/storage` - Get storage usage

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
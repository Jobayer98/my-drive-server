import { Router } from 'express';
import multer from 'multer';
import {
  getUserFiles,
  getUserFileStats,
  getFilePresignedUrl,
  getFileDetails,
  downloadFile,
  updateFileMetadata,
  deleteFile,
  uploadFiles,
} from '../controllers/fileController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(), // Store files in memory for S3 upload
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB default
    files: parseInt(process.env.MAX_FILES_PER_REQUEST || '10'), // 10 files max
  },
  fileFilter: (_req, file, cb) => {
    // Basic file type validation (more comprehensive validation in controller)
    const allowedMimeTypes = (
      process.env.ALLOWED_MIME_TYPES ||
      'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ).split(',');

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

/**
 * @swaggerx
 * components:
 *   schemas:
 *     FileItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique file identifier
 *           example: "507f1f77bcf86cd799439011"
 *         fileName:
 *           type: string
 *           description: Current file name
 *           example: "document_2024.pdf"
 *         originalName:
 *           type: string
 *           description: Original file name when uploaded
 *           example: "My Document.pdf"
 *         fileSize:
 *           type: number
 *           description: File size in bytes
 *           example: 1048576
 *         mimeType:
 *           type: string
 *           description: MIME type of the file
 *           example: "application/pdf"
 *         uploadedAt:
 *           type: string
 *           format: date-time
 *           description: Upload timestamp
 *           example: "2024-01-15T10:30:00.000Z"
 *         lastModified:
 *           type: string
 *           format: date-time
 *           description: Last modification timestamp
 *           example: "2024-01-15T10:30:00.000Z"
 *         presignedUrl:
 *           type: string
 *           description: Temporary access URL (if requested)
 *           example: "https://s3.amazonaws.com/bucket/file?signature=..."
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           description: File tags
 *           example: ["document", "important"]
 *
 *     FileListResponse:
 *       type: object
 *       properties:
 *         files:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FileItem'
 *         pagination:
 *           type: object
 *           properties:
 *             totalCount:
 *               type: number
 *               example: 150
 *             limit:
 *               type: number
 *               example: 50
 *             offset:
 *               type: number
 *               example: 0
 *             hasMore:
 *               type: boolean
 *               example: true
 *         summary:
 *           type: object
 *           properties:
 *             totalSize:
 *               type: number
 *               description: Total size of all files in bytes
 *               example: 104857600
 *             totalFiles:
 *               type: number
 *               description: Total number of files
 *               example: 150
 *
 *     FileStats:
 *       type: object
 *       properties:
 *         totalFiles:
 *           type: number
 *           example: 150
 *         totalSize:
 *           type: number
 *           example: 104857600
 *         fileTypeBreakdown:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               mimeType:
 *                 type: string
 *                 example: "application/pdf"
 *               count:
 *                 type: number
 *                 example: 25
 *               size:
 *                 type: number
 *                 example: 52428800
 *
 *     PresignedUrlResponse:
 *       type: object
 *       properties:
 *         presignedUrl:
 *           type: string
 *           description: Temporary URL for direct file access
 *           example: "https://s3.amazonaws.com/bucket/file?signature=..."
 *         expiresIn:
 *           type: number
 *           description: URL expiration time in seconds
 *           example: 3600
 *         fileName:
 *           type: string
 *           description: Name of the file
 *           example: "document.pdf"
 *         fileSize:
 *           type: number
 *           description: File size in bytes
 *           example: 1048576
 *         mimeType:
 *           type: string
 *           description: MIME type of the file
 *           example: "application/pdf"
 *
 *     UploadResult:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Database record ID for the uploaded file
 *           example: "507f1f77bcf86cd799439011"
 *         s3Key:
 *           type: string
 *           description: S3 object key for the uploaded file
 *           example: "uploads/user123/document_20240115_103000_abc123.pdf"
 *         fileName:
 *           type: string
 *           description: Generated unique filename
 *           example: "document_20240115_103000_abc123.pdf"
 *         originalName:
 *           type: string
 *           description: Original filename from upload
 *           example: "My Document.pdf"
 *         fileSize:
 *           type: number
 *           description: File size in bytes
 *           example: 1048576
 *         mimeType:
 *           type: string
 *           description: MIME type of the file
 *           example: "application/pdf"
 *         fileUrl:
 *           type: string
 *           description: Temporary access URL for the uploaded file
 *           example: "https://example-bucket.s3.amazonaws.com/uploads/user123/document.pdf?X-Amz-Algorithm=..."
 *         uploadedAt:
 *           type: string
 *           format: date-time
 *           description: Upload timestamp
 *           example: "2024-01-15T10:30:00.000Z"
 *
 *     UploadResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Whether the upload operation was successful
 *           example: true
 *         message:
 *           type: string
 *           description: Response message
 *           example: "Files uploaded successfully"
 *         data:
 *           type: object
 *           properties:
 *             files:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UploadResult'
 *               description: Array of successfully uploaded files
 *             uploadedCount:
 *               type: number
 *               description: Number of successfully uploaded files
 *               example: 2
 *             failedCount:
 *               type: number
 *               description: Number of failed uploads (if any)
 *               example: 0
 *             totalCount:
 *               type: number
 *               description: Total number of files in the request
 *               example: 2
 *             errors:
 *               type: array
 *               items:
 *                 type: string
 *               description: Array of error messages for failed uploads
 *               example: []
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Error message"
 *         error:
 *           type: string
 *           example: "ERROR_CODE"
 *         data:
 *           type: object
 *           description: Additional error details (optional)
 */

/**
 * @swagger
 * /api/v1/files:
 *   get:
 *     summary: Get user files
 *     description: Retrieve all files belonging to the authenticated user from AWS S3
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includePresignedUrls
 *         schema:
 *           type: string
 *           enum:
 *             - "true"
 *             - "false"
 *           default: "false"
 *         description: Include presigned URLs for temporary file access
 *       - in: query
 *         name: presignedUrlExpiration
 *         schema:
 *           type: string
 *           default: "3600"
 *         description: Presigned URL expiration time in seconds (300-86400)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *           default: "50"
 *         description: Maximum number of files to return (1-100)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: string
 *           default: "0"
 *         description: Number of files to skip for pagination
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum:
 *             - "uploadedAt"
 *             - "fileName"
 *             - "fileSize"
 *           default: uploadedAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum:
 *             - "asc"
 *             - "desc"
 *           default: "desc"
 *         description: Sort order
 *       - in: query
 *         name: mimeTypeFilter
 *         schema:
 *           type: string
 *         description: Filter files by MIME type (supports regex)
 *         example: "image/"
 *     responses:
 *       200:
 *         description: Files retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Files retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/FileListResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User authentication required"
 *       500:
 *         description: Server error - S3 connection issues or other internal errors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Storage service temporarily unavailable. Please try again later."
 */
router.get('/', authenticateToken, getUserFiles);

/**
 * @swagger
 * /api/v1/files/stats:
 *   get:
 *     summary: Get user file statistics
 *     description: Retrieve file statistics for the authenticated user
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: File statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "File statistics retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/FileStats'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/stats', authenticateToken, getUserFileStats);

/**
 * @swagger
 * /api/v1/files/{fileId}/presigned-url:
 *   get:
 *     summary: Generate presigned URL for file access
 *     description: Generate a temporary presigned URL for direct file access
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: File ID
 *         example: "507f1f77bcf86cd799439011"
 *       - in: query
 *         name: expirationSeconds
 *         schema:
 *           type: string
 *           default: "3600"
 *         description: URL expiration time in seconds (300-86400)
 *     responses:
 *       200:
 *         description: Presigned URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Presigned URL generated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/PresignedUrlResponse'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: File not found or access denied
 *       500:
 *         description: Server error
 */
router.get('/:fileId/presigned-url', authenticateToken, getFilePresignedUrl);

/**
 * @swagger
 * /api/v1/files/{id}/download:
 *   get:
 *     summary: Download a file
 *     description: Securely stream a file from AWS S3 if the authenticated user has access.
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The file ID to download
 *     responses:
 *       200:
 *         description: File stream
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid file ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: File not found or access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id/download', authenticateToken, downloadFile);

/**
 * @swagger
 * /api/v1/files/{id}:
 *   get:
 *     summary: Get detailed information about a specific file
 *     description: |
 *       Retrieve detailed information for a file owned by the authenticated user.
 *       Access is restricted to the file owner or users explicitly shared on the file.
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: File ID (MongoDB ObjectId)
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: File details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "File details retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Unique file identifier
 *                       example: "507f1f77bcf86cd799439011"
 *                     fileName:
 *                       type: string
 *                       description: Current file name
 *                       example: "document_2024.pdf"
 *                     originalName:
 *                       type: string
 *                       description: Original file name when uploaded
 *                       example: "My Document.pdf"
 *                     fileSize:
 *                       type: number
 *                       description: File size in bytes
 *                       example: 1048576
 *                     mimeType:
 *                       type: string
 *                       description: MIME type of the file
 *                       example: "application/pdf"
 *                     uploadedAt:
 *                       type: string
 *                       format: date-time
 *                       description: Upload timestamp
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     lastModified:
 *                       type: string
 *                       format: date-time
 *                       description: Last modification timestamp
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     tags:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: File tags
 *                       example: ["work", "important"]
 *                     metadata:
 *                       type: object
 *                       additionalProperties: true
 *                       description: Additional metadata related to the file
 *                       example:
 *                         width: 1920
 *                         height: 1080
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "User authentication required"
 *       404:
 *         description: File not found or access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "File not found or access denied"
 *       500:
 *         description: Internal server error - database or storage issues
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Internal server error"
 */
router.get('/:id', authenticateToken, getFileDetails);
router.put('/:id', authenticateToken, updateFileMetadata);
router.delete('/:id', authenticateToken, deleteFile);

/**
 * @swagger
 * /api/v1/files/{id}:
 *   put:
 *     summary: Update file metadata
 *     description: Update tags and metadata of a file owned by the authenticated user.
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: File ID (MongoDB ObjectId)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Tags to associate with the file
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Arbitrary key-value metadata for the file
 *     responses:
 *       200:
 *         description: File metadata updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "File metadata updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     file:
 *                       $ref: '#/components/schemas/FileItem'
 *       400:
 *         description: Invalid ID or request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Invalid file ID or request body"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "User authentication required"
 *       404:
 *         description: File not found or access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "File not found or access denied"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Internal server error"
 *   delete:
 *     summary: Delete file permanently
 *     description: Permanently delete the file from S3 and remove its database record.
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: File ID (MongoDB ObjectId)
 *     responses:
 *       204:
 *         description: File deleted successfully (No Content)
 *       400:
 *         description: Invalid file ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Invalid file ID"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "User authentication required"
 *       404:
 *         description: File not found or access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "File not found or access denied"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Internal server error"
 * /api/v1/files/upload:
 *   post:
 *     summary: Upload single or multiple files to S3
 *     description: |
 *       Upload one or more files to AWS S3 with automatic file validation,
 *       unique filename generation, and database record creation.
 *
 *       **File Requirements:**
 *       - Maximum file size: 50MB (configurable)
 *       - Maximum files per request: 10 (configurable)
 *       - Supported formats: Images (JPEG, PNG, GIF, WebP), Documents (PDF, DOC, DOCX, XLS, XLSX), Text files
 *
 *       **Upload Options:**
 *       - `tags`: Array of tags to associate with uploaded files
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Files to upload (single file or multiple files)
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Tags to associate with files (optional)
 *                 example: ["work", "important"]
 *             required:
 *               - files
 *     responses:
 *       200:
 *         description: Files uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResponse'
 *             examples:
 *               single_file_success:
 *                 summary: Single file upload success
 *                 value:
 *                   success: true
 *                   message: "Files uploaded successfully"
 *                   data:
 *                     files:
 *                       - id: "507f1f77bcf86cd799439011"
 *                         s3Key: "uploads/user123/document_20240115_103000_abc123.pdf"
 *                         fileName: "document_20240115_103000_abc123.pdf"
 *                         originalName: "My Document.pdf"
 *                         fileSize: 1048576
 *                         mimeType: "application/pdf"
 *                         fileUrl: "https://example-bucket.s3.amazonaws.com/uploads/user123/document.pdf?X-Amz-Algorithm=..."
 *                         uploadedAt: "2024-01-15T10:30:00.000Z"
 *                     uploadedCount: 1
 *                     totalCount: 1
 *               partial_success:
 *                 summary: Partial upload success with errors
 *                 value:
 *                   success: true
 *                   message: "Files uploaded with some errors"
 *                   data:
 *                     files:
 *                       - id: "507f1f77bcf86cd799439011"
 *                         s3Key: "uploads/user123/image_20240115_103000_def456.jpg"
 *                         fileName: "image_20240115_103000_def456.jpg"
 *                         originalName: "photo.jpg"
 *                         fileSize: 2097152
 *                         mimeType: "image/jpeg"
 *                         fileUrl: "https://example-bucket.s3.amazonaws.com/uploads/user123/image.jpg?X-Amz-Algorithm=..."
 *                         uploadedAt: "2024-01-15T10:30:00.000Z"
 *                     uploadedCount: 1
 *                     failedCount: 1
 *                     totalCount: 2
 *                     errors:
 *                       - "Failed to upload large_file.zip: File size exceeds limit"
 *       400:
 *         description: Bad request - validation errors or invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               no_files:
 *                 summary: No files provided
 *                 value:
 *                   success: false
 *                   message: "No files provided for upload"
 *               validation_failed:
 *                 summary: File validation failed
 *                 value:
 *                   success: false
 *                   message: "File validation failed"
 *                   data:
 *                     errors:
 *                       - "File 'large_file.zip' exceeds maximum size limit of 50MB"
 *                       - "File 'script.exe' has invalid file type"
 *                     validFiles: 1
 *                     totalFiles: 3
 *               file_size_limit:
 *                 summary: File size limit exceeded
 *                 value:
 *                   success: false
 *                   message: "File size or quota limit exceeded"
 *                   data:
 *                     error: "File size exceeds the maximum allowed limit"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "User authentication required"
 *       413:
 *         description: Payload too large - file size exceeds server limits
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "File size exceeds server limit"
 *       500:
 *         description: Internal server error - S3 or database issues
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               s3_config_error:
 *                 summary: S3 configuration error
 *                 value:
 *                   success: false
 *                   message: "Storage service configuration error. Please contact support."
 *               s3_access_error:
 *                 summary: S3 access error
 *                 value:
 *                   success: false
 *                   message: "Storage service access error. Please contact support."
 *               network_error:
 *                 summary: Network error
 *                 value:
 *                   success: false
 *                   message: "Network error occurred during upload. Please try again."
 *                   error: "INTERNAL_SERVER_ERROR"
 *               complete_failure:
 *                 summary: All files failed to upload
 *                 value:
 *                   success: false
 *                   message: "Failed to upload any files"
 *                   error: "INTERNAL_SERVER_ERROR"
 *                   data:
 *                     errors:
 *                       - "Failed to upload document.pdf: S3 access denied"
 *                       - "Failed to upload image.jpg: Network timeout"
 *                     totalCount: 2
 */
router.post(
  '/upload',
  authenticateToken,
  upload.array('files', 10),
  uploadFiles
);

export default router;

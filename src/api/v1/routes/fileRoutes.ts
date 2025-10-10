import { Router } from 'express';
import {
  getUserFiles,
  getUserFileStats,
  getFilePresignedUrl,
} from '../controllers/fileController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

/**
 * @swagger
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
 *           example: "https://s3.amazonaws.com/bucket/file?signature=..."
 *         expiresIn:
 *           type: number
 *           description: URL expiration time in seconds
 *           example: 3600
 *         fileName:
 *           type: string
 *           example: "document.pdf"
 */

/**
 * @swagger
 * /api/v1/files:
 *   get:
 *     summary: Get user files
 *     description: Retrieve all files belonging to the authenticated user from AWS S3
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includePresignedUrls
 *         schema:
 *           type: string
 *           enum: [true, false]
 *           default: false
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
 *           enum: [uploadedAt, fileName, fileSize]
 *           default: uploadedAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
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
 *     tags: [Files]
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
 *     tags: [Files]
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

export default router;

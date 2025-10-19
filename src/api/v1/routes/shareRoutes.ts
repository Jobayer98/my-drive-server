import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { createShare, getShareByToken, revokeShare } from '../controllers/shareController';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Sharing
 *   description: Secure sharing of files and folders
 */

/**
 * @swagger
 * /api/v1/share:
 *   post:
 *     summary: Create a share link for a file or folder
 *     tags: [Sharing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, itemId, permissions]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [file, folder]
 *                 example: file
 *               itemId:
 *                 type: string
 *                 example: 60d21b4667d0d8992e610c85
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [view, download, edit]
 *                 example: ["view", "download"]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 example: 2025-12-31T23:59:59.000Z
 *               allowedEmails:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["recipient@example.com"]
 *     responses:
 *       201:
 *         description: Share link created
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Item not found or access denied
 */
router.post('/', authenticateToken, createShare);

/**
 * @swagger
 * /api/v1/share/{token}:
 *   get:
 *     summary: Access a shared item by token
 *     tags: [Sharing]
 *     parameters:
 *       - in: path
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *         description: Share token
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [view, download]
 *         description: Action to perform
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: Recipient email if restricted
 *       - in: query
 *         name: expirationSeconds
 *         schema:
 *           type: integer
 *           minimum: 300
 *           maximum: 86400
 *         description: Presigned URL expiration for downloads
 *       - in: query
 *         name: recursive
 *         schema:
 *           type: boolean
 *         description: For folder shares, include subfolders when generating links
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *         description: Max number of files to presign (folder shares)
 *     responses:
 *       200:
 *         description: Shared item metadata or presigned URL(s)
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized or insufficient permissions
 *       404:
 *         description: Share not found or expired
 */
router.get('/:token', getShareByToken);

/**
 * @swagger
 * /api/v1/share/{id}:
 *   delete:
 *     summary: Revoke a share link
 *     tags: [Sharing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Share ID
 *     responses:
 *       200:
 *         description: Share revoked
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Share not found
 */
router.delete('/:id', authenticateToken, revokeShare);

export default router;
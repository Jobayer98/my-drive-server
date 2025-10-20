import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { listS3Objects } from '../controllers/s3Controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: S3
 *   description: AWS S3 object and folder listing
 */

/**
 * @swagger
 * /api/v1/s3/list:
 *   get:
 *     summary: List S3 objects and folders under a user-scoped prefix
 *     tags: [S3]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: base
 *         schema:
 *           type: string
 *           enum: [files, folders]
 *         description: Scope base. `files` uses `<userId>/`, `folders` uses `folders/<userId>/`.
 *       - in: query
 *         name: path
 *         schema:
 *           type: string
 *         description: Relative path under the base to list.
 *       - in: query
 *         name: recursive
 *         schema:
 *           type: boolean
 *         description: When true, recursively list all objects under prefix.
 *       - in: query
 *         name: maxKeys
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *         description: Max items returned per page (default 100).
 *       - in: query
 *         name: continuationToken
 *         schema:
 *           type: string
 *         description: Token for paginating subsequent results.
 *     responses:
 *       200:
 *         description: List of objects and child prefixes
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Bucket not found
 */
router.get('/list', authenticateToken, listS3Objects);

export default router;
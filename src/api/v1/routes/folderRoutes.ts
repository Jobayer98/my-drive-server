import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { listFolders, createFolder } from '../controllers/folderController';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     FolderItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         name:
 *           type: string
 *           example: "My Folder"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 *     FolderListResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Folders retrieved successfully"
 *         data:
 *           type: object
 *           properties:
 *             folders:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FolderItem'
 *             totalCount:
 *               type: number
 *               example: 3
 *     CreateFolderRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           minLength: 1
 *           example: "My New Folder"
  *         parentId:
  *           type: string
  *           description: Optional parent folder ID to create a nested folder under
  *           example: "652f1f77bcf86cd799439012"
 *     CreateFolderResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Folder created successfully"
 *         data:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               example: "507f1f77bcf86cd799439011"
 *             name:
 *               type: string
 *               example: "My New Folder"
 *             createdAt:
 *               type: string
 *               format: date-time
 *               example: "2024-01-15T10:30:00.000Z"
 *             updatedAt:
 *               type: string
 *               format: date-time
 *               example: "2024-01-15T10:30:00.000Z"
 */

// GET /api/v1/folders - list all folders for the authenticated user
router.get('/', authenticateToken, listFolders);

/**
 * @swagger
 * /api/v1/folders:
 *   get:
 *     summary: List folders for the authenticated user
 *     tags:
 *       - Folders
 *     security:
 *       - bearerAuth: []
  *     parameters:
  *       - in: query
  *         name: parentId
  *         schema:
  *           type: string
  *         description: Optional parent folder ID. If provided, lists only direct child folders.
 *     responses:
 *       200:
 *         description: Folders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FolderListResponse'
 *             example:
 *               success: true
 *               message: "Folders retrieved successfully"
 *               data:
 *                 folders:
 *                   - id: "507f1f77bcf86cd799439011"
 *                     name: "Documents"
 *                     createdAt: "2024-01-15T10:30:00.000Z"
 *                     updatedAt: "2024-01-16T08:00:00.000Z"
 *                 totalCount: 1
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "User authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Failed to retrieve folders"
 */

// POST /api/v1/folders - create a new folder for the authenticated user
router.post('/', authenticateToken, createFolder);

/**
 * @swagger
 * /api/v1/folders:
 *   post:
 *     summary: Create a new folder for the authenticated user
 *     tags:
 *       - Folders
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateFolderRequest'
 *           example:
  *             name: "My New Folder"
  *             parentId: "652f1f77bcf86cd799439012"
 *     responses:
 *       201:
 *         description: Folder created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateFolderResponse'
 *             example:
 *               success: true
 *               message: "Folder created successfully"
 *               data:
 *                 id: "507f1f77bcf86cd799439011"
 *                 name: "My New Folder"
 *                 createdAt: "2024-01-15T10:30:00.000Z"
 *                 updatedAt: "2024-01-15T10:30:00.000Z"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Folder name is required"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "User authentication required"
 *       409:
 *         description: Conflict - folder with the same name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Folder with the same name already exists"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Failed to create folder"
 */

export default router;
import { Response } from 'express';
import { ResponseController } from '../../../utils/responseController';
import { AuthenticatedRequest } from '../../v1/middlewares/authMiddleware';
import { FolderService } from '../../../services/folderService';
import { createUserFolderInS3 } from '../../../services/s3FolderService';

const folderService = new FolderService();

export const listFolders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const result = await folderService.listUserFolders(userId);
    return ResponseController.ok(res, 'Folders retrieved successfully', result);
  } catch (error: any) {
    return ResponseController.serverError(
      res,
      'Failed to retrieve folders',
      error?.message || error
    );
  }
};

export const createFolder = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user!.userId;
    const { name } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return ResponseController.badRequest(res, 'Folder name is required');
    }

    try {
      // First, ensure S3 prefix exists for the folder
      await createUserFolderInS3(userId, name.trim());

      // Then persist folder in database
      const folder = await folderService.createFolder(userId, name.trim());
      return ResponseController.created(res, 'Folder created successfully', {
        id: folder._id.toString(),
        name: folder.name,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      });
    } catch (error: any) {
      if (error?.message === 'FOLDER_EXISTS') {
        return ResponseController.conflict(
          res,
          'Folder with the same name already exists'
        );
      }
      if (error?.message === 'Access denied to S3 bucket' || error?.message === 'S3 bucket not found' || error?.message === 'Failed to create folder in S3') {
        return ResponseController.serverError(res, 'Failed to create folder in storage', error?.message);
      }
      throw error;
    }
  } catch (error: any) {
    return ResponseController.serverError(
      res,
      'Failed to create folder',
      error?.message || error
    );
  }
};

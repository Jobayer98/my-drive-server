import { Response } from 'express';
import { ResponseController } from '../../../utils/responseController';
import { AuthenticatedRequest } from '../../v1/middlewares/authMiddleware';
import { FolderService } from '../../../services/folderService';
import { createNestedUserFolderInS3 } from '../../../services/s3FolderService';

const folderService = new FolderService();

export const listFolders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const parentIdParam = (req.query?.parentId as string | undefined) || undefined;
    const parentId = typeof parentIdParam === 'string' && parentIdParam.trim() ? parentIdParam.trim() : undefined;
    const result = await folderService.listUserFolders(userId, parentId);
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
    const { name, parentId: parentIdRaw } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return ResponseController.badRequest(res, 'Folder name is required');
    }
    const parentId = typeof parentIdRaw === 'string' && parentIdRaw.trim() ? parentIdRaw.trim() : undefined;

    if (parentId) {
      const parent = await folderService.getFolderById(userId, parentId);
      if (!parent) {
        return ResponseController.notFound(res, 'Parent folder not found');
      }
    }

    try {
      // Build nested segments from ancestors and the new folder name
      const ancestorSegments = await folderService.getFolderPathSegments(userId, parentId);
      const segments = [...ancestorSegments, name.trim()];

      // First, ensure S3 prefix exists for the folder
      await createNestedUserFolderInS3(userId, segments);

      // Then persist folder in database
      const folder = await folderService.createFolder(userId, name.trim(), parentId);
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

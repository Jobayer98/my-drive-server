import { Response } from 'express';
import { ResponseController } from '../../../utils/responseController';
import { AuthenticatedRequest } from '../../v1/middlewares/authMiddleware';
import { FolderService } from '../../../services/folderService';
import { createNestedUserFolderInS3, renameNestedUserFolderInS3, deleteUserFolderTreeInS3 } from '../../../services/s3FolderService';

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

export const updateFolder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const folderId = req.params.id;
    const { name: newNameRaw } = req.body || {};
    const newName = typeof newNameRaw === 'string' ? newNameRaw.trim() : '';
    if (!newName) {
      return ResponseController.badRequest(res, 'New folder name is required');
    }

    const current = await folderService.getFolderById(userId, folderId);
    if (!current) {
      return ResponseController.notFound(res, 'Folder not found');
    }
    if (current.name === newName) {
      return ResponseController.ok(res, 'Folder updated successfully', {
        id: current._id.toString(),
        name: current.name,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
      });
    }

    try {
      const ancestorSegments = await folderService.getFolderPathSegments(userId, current.parentId ? current.parentId.toString() : null);
      const oldSegments = [...ancestorSegments, current.name];
      const newSegments = [...ancestorSegments, newName];

      // S3 first, then DB; rollback S3 on DB failure
      await renameNestedUserFolderInS3(userId, oldSegments, newSegments);
      const updated = await folderService.renameFolder(userId, folderId, newName);
      if (!updated) {
        // rollback S3
        try { await renameNestedUserFolderInS3(userId, newSegments, oldSegments); } catch {}
        return ResponseController.serverError(res, 'Failed to rename folder', 'Rename failed');
      }
      return ResponseController.ok(res, 'Folder updated successfully', {
        id: updated._id.toString(),
        name: updated.name,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    } catch (error: any) {
      if (error?.message === 'FOLDER_EXISTS') {
        return ResponseController.conflict(res, 'Folder with the same name already exists');
      }
      if (error?.message === 'Access denied to S3 bucket' || error?.message === 'S3 bucket not found' || error?.message === 'Failed to rename folder in S3') {
        return ResponseController.serverError(res, 'Failed to update folder in storage', error?.message);
      }
      throw error;
    }
  } catch (error: any) {
    return ResponseController.serverError(res, 'Failed to update folder', error?.message || error);
  }
};

export const deleteFolder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const folderId = req.params.id;

    const current = await folderService.getFolderById(userId, folderId);
    if (!current) {
      return ResponseController.notFound(res, 'Folder not found');
    }

    try {
      const ancestorSegments = await folderService.getFolderPathSegments(userId, current.parentId ? current.parentId.toString() : null);
      const segments = [...ancestorSegments, current.name];

      // S3 delete first to ensure storage cleanup; then DB soft delete
      await deleteUserFolderTreeInS3(userId, segments);
      const result = await folderService.softDeleteFolderTree(userId, folderId);
      return ResponseController.ok(res, 'Folder deleted successfully', { deletedCount: result.deletedCount });
    } catch (error: any) {
      if (error?.message === 'Access denied to S3 bucket' || error?.message === 'S3 bucket not found' || error?.message === 'Failed to delete folder in S3') {
        return ResponseController.serverError(res, 'Failed to delete folder from storage', error?.message);
      }
      throw error;
    }
  } catch (error: any) {
    return ResponseController.serverError(res, 'Failed to delete folder', error?.message || error);
  }
};

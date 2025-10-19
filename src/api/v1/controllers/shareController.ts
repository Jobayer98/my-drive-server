import { Request, Response } from 'express';
import { ShareService } from '../../../services/shareService';
import { ResponseController } from '../../../utils/responseController';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import logger from '../../../utils/logger';
import { FileService } from '../../../services/fileService';

const shareService = new ShareService();
const fileService = new FileService();

export const createShare = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = req.user?.userId;
    if (!ownerId) {
      return ResponseController.unauthorized(res, 'User authentication required');
    }

    const { type, itemId, permissions, expiresAt, allowedEmails } = req.body || {};

    if (!type || !['file', 'folder'].includes(type)) {
      return ResponseController.badRequest(res, 'Valid share type is required (file|folder)');
    }
    if (!itemId || typeof itemId !== 'string') {
      return ResponseController.badRequest(res, 'Valid itemId is required');
    }
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return ResponseController.badRequest(res, 'At least one permission is required');
    }

    let parsedExpiry: Date | null | undefined = undefined;
    if (expiresAt) {
      const dt = new Date(expiresAt);
      if (isNaN(dt.getTime())) {
        return ResponseController.badRequest(res, 'expiresAt must be a valid date');
      }
      parsedExpiry = dt;
    }

    const result = await shareService.createShare({
      ownerId,
      type,
      itemId,
      permissions,
      expiresAt: parsedExpiry ?? null,
      allowedEmails,
    });

    logger.info('Share link generated', { ownerId, itemId, type, permissions, expiresAt: result.expiresAt });

    return ResponseController.created(res, 'Share link created', result);
  } catch (error: any) {
    logger.error('Error creating share', {
      error: error instanceof Error ? error.message : error,
      userId: req.user?.userId,
      body: req.body,
    });

    if (error instanceof Error) {
      if (error.message === 'ACCESS_DENIED') {
        return ResponseController.notFound(res, 'Item not found or access denied');
      }
      if (error.message === 'INVALID_EXPIRY') {
        return ResponseController.badRequest(res, 'Expiration must be a future date');
      }
    }

    return ResponseController.serverError(res, 'Failed to create share');
  }
};

export const getShareByToken = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { action, email, expirationSeconds = '3600', recursive = 'false', limit = '100' } = req.query as any;

    if (!token || typeof token !== 'string') {
      return ResponseController.badRequest(res, 'Valid share token is required');
    }

    const share = await shareService.getShareByToken(token);
    if (!share) {
      return ResponseController.notFound(res, 'Share not found or expired');
    }

    // Optional allowedEmails gate
    if (Array.isArray(share.allowedEmails) && share.allowedEmails.length > 0) {
      const providedEmail = typeof email === 'string' ? email : undefined;
      if (!providedEmail || !share.allowedEmails.includes(providedEmail)) {
        logger.warn('Share access denied due to email restriction', { token, providedEmail });
        return ResponseController.unauthorized(res, 'Recipient not authorized for this share');
      }
    }

    logger.info('Share accessed', { token, type: share.type, itemId: share.itemId, action });

    // Handle action: download
    if (action === 'download') {
      const hasDownload = Array.isArray(share.permissions) && share.permissions.includes('download');
      if (!hasDownload) {
        return ResponseController.unauthorized(res, 'Download permission not granted');
      }

      const parsedExpiration = Math.min(Math.max(parseInt(expirationSeconds) || 3600, 300), 86400);

      if (share.type === 'file') {
        const s3Key = share.item.s3Key;
        if (!s3Key) {
          return ResponseController.serverError(res, 'Shared file storage key missing');
        }
        const presignedUrl = await fileService.generatePresignedUrl(s3Key, parsedExpiration);
        return ResponseController.ok(res, 'Presigned download URL generated', {
          presignedUrl,
          expiresIn: parsedExpiration,
          fileName: share.item.fileName,
          mimeType: share.item.mimeType,
          fileSize: share.item.fileSize,
        });
      }

      // Folder download: generate presigned URLs for files within folder (optionally recursive)
      const parsedRecursive = String(recursive).toLowerCase() === 'true';
      const parsedLimit = Math.max(1, Math.min(parseInt(limit) || 100, 1000));

      // Collect folderIds (root + descendants if recursive)
      const rootFolderId = share.item._id.toString();
      const folderIds: string[] = [rootFolderId];

      if (parsedRecursive) {
        const queue: string[] = [rootFolderId];
        const safetyLimit = 2000; // prevent runaway traversal
        let processed = 0;
        while (queue.length && processed < safetyLimit) {
          const parent = queue.shift()!;
          const children = await (await import('../../../models/Folder')).default
            .find({ parentId: parent, isDeleted: false })
            .select({ _id: 1 })
            .lean();
          for (const ch of children as any[]) {
            const id = ch._id.toString();
            folderIds.push(id);
            queue.push(id);
            processed++;
            if (processed >= safetyLimit) break;
          }
        }
      }

      // Fetch files within collected folderIds
      const FileModel = (await import('../../../models/File')).default;
      const files = await FileModel.find({ folderId: { $in: folderIds }, isDeleted: false })
        .select({ _id: 1, fileName: 1, mimeType: 1, fileSize: 1, s3Key: 1, uploadedAt: 1 })
        .limit(parsedLimit)
        .lean();

      // Generate presigned URLs for each file
      const items = await Promise.all(
        files.map(async (f: any) => {
          if (!f.s3Key) return null;
          try {
            const url = await fileService.generatePresignedUrl(f.s3Key, parsedExpiration);
            return {
              id: f._id.toString(),
              fileName: f.fileName,
              mimeType: f.mimeType,
              fileSize: f.fileSize,
              uploadedAt: f.uploadedAt,
              presignedUrl: url,
              folderId: share.item._id.toString(),
            };
          } catch (err) {
            logger.warn('Failed to presign file in shared folder', { fileId: f._id, err: err instanceof Error ? err.message : err });
            return null;
          }
        })
      );

      const presignedItems = items.filter(Boolean);
      return ResponseController.ok(res, 'Presigned URLs for shared folder files', {
        expiresIn: parsedExpiration,
        count: presignedItems.length,
        limit: parsedLimit,
        recursive: parsedRecursive,
        items: presignedItems,
      });
    }

    // Default: view metadata
    const hasView = Array.isArray(share.permissions) && share.permissions.includes('view');
    if (!hasView) {
      return ResponseController.unauthorized(res, 'View permission not granted');
    }

    if (share.type === 'file') {
      return ResponseController.ok(res, 'Shared file metadata', {
        id: share.item._id,
        fileName: share.item.fileName,
        originalName: share.item.originalName,
        fileSize: share.item.fileSize,
        mimeType: share.item.mimeType,
        uploadedAt: share.item.uploadedAt,
        lastModified: share.item.lastModified,
        tags: share.item.tags ?? [],
      });
    } else {
      // folder: return folder basic info (not full listing to keep scope tight)
      return ResponseController.ok(res, 'Shared folder metadata', {
        id: share.item._id,
        name: share.item.name,
        parentId: share.item.parentId ?? null,
        createdAt: share.item.createdAt,
        updatedAt: share.item.updatedAt,
      });
    }
  } catch (error: any) {
    logger.error('Error accessing share', { error: error instanceof Error ? error.message : error, token: req.params.token });
    return ResponseController.serverError(res, 'Failed to access shared content');
  }
};

export const revokeShare = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = req.user?.userId;
    const { id } = req.params;

    if (!ownerId) {
      return ResponseController.unauthorized(res, 'User authentication required');
    }
    if (!id || typeof id !== 'string') {
      return ResponseController.badRequest(res, 'Valid share ID is required');
    }

    const ok = await shareService.revokeShare(id, ownerId);
    if (!ok) {
      return ResponseController.notFound(res, 'Share not found or already revoked');
    }

    return ResponseController.ok(res, 'Share revoked');
  } catch (error: any) {
    logger.error('Error revoking share', { error: error instanceof Error ? error.message : error, userId: req.user?.userId, id: req.params.id });
    return ResponseController.serverError(res, 'Failed to revoke share');
  }
};
import { Response } from 'express';
import { FileService } from '../../../services/fileService';
import { ResponseController } from '../../../utils/responseController';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import logger from '../../../utils/logger';

const fileService = new FileService();

/**
 * Get all files for the authenticated user
 */
export const getUserFiles = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return ResponseController.unauthorized(
        res,
        'User authentication required'
      );
    }

    // Parse query parameters
    const {
      includePresignedUrls = 'false',
      presignedUrlExpiration = '3600',
      limit = '50',
      offset = '0',
      sortBy = 'uploadedAt',
      sortOrder = 'desc',
      mimeTypeFilter,
    } = req.query;

    // Validate query parameters
    const parsedLimit = Math.min(
      Math.max(parseInt(limit as string) || 50, 1),
      100
    );
    const parsedOffset = Math.max(parseInt(offset as string) || 0, 0);
    const parsedExpiration = Math.min(
      Math.max(parseInt(presignedUrlExpiration as string) || 3600, 300),
      86400
    ); // 5 min to 24 hours
    const shouldIncludeUrls = includePresignedUrls === 'true';

    // Validate sort parameters
    const validSortFields = ['uploadedAt', 'fileName', 'fileSize'];
    const validSortOrders = ['asc', 'desc'];

    const validatedSortBy = validSortFields.includes(sortBy as string)
      ? (sortBy as string)
      : 'uploadedAt';
    const validatedSortOrder = validSortOrders.includes(sortOrder as string)
      ? (sortOrder as string)
      : 'desc';

    logger.info(`Fetching files for user ${userId}`, {
      limit: parsedLimit,
      offset: parsedOffset,
      sortBy: validatedSortBy,
      sortOrder: validatedSortOrder,
      includePresignedUrls: shouldIncludeUrls,
      mimeTypeFilter: mimeTypeFilter || 'none',
    });

    const result = await fileService.getUserFiles(userId, {
      includePresignedUrls: shouldIncludeUrls,
      presignedUrlExpiration: parsedExpiration,
      limit: parsedLimit,
      offset: parsedOffset,
      sortBy: validatedSortBy as 'uploadedAt' | 'fileName' | 'fileSize',
      sortOrder: validatedSortOrder as 'asc' | 'desc',
      mimeTypeFilter: mimeTypeFilter as string,
    });

    // Log successful retrieval
    logger.info(
      `Successfully retrieved ${result.files.length} files for user ${userId}`,
      {
        totalCount: result.totalCount,
        totalSize: result.totalSize,
      }
    );

    return ResponseController.ok(res, 'Files retrieved successfully', {
      files: result.files,
      pagination: {
        totalCount: result.totalCount,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: parsedOffset + parsedLimit < result.totalCount,
      },
      summary: {
        totalSize: result.totalSize,
        totalFiles: result.totalCount,
      },
    });
  } catch (error) {
    logger.error('Error retrieving user files:', error);

    // Handle specific AWS/S3 errors
    if (error instanceof Error) {
      if (error.message.includes('AWS') || error.message.includes('S3')) {
        return ResponseController.serverError(
          res,
          'Storage service temporarily unavailable. Please try again later.'
        );
      }

      if (
        error.message.includes('credentials') ||
        error.message.includes('access')
      ) {
        logger.error('AWS credentials or permissions error:', error);
        return ResponseController.serverError(
          res,
          'Storage service configuration error. Please contact support.'
        );
      }

      if (
        error.message.includes('network') ||
        error.message.includes('timeout')
      ) {
        return ResponseController.serverError(
          res,
          'Network error while accessing storage. Please try again.'
        );
      }
    }

    return ResponseController.serverError(res, 'Failed to retrieve files');
  }
};

/**
 * Get file statistics for the authenticated user
 */
export const getUserFileStats = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return ResponseController.unauthorized(
        res,
        'User authentication required'
      );
    }

    logger.info(`Fetching file statistics for user ${userId}`);

    const stats = await fileService.getUserFileStats(userId);

    logger.info(`Successfully retrieved file statistics for user ${userId}`, {
      totalFiles: stats.totalFiles,
      totalSize: stats.totalSize,
    });

    return ResponseController.ok(
      res,
      'File statistics retrieved successfully',
      stats
    );
  } catch (error) {
    logger.error('Error retrieving user file statistics:', error);
    return ResponseController.serverError(
      res,
      'Failed to retrieve file statistics'
    );
  }
};

/**
 * Generate a presigned URL for a specific file
 */
export const getFilePresignedUrl = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;
    const { fileId } = req.params;
    const { expirationSeconds = '3600' } = req.query;

    if (!userId) {
      return ResponseController.unauthorized(
        res,
        'User authentication required'
      );
    }

    if (!fileId) {
      return ResponseController.badRequest(res, 'File ID is required');
    }

    // Validate expiration time
    const parsedExpiration = Math.min(
      Math.max(parseInt(expirationSeconds as string) || 3600, 300),
      86400
    );

    // Find the file and verify ownership
    const file = await fileService.getUserFiles(userId, {
      limit: 1,
      offset: 0,
    });
    const targetFile = file.files.find((f) => f.id === fileId);

    if (!targetFile) {
      return ResponseController.notFound(
        res,
        'File not found or access denied'
      );
    }

    // Get the file record to access S3 key
    const fileRecord = await require('../../../models/File').default.findById(
      fileId
    );
    if (!fileRecord || fileRecord.userId.toString() !== userId) {
      return ResponseController.notFound(
        res,
        'File not found or access denied'
      );
    }

    const presignedUrl = await fileService.generatePresignedUrl(
      fileRecord.s3Key,
      parsedExpiration
    );

    logger.info(
      `Generated presigned URL for file ${fileId} for user ${userId}`,
      {
        expirationSeconds: parsedExpiration,
      }
    );

    return ResponseController.ok(res, 'Presigned URL generated successfully', {
      presignedUrl,
      expiresIn: parsedExpiration,
      fileName: targetFile.fileName,
    });
  } catch (error) {
    logger.error('Error generating presigned URL:', error);
    return ResponseController.serverError(
      res,
      'Failed to generate file access URL'
    );
  }
};

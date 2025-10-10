import { Response } from 'express';
import { FileService } from '../../../services/fileService';
import { ResponseController } from '../../../utils/responseController';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import logger from '../../../utils/logger';
import {
  FileValidator,
  DEFAULT_FILE_CONFIG,
} from '../../../utils/fileValidation';

const fileService = new FileService();
const fileValidator = new FileValidator(DEFAULT_FILE_CONFIG);

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
    logger.error('Error retrieving user files:', {
      error: error instanceof Error ? error.message : error,
      userId: req.user?.userId,
      queryParams: req.query,
    });

    // Handle specific error types consistently
    if (error instanceof Error) {
      if (error.message.includes('Invalid S3 key')) {
        return ResponseController.badRequest(
          res,
          'File storage configuration is invalid'
        );
      }

      if (error.message.includes('AWS') || error.message.includes('S3')) {
        return ResponseController.serverError(
          res,
          'File storage service is temporarily unavailable'
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
    logger.error('Error retrieving user file statistics:', {
      error: error instanceof Error ? error.message : error,
      userId: req.user?.userId,
    });

    // Handle specific error types consistently
    if (error instanceof Error) {
      if (error.message.includes('Invalid S3 key')) {
        return ResponseController.badRequest(
          res,
          'File storage configuration is invalid'
        );
      }

      if (error.message.includes('AWS') || error.message.includes('S3')) {
        return ResponseController.serverError(
          res,
          'File storage service is temporarily unavailable'
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

    // Validate authentication
    if (!userId) {
      return ResponseController.unauthorized(
        res,
        'User authentication required'
      );
    }

    // Validate file ID
    if (!fileId || typeof fileId !== 'string') {
      return ResponseController.badRequest(res, 'Valid file ID is required');
    }

    // Validate and normalize expiration time (5 minutes to 24 hours)
    const parsedExpiration = Math.min(
      Math.max(parseInt(expirationSeconds as string) || 3600, 300),
      86400
    );

    logger.debug(
      `Generating presigned URL for file ${fileId} for user ${userId}`,
      {
        requestedExpiration: expirationSeconds,
        validatedExpiration: parsedExpiration,
      }
    );

    // Get the file record directly and verify ownership
    const File = require('../../../models/File').default;
    const fileRecord = await File.findOne({
      _id: fileId,
      userId: userId,
      isDeleted: false,
    }).lean();

    if (!fileRecord) {
      logger.warn(
        `File access denied or not found: ${fileId} for user ${userId}`
      );
      return ResponseController.notFound(
        res,
        'File not found or access denied'
      );
    }

    // Validate S3 key exists
    if (!fileRecord.s3Key) {
      logger.error(`File ${fileId} missing S3 key`);
      return ResponseController.serverError(
        res,
        'File storage information is invalid'
      );
    }

    // Generate presigned URL using the standardized service method
    const presignedUrl = await fileService.generatePresignedUrl(
      fileRecord.s3Key,
      parsedExpiration
    );

    logger.info(
      `Successfully generated presigned URL for file ${fileId} for user ${userId}`,
      {
        fileName: fileRecord.fileName,
        expirationSeconds: parsedExpiration,
        s3Key: fileRecord.s3Key,
      }
    );

    return ResponseController.ok(res, 'Presigned URL generated successfully', {
      presignedUrl,
      expiresIn: parsedExpiration,
      fileName: fileRecord.fileName,
      fileSize: fileRecord.fileSize,
      mimeType: fileRecord.mimeType,
    });
  } catch (error) {
    logger.error('Error generating presigned URL:', {
      error: error instanceof Error ? error.message : error,
      fileId: req.params.fileId,
      userId: req.user?.userId,
    });

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Invalid S3 key')) {
        return ResponseController.badRequest(
          res,
          'File storage configuration is invalid'
        );
      }

      if (error.message.includes('AWS') || error.message.includes('S3')) {
        return ResponseController.serverError(
          res,
          'File storage service is temporarily unavailable'
        );
      }
    }

    return ResponseController.serverError(
      res,
      'Failed to generate file access URL'
    );
  }
};

/**
 * Upload single or multiple files to S3
 */
export const uploadFiles = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return ResponseController.unauthorized(
        res,
        'User authentication required'
      );
    }

    // Check if files were uploaded
    if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
      return ResponseController.badRequest(res, 'No files provided for upload');
    }

    // Normalize files to array - handle both array and object formats
    let files: Express.Multer.File[];
    if (Array.isArray(req.files)) {
      files = req.files;
    } else {
      // req.files is { [fieldname: string]: Express.Multer.File[] }
      files = Object.values(req.files).flat();
    }

    logger.info(`Upload request received for user ${userId}:`, {
      fileCount: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      fileNames: files.map((f) => f.originalname),
    });

    // Validate all files before processing
    const validationResult = fileValidator.validateFiles(files);

    if (!validationResult.isValid) {
      logger.warn(`File validation failed for user ${userId}:`, {
        errors: validationResult.errors,
        fileCount: files.length,
      });

      return ResponseController.badRequest(res, 'File validation failed', {
        errors: validationResult.errors,
        totalFiles: files.length,
      });
    }

    // Parse upload options from request body
    const {
      folder = 'uploads',
      tags = [],
      makePublic = false,
      continueOnError = true,
    } = req.body;

    // Sanitize tags
    const sanitizedTags = Array.isArray(tags)
      ? tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
      : [];

    // Upload files using FileService
    const uploadResult = await fileService.uploadFiles(userId, files, {
      folder: typeof folder === 'string' ? folder : 'uploads',
      tags: sanitizedTags,
      makePublic: makePublic === 'true' || makePublic === true,
      continueOnError: continueOnError === 'true' || continueOnError === true,
    });

    // Log upload results
    logger.info(`Upload completed for user ${userId}:`, {
      successful: uploadResult.files.length,
      failed: uploadResult.errors.length,
      success: uploadResult.success,
    });

    // Return appropriate response based on results
    if (uploadResult.success) {
      return ResponseController.ok(res, 'Files uploaded successfully', {
        files: uploadResult.files,
        uploadedCount: uploadResult.files.length,
        totalCount: files.length,
      });
    } else if (uploadResult.files.length > 0) {
      // Partial success
      return ResponseController.ok(res, 'Files uploaded with some errors', {
        files: uploadResult.files,
        errors: uploadResult.errors,
        uploadedCount: uploadResult.files.length,
        failedCount: uploadResult.errors.length,
        totalCount: files.length,
      });
    } else {
      // Complete failure
      return ResponseController.serverError(res, 'Failed to upload any files', {
        errors: uploadResult.errors,
        totalCount: files.length,
      });
    }
  } catch (error) {
    logger.error('Error in uploadFiles controller:', {
      error: error instanceof Error ? error.message : error,
      userId: req.user?.userId,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Handle specific error types
    if (error instanceof Error) {
      // File validation errors
      if (error.message.includes('validation')) {
        return ResponseController.badRequest(res, 'File validation error', {
          error: error.message,
        });
      }

      // S3 configuration errors
      if (
        error.message.includes('bucket not found') ||
        error.message.includes('Invalid S3 bucket')
      ) {
        return ResponseController.serverError(
          res,
          'Storage service configuration error. Please contact support.'
        );
      }

      // S3 access/permission errors
      if (
        error.message.includes('Access denied') ||
        error.message.includes('credentials')
      ) {
        return ResponseController.serverError(
          res,
          'Storage service access error. Please contact support.'
        );
      }

      // Network/timeout errors
      if (
        error.message.includes('timeout') ||
        error.message.includes('network') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT')
      ) {
        return ResponseController.serverError(
          res,
          'Network error occurred during upload. Please try again.'
        );
      }

      // File size or quota errors
      if (
        error.message.includes('size') ||
        error.message.includes('quota') ||
        error.message.includes('limit')
      ) {
        return ResponseController.badRequest(
          res,
          'File size or quota limit exceeded',
          { error: error.message }
        );
      }
    }

    // Generic server error
    return ResponseController.serverError(
      res,
      'An unexpected error occurred during file upload'
    );
  }
};

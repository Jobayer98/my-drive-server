import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import File from '../models/File';
import Folder from '../models/Folder';
import logger from '../utils/logger';
import { generateUniqueFilename } from '../utils/fileValidation';

export interface FileListItem {
  id: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
  lastModified: Date;
  presignedUrl?: string;
  tags?: string[];
}

export interface FileListResponse {
  files: FileListItem[];
  totalCount: number;
  totalSize: number;
}

export interface UploadResult {
  id: string;
  s3Key: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  fileUrl: string;
  uploadedAt: Date;
}

export interface UploadResponse {
  success: boolean;
  files: UploadResult[];
  errors: string[];
}

export class FileService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    this.bucketName = process.env.AWS_S3_BUCKET_NAME!;
  }

  /**
   * Move a file to a destination folder (or to root when destinationFolderId is null).
   * This updates only the database association; the S3 key remains unchanged.
   * Preserves file metadata and access controls.
   */
  async moveFile(
    userId: string,
    fileId: string,
    destinationFolderId?: string | null
  ): Promise<{
    id: string;
    fileName: string;
    originalName: string;
    fileSize: number;
    mimeType: string;
    folderId?: string | null;
    s3Key: string;
    s3Bucket: string;
    uploadedAt: Date;
    lastModified: Date;
    tags?: string[];
    metadata?: Record<string, any>;
  } | null> {
    try {
      const file = await File.findOne({ _id: fileId, userId, isDeleted: false });
      if (!file) {
        return null;
      }

      let destId: string | null = null;
      if (destinationFolderId && typeof destinationFolderId === 'string') {
        const dest = await Folder.findOne({ _id: destinationFolderId, userId, isDeleted: false })
          .select({ _id: 1 })
          .lean();
        if (!dest) {
          const err: any = new Error('DESTINATION_NOT_FOUND');
          throw err;
        }
        destId = destinationFolderId;
      }

      // Update association; keep metadata and ACLs untouched
      const updated = await File.findOneAndUpdate(
        { _id: fileId, userId, isDeleted: false },
        { $set: { folderId: destId, lastModified: new Date() } },
        { new: true }
      ).lean();

      if (!updated) {
        return null;
      }

      logger.info('Moved file to destination folder', {
        userId,
        fileId,
        destinationFolderId: destId,
      });

      return {
        id: updated._id.toString(),
        fileName: updated.fileName,
        originalName: updated.originalName,
        fileSize: updated.fileSize,
        mimeType: updated.mimeType,
        folderId: updated.folderId ? updated.folderId.toString() : null,
        s3Key: updated.s3Key,
        s3Bucket: updated.s3Bucket,
        uploadedAt: updated.uploadedAt,
        lastModified: updated.lastModified,
        tags: updated.tags ?? [],
        metadata: updated.metadata ?? {},
      };
    } catch (error) {
      logger.error('Error moving file to folder', {
        error: error instanceof Error ? error.message : error,
        userId,
        fileId,
        destinationFolderId,
      });
      if ((error as any)?.message === 'DESTINATION_NOT_FOUND') {
        throw error;
      }
      throw new Error('Failed to move file');
    }
  }

  /**
   * Get all files for a specific user
   */
  async getUserFiles(
    userId: string,
    options: {
      includePresignedUrls?: boolean;
      presignedUrlExpiration?: number;
      limit?: number;
      offset?: number;
      sortBy?: 'uploadedAt' | 'fileName' | 'fileSize';
      sortOrder?: 'asc' | 'desc';
      mimeTypeFilter?: string;
    } = {}
  ): Promise<FileListResponse> {
    try {
      const {
        includePresignedUrls = false,
        presignedUrlExpiration = 3600, // 1 hour default
        limit = 50,
        offset = 0,
        sortBy = 'uploadedAt',
        sortOrder = 'desc',
        mimeTypeFilter,
      } = options;

      // Build query
      const query: any = {
        userId,
        isDeleted: false,
      };

      if (mimeTypeFilter) {
        query.mimeType = { $regex: mimeTypeFilter, $options: 'i' };
      }

      // Build sort object
      const sortObject: any = {};
      sortObject[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Get files from database
      const files = await File.find(query)
        .sort(sortObject)
        .limit(limit)
        .skip(offset)
        .lean();

      // Get total count and size
      const [totalCount, totalSizeResult] = await Promise.all([
        File.countDocuments(query),
        File.aggregate([
          { $match: query },
          { $group: { _id: null, totalSize: { $sum: '$fileSize' } } },
        ]),
      ]);

      const totalSize =
        totalSizeResult.length > 0 ? totalSizeResult[0].totalSize : 0;

      // Process files and generate presigned URLs if requested
      const processedFiles: FileListItem[] = await Promise.all(
        files.map(async (file) => {
          const fileItem: FileListItem = {
            id: file._id.toString(),
            fileName: file.fileName,
            originalName: file.originalName,
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            uploadedAt: file.uploadedAt,
            lastModified: file.lastModified,
            tags: file.tags ?? [],
          };

          // Generate presigned URL if requested
          if (includePresignedUrls) {
            try {
              fileItem.presignedUrl = await this.generatePresignedUrlForUser(
                file._id.toString(),
                userId,
                presignedUrlExpiration
              );
            } catch (error) {
              logger.warn(
                `Failed to generate presigned URL for file ${file._id}:`,
                error
              );
              // Continue without presigned URL
            }
          }

          return fileItem;
        })
      );

      return {
        files: processedFiles,
        totalCount,
        totalSize,
      };
    } catch (error) {
      logger.error('Error retrieving user files:', error);
      throw new Error('Failed to retrieve user files');
    }
  }

  /**
   * Generate a presigned URL for file access (GET)
   */
  async generatePresignedUrl(
    s3Key: string,
    expirationSeconds: number = 3600
  ): Promise<string> {
    try {
      if (!s3Key || typeof s3Key !== 'string') {
        throw new Error('Invalid S3 key provided');
      }

      const validatedExpiration = Math.min(Math.max(expirationSeconds, 300), 86400);

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: validatedExpiration,
      });

      logger.debug(`Generated presigned GET URL for S3 key: ${s3Key}, expires in: ${validatedExpiration}s`);
      return presignedUrl;
    } catch (error) {
      logger.error(`Error generating presigned GET URL for key ${s3Key}:`, {
        error: error instanceof Error ? error.message : error,
        s3Key,
        expirationSeconds,
      });
      throw new Error('Failed to generate presigned URL for file access');
    }
  }

  // Added: generatePresignedPutUrl (PUT presign for uploads)
  async generatePresignedPutUrl(
    s3Key: string,
    expirationSeconds: number = 3600,
    options: {
      contentType?: string;
      enforceSSE?: boolean;
    } = {}
  ): Promise<string> {
    try {
      if (!s3Key || typeof s3Key !== 'string') {
        throw new Error('Invalid S3 key provided');
      }

      const validatedExpiration = Math.min(Math.max(expirationSeconds, 300), 86400);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ...(options.contentType ? { ContentType: options.contentType } : {}),
        ...(options.enforceSSE && process.env.AWS_SSE
          ? { ServerSideEncryption: process.env.AWS_SSE as any }
          : {}),
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: validatedExpiration,
      });

      logger.debug(`Generated presigned PUT URL for S3 key: ${s3Key}, expires in: ${validatedExpiration}s`);
      return url;
    } catch (error) {
      logger.error(`Error generating presigned PUT URL for key ${s3Key}:`, {
        error: error instanceof Error ? error.message : error,
        s3Key,
        expirationSeconds,
      });
      throw new Error('Failed to generate presigned upload URL');
    }
  }

  /**
   * Check if a user can access a given file.
   * Access is granted if the user is the owner, or the file
   * has been explicitly shared with the user.
   */
  async canUserAccessFile(userId: string, fileId: string): Promise<boolean> {
    try {
      const fileRecord = await File.findOne({
        _id: fileId,
        isDeleted: false,
      })
        .select(['userId', 'sharedWith'])
        .lean();

      if (!fileRecord) {
        return false;
      }

      // Owner check
      const isOwner = fileRecord.userId.toString() === userId;
      if (isOwner) return true;

      // Shared-with check (optional field)
      const sharedWith: any[] = (fileRecord as any).sharedWith || [];
      return Array.isArray(sharedWith)
        ? sharedWith.map((id) => id.toString()).includes(userId)
        : false;
    } catch (error) {
      logger.error('Error checking file access permissions', {
        error: error instanceof Error ? error.message : error,
        userId,
        fileId,
      });
      return false;
    }
  }

  /**
   * Generate a presigned URL for a user if they have access to the file.
   * Enforces owner-only access unless the file has been explicitly shared.
   */
  async generatePresignedUrlForUser(
    fileId: string,
    userId: string,
    expirationSeconds: number = 3600
  ): Promise<string> {
    // Verify access first
    const hasAccess = await this.canUserAccessFile(userId, fileId);
    if (!hasAccess) {
      throw new Error(
        'Access denied: You do not have permission to access this file'
      );
    }

    // Load file to get s3Key
    const fileRecord = await File.findOne({ _id: fileId, isDeleted: false })
      .select(['s3Key'])
      .lean();

    if (!fileRecord || !fileRecord.s3Key) {
      throw new Error('File not found or storage key missing');
    }

    return this.generatePresignedUrl(fileRecord.s3Key, expirationSeconds);
  }

  /**
   * Verify file exists in S3 and get metadata
   */
  async verifyFileInS3(s3Key: string): Promise<{
    exists: boolean;
    size?: number;
    lastModified?: Date;
    contentType?: string;
  }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);

      const result: {
        exists: boolean;
        size?: number;
        lastModified?: Date;
        contentType?: string;
      } = {
        exists: true,
      };

      if (response.ContentLength !== undefined) {
        result.size = response.ContentLength;
      }

      if (response.LastModified !== undefined) {
        result.lastModified = response.LastModified;
      }

      if (response.ContentType !== undefined) {
        result.contentType = response.ContentType;
      }

      return result;
    } catch (error: any) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return { exists: false };
      }

      logger.error(`Error verifying file in S3 for key ${s3Key}:`, error);
      throw new Error('Failed to verify file in S3');
    }
  }

  /**
   * Sync database records with S3 bucket (for maintenance)
   */
  async syncUserFilesWithS3(userId: string): Promise<{
    synced: number;
    orphanedInDb: number;
    orphanedInS3: number;
  }> {
    try {
      // Get all user files from database
      const dbFiles = await File.find({ userId, isDeleted: false }).lean();

      let synced = 0;
      let orphanedInDb = 0;

      // Verify each database record exists in S3
      for (const dbFile of dbFiles) {
        const s3Status = await this.verifyFileInS3(dbFile.s3Key);

        if (s3Status.exists) {
          // Update file metadata if different
          if (
            s3Status.size !== dbFile.fileSize ||
            s3Status.lastModified?.getTime() !== dbFile.lastModified.getTime()
          ) {
            await File.findByIdAndUpdate(dbFile._id, {
              fileSize: s3Status.size || dbFile.fileSize,
              lastModified: s3Status.lastModified || dbFile.lastModified,
            });
          }
          synced++;
        } else {
          // Mark as deleted if not found in S3
          await File.findByIdAndUpdate(dbFile._id, { isDeleted: true });
          orphanedInDb++;
        }
      }

      return {
        synced,
        orphanedInDb,
        orphanedInS3: 0, // Would need to list S3 bucket to find orphaned files
      };
    } catch (error) {
      logger.error('Error syncing files with S3:', error);
      throw new Error('Failed to sync files with S3');
    }
  }

  /**
   * Get file statistics for a user
   */
  async getUserFileStats(userId: string): Promise<{
    totalFiles: number;
    totalSize: number;
    fileTypeBreakdown: { mimeType: string; count: number; size: number }[];
  }> {
    try {
      const stats = await File.aggregate([
        { $match: { userId: userId, isDeleted: false } },
        {
          $group: {
            _id: '$mimeType',
            count: { $sum: 1 },
            size: { $sum: '$fileSize' },
          },
        },
        { $sort: { size: -1 } },
      ]);

      const totalFiles = stats.reduce((sum, stat) => sum + stat.count, 0);
      const totalSize = stats.reduce((sum, stat) => sum + stat.size, 0);

      const fileTypeBreakdown = stats.map((stat) => ({
        mimeType: stat._id,
        count: stat.count,
        size: stat.size,
      }));

      return {
        totalFiles,
        totalSize,
        fileTypeBreakdown,
      };
    } catch (error) {
      logger.error('Error getting user file stats:', error);
      throw new Error('Failed to get file statistics');
    }
  }

  /**
   * Upload single file to S3 and create database record
   */
  async uploadFile(
    userId: string,
    file: Express.Multer.File,
    options: {
      folder?: string;
      tags?: string[];
      makePublic?: boolean;
    } = {}
  ): Promise<UploadResult> {
    try {
      const { tags = [] } = options;

      // Generate unique filename
      const uniqueFileName = generateUniqueFilename(file.originalname);

      const s3Key = `${userId}/${uniqueFileName}`;

      logger.info(`Uploading file to S3:`, {
        userId,
        originalName: file.originalname,
        fileName: uniqueFileName,
        s3Key,
        fileSize: file.size,
        mimeType: file.mimetype,
      });

      // Upload to S3
      const uploadCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
        Metadata: {
          userId,
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
        },
        // Explicitly rely on bucket default ACL (private). Do NOT set public ACLs.
      });

      await this.s3Client.send(uploadCommand);

      logger.info(`Successfully uploaded file to S3: ${s3Key}`);

      // Create database record
      const fileRecord = new File({
        userId,
        fileName: uniqueFileName,
        originalName: file.originalname,
        s3Key,
        s3Bucket: this.bucketName,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date(),
        lastModified: new Date(),
        tags,
        isDeleted: false,
      });

      const savedFile = await fileRecord.save();

      logger.info(`Created database record for file: ${savedFile._id}`);

      // Generate file URL (presigned URL for private files, direct URL for public)
      // Always generate a presigned URL (files are private by default)
      const fileUrl = await this.generatePresignedUrl(s3Key, 3600); // 1 hour default

      return {
        id: savedFile._id.toString(),
        s3Key,
        fileName: uniqueFileName,
        originalName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileUrl,
        uploadedAt: savedFile.uploadedAt,
      };
    } catch (error) {
      logger.error('Error uploading file:', {
        error: error instanceof Error ? error.message : error,
        userId,
        fileName: file.originalname,
        fileSize: file.size,
      });

      // Handle specific S3 errors
      if (error instanceof Error) {
        if (error.message.includes('NoSuchBucket')) {
          throw new Error('S3 bucket not found. Please check configuration.');
        }
        if (error.message.includes('AccessDenied')) {
          throw new Error(
            'Access denied to S3 bucket. Please check permissions.'
          );
        }
        if (error.message.includes('InvalidBucketName')) {
          throw new Error('Invalid S3 bucket name configuration.');
        }
      }

      throw new Error(`Failed to upload file: ${file.originalname}`);
    }
  }

  /**
   * Upload multiple files to S3 and create database records
   */
  async uploadFiles(
    userId: string,
    files: Express.Multer.File[],
    options: {
      folder?: string;
      tags?: string[];
      makePublic?: boolean;
      continueOnError?: boolean;
    } = {}
  ): Promise<UploadResponse> {
    const { continueOnError = true } = options;
    const results: UploadResult[] = [];
    const errors: string[] = [];

    logger.info(`Starting batch upload for user ${userId}:`, {
      fileCount: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
    });

    for (const file of files) {
      try {
        const result = await this.uploadFile(userId, file, options);
        results.push(result);

        logger.debug(`Successfully uploaded file: ${file.originalname}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : `Failed to upload ${file.originalname}`;
        errors.push(errorMessage);

        logger.error(`Failed to upload file: ${file.originalname}`, error);

        // If not continuing on error, stop the process
        if (!continueOnError) {
          break;
        }
      }
    }

    const success = errors.length === 0;

    logger.info(`Batch upload completed for user ${userId}:`, {
      successful: results.length,
      failed: errors.length,
      success,
    });

    return {
      success,
      files: results,
      errors,
    };
  }

  /**
   * Delete file from S3 and mark as deleted in database
   */
  async deleteFile(userId: string, fileId: string): Promise<boolean> {
    try {
      // Find the file record
      const file = await File.findOne({
        _id: fileId,
        userId,
        isDeleted: false,
      });

      if (!file) {
        throw new Error('File not found or already deleted');
      }

      // Mark as deleted in database (soft delete)
      await File.findByIdAndUpdate(fileId, {
        isDeleted: true,
        deletedAt: new Date(),
      });

      logger.info(`Marked file as deleted in database: ${fileId}`);

      // Note: We're doing soft delete, so we don't actually delete from S3
      // This allows for potential recovery. To actually delete from S3,
      // you would use DeleteObjectCommand here.

      return true;
    } catch (error) {
      logger.error('Error deleting file:', {
        error: error instanceof Error ? error.message : error,
        userId,
        fileId,
      });
      throw new Error('Failed to delete file');
    }
  }

  /**
   * Update file metadata (tags, metadata) for a user's file
   */
  async updateFileMetadata(
    userId: string,
    fileId: string,
    updates: {
      tags?: string[];
      metadata?: Record<string, any>;
    }
  ): Promise<{
    id: string;
    fileName: string;
    originalName: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: Date;
    lastModified: Date;
    tags: string[];
    metadata: Record<string, any>;
  } | null> {
    try {
      const file = await File.findOne({ _id: fileId, userId, isDeleted: false });
      if (!file) {
        return null;
      }

      // Validate and sanitize inputs
      const nextUpdate: any = { lastModified: new Date() };

      if (Array.isArray(updates.tags)) {
        nextUpdate.tags = updates.tags
          .filter((t) => typeof t === 'string')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
      }

      if (updates.metadata && typeof updates.metadata === 'object' && !Array.isArray(updates.metadata)) {
        nextUpdate.metadata = updates.metadata;
      }

      const updated = await File.findByIdAndUpdate(
        fileId,
        nextUpdate,
        { new: true }
      ).lean();

      if (!updated) {
        return null;
      }

      logger.info('Updated file metadata', {
        userId,
        fileId,
        tagsUpdated: Array.isArray(nextUpdate.tags),
        metadataUpdated: !!nextUpdate.metadata,
      });

      return {
        id: updated._id.toString(),
        fileName: updated.fileName,
        originalName: updated.originalName,
        fileSize: updated.fileSize,
        mimeType: updated.mimeType,
        uploadedAt: updated.uploadedAt,
        lastModified: updated.lastModified,
        tags: updated.tags ?? [],
        metadata: updated.metadata ?? {},
      };
    } catch (error) {
      logger.error('Error updating file metadata', {
        error: error instanceof Error ? error.message : error,
        userId,
        fileId,
      });
      throw new Error('Failed to update file metadata');
    }
  }

  /**
   * Permanently delete a file from S3 and remove its DB record
   */
  async deleteFilePermanent(userId: string, fileId: string): Promise<boolean> {
    try {
      // Ensure ownership and file exists
      const file = await File.findOne({ _id: fileId, userId, isDeleted: false });
      if (!file) {
        return false;
      }

      // Delete object from S3
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: file.s3Bucket,
          Key: file.s3Key,
        })
      );

      logger.info('Deleted file from S3', {
        userId,
        fileId,
        bucket: file.s3Bucket,
        key: file.s3Key,
      });

      // Remove record from DB
      const deleted = await File.findByIdAndDelete(fileId);
      if (!deleted) {
        // Fallback: mark as deleted to maintain consistency
        await File.findByIdAndUpdate(fileId, {
          isDeleted: true,
          deletedAt: new Date(),
        });
        logger.warn('DB deletion failed; marked record as deleted', { userId, fileId });
      }

      logger.info('Removed file record from database', { userId, fileId });
      return true;
    } catch (error) {
      logger.error('Error permanently deleting file', {
        error: error instanceof Error ? error.message : error,
        userId,
        fileId,
      });
      throw new Error('Failed to permanently delete file');
    }
  }

  /**
   * Retrieve a file stream from S3 for a user with access verification.
   * Returns the readable stream along with useful metadata for setting headers.
   */
  async getFileStreamForUser(
    userId: string,
    fileId: string
  ): Promise<{
    stream: Readable;
    contentType: string;
    contentLength?: number;
    fileName: string;
    s3Key: string;
    lastModified?: Date;
    etag?: string;
  }> {
    try {
      const hasAccess = await this.canUserAccessFile(userId, fileId);
      if (!hasAccess) {
        throw new Error('ACCESS_DENIED');
      }

      const fileRecord = await File.findOne({ _id: fileId, isDeleted: false })
        .select(['s3Key', 's3Bucket', 'mimeType', 'originalName', 'fileName'])
        .lean();

      if (!fileRecord) {
        throw new Error('NOT_FOUND');
      }

      const command = new GetObjectCommand({
        Bucket: fileRecord.s3Bucket,
        Key: fileRecord.s3Key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error('NOT_FOUND');
      }

      const stream = response.Body as unknown as Readable;
      const contentType =
        response.ContentType || fileRecord.mimeType || 'application/octet-stream';

      const result: {
        stream: Readable;
        contentType: string;
        contentLength?: number;
        fileName: string;
        s3Key: string;
        lastModified?: Date;
        etag?: string;
      } = {
        stream,
        contentType,
        fileName: fileRecord.originalName || fileRecord.fileName,
        s3Key: fileRecord.s3Key,
      };

      if (response.ContentLength !== undefined) {
        result.contentLength = response.ContentLength;
      }
      if (response.LastModified !== undefined) {
        result.lastModified = response.LastModified;
      }
      if (response.ETag !== undefined) {
        result.etag = response.ETag;
      }

      return result;
    } catch (error: any) {
      if (error && typeof error.message === 'string') {
        if (error.message === 'ACCESS_DENIED' || error.message === 'NOT_FOUND') {
          throw error;
        }
      }
      logger.error('Error retrieving file stream from S3', {
        error: error instanceof Error ? error.message : error,
        userId,
        fileId,
      });
      throw new Error('S3_STREAM_ERROR');
    }
  }
}

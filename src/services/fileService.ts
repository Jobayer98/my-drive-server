import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import File from '../models/File';
import logger from '../utils/logger';

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
              fileItem.presignedUrl = await this.generatePresignedUrl(
                file.s3Key,
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
   * Generate a presigned URL for file access
   */
  async generatePresignedUrl(
    s3Key: string,
    expirationSeconds: number = 3600
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expirationSeconds,
      });

      return presignedUrl;
    } catch (error) {
      logger.error(`Error generating presigned URL for key ${s3Key}:`, error);
      throw new Error('Failed to generate presigned URL');
    }
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
}

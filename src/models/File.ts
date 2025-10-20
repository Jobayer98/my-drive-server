import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IFile extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  folderId?: Types.ObjectId | null;
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  s3Bucket: string;
  uploadedAt: Date;
  lastModified: Date;
  isDeleted: boolean;
  tags?: string[];
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    [key: string]: any;
  };
}

const fileSchema = new Schema<IFile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    folderId: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    fileSize: {
      type: Number,
      required: true,
      min: 0,
    },
    mimeType: {
      type: String,
      required: true,
    },
    s3Key: {
      type: String,
      required: true,
      unique: true,
    },
    s3Bucket: {
      type: String,
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    lastModified: {
      type: Date,
      default: Date.now,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
fileSchema.index({ userId: 1, isDeleted: 1 }); // Main query for user files
fileSchema.index({ userId: 1, folderId: 1, isDeleted: 1 }); // Query files within a folder
fileSchema.index({ userId: 1, uploadedAt: -1 }); // Sort by upload date
fileSchema.index({ userId: 1, fileName: 1 }); // Search by filename
fileSchema.index({ userId: 1, mimeType: 1 }); // Filter by file type
// fileSchema.index({ s3Key: 1 }); // Unique constraint and S3 operations
fileSchema.index({ createdAt: 1 }); // For cleanup operations

// Compound indexes for complex queries
fileSchema.index({ userId: 1, isDeleted: 1, uploadedAt: -1 }); // Main listing with sort
fileSchema.index({ userId: 1, mimeType: 1, isDeleted: 1 }); // Filter by type

export default mongoose.model<IFile>('File', fileSchema);

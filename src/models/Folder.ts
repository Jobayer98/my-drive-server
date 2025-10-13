import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IFolder extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  isDeleted: boolean;
  parentId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const folderSchema = new Schema<IFolder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure folder name uniqueness per user (optional parent-based uniqueness could be added later)
folderSchema.index({ userId: 1, name: 1, isDeleted: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

// Additional indexes for common queries
folderSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IFolder>('Folder', folderSchema);
import mongoose, { Document, Schema, Types } from 'mongoose';

export type SharePermission = 'view' | 'download' | 'edit';
export type ShareType = 'file' | 'folder';

export interface IShare extends Document {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  type: ShareType;
  itemId: Types.ObjectId;
  token: string; // random, unique share token
  permissions: SharePermission[];
  allowedEmails?: string[]; // optional whitelist of recipients
  expiresAt?: Date | null;
  isRevoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const shareSchema = new Schema<IShare>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['file', 'folder'], required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, required: true, index: true },
    token: { type: String, required: true, unique: true },
    permissions: {
      type: [String],
      enum: ['view', 'download', 'edit'],
      default: ['view'],
    },
    allowedEmails: [{ type: String, trim: true }],
    expiresAt: { type: Date, default: null },
    isRevoked: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Helpful indexes
shareSchema.index({ token: 1 }, { unique: true });
shareSchema.index({ ownerId: 1, type: 1, itemId: 1, isRevoked: 1 });
shareSchema.index({ expiresAt: 1 });

export default mongoose.model<IShare>('Share', shareSchema);
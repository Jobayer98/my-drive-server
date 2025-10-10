import mongoose, { Document, Schema } from 'mongoose';

export interface IBlockedToken extends Document {
  tokenId: string;
  userId: string;
  tokenType: 'access' | 'refresh';
  blockedAt: Date;
  expiresAt: Date;
  reason?: string;
}

const blockedTokenSchema = new Schema<IBlockedToken>({
  tokenId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  tokenType: {
    type: String,
    enum: ['access', 'refresh'],
    required: true
  },
  blockedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // MongoDB TTL index for automatic cleanup
  },
  reason: {
    type: String,
    default: 'Token refresh'
  }
});

// Compound index for efficient queries
blockedTokenSchema.index({ tokenId: 1, tokenType: 1 });
blockedTokenSchema.index({ userId: 1, tokenType: 1 });

export default mongoose.model<IBlockedToken>('BlockedToken', blockedTokenSchema);
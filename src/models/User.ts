import mongoose, { Document, Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  name: string;
  storageUsed: number;
  storageLimit: number;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    storageUsed: {
      type: Number,
      default: 0,
    },
    storageLimit: {
      type: Number,
      default: 5 * 1024 * 1024 * 1024, // 5GB
    },
    refreshToken: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
userSchema.index({ refreshToken: 1 }); // For token refresh operations
userSchema.index({ createdAt: 1 }); // For user registration analytics
userSchema.index({ storageUsed: 1 }); // For storage usage queries
userSchema.index({ name: 1 }); // For user search functionality

// Compound indexes for common query patterns
userSchema.index({ email: 1, createdAt: -1 }); // Email with recent first
userSchema.index({ storageUsed: 1, storageLimit: 1 }); // Storage analytics

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>('User', userSchema);

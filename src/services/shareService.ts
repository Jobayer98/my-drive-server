import crypto from 'crypto';
import mongoose from 'mongoose';
import Share, { SharePermission, ShareType } from '../models/Share';
import File from '../models/File';
import Folder from '../models/Folder';
import logger from '../utils/logger';

export interface CreateShareInput {
  ownerId: string;
  type: ShareType;
  itemId: string;
  permissions: SharePermission[];
  expiresAt?: Date | null;
  allowedEmails?: string[];
}

export class ShareService {
  async validateOwnership(ownerId: string, type: ShareType, itemId: string): Promise<boolean> {
    const isValidId = mongoose.Types.ObjectId.isValid(itemId);
    if (!isValidId) return false;

    if (type === 'file') {
      const f = await File.findOne({ _id: itemId, userId: ownerId, isDeleted: false }).select({ _id: 1 }).lean();
      return !!f;
    } else {
      const d = await Folder.findOne({ _id: itemId, userId: ownerId, isDeleted: false }).select({ _id: 1 }).lean();
      return !!d;
    }
  }

  private generateToken(): string {
    return crypto.randomBytes(24).toString('hex'); // 48-char hex
  }

  private normalizePermissions(perms: SharePermission[]): SharePermission[] {
    const allowed: SharePermission[] = ['view', 'download', 'edit'];
    const unique = Array.from(new Set(perms || []));
    const filtered = unique.filter((p): p is SharePermission => allowed.includes(p as SharePermission));
    if (filtered.length === 0) return ['view'];
    return filtered;
  }

  async createShare(input: CreateShareInput): Promise<{
    id: string;
    token: string;
    url: string;
    type: ShareType;
    itemId: string;
    permissions: SharePermission[];
    expiresAt?: Date | null;
    allowedEmails?: string[];
  }> {
    const { ownerId, type, itemId } = input;

    // Ownership validation
    const owns = await this.validateOwnership(ownerId, type, itemId);
    if (!owns) {
      throw new Error('ACCESS_DENIED');
    }

    const permissions = this.normalizePermissions(input.permissions);
    const token = this.generateToken();

    // Optional expiration must be future
    let expiresAt: Date | null | undefined = input.expiresAt ?? null;
    if (expiresAt) {
      const now = new Date();
      if (expiresAt <= now) {
        throw new Error('INVALID_EXPIRY');
      }
    }

    const allowedEmails = Array.isArray(input.allowedEmails)
      ? input.allowedEmails.filter((e) => typeof e === 'string' && e.trim().length > 0)
      : undefined;

    const share = await Share.create({
      ownerId,
      type,
      itemId,
      token,
      permissions,
      expiresAt: expiresAt ?? null,
      allowedEmails,
    });

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const url = `${baseUrl}/api/v1/share/${token}`;

    logger.info('Share created', { ownerId, type, itemId, permissions, expiresAt, allowedEmails });

    return {
      id: share._id.toString(),
      token,
      url,
      type,
      itemId,
      permissions,
      expiresAt: share.expiresAt ?? null,
      ...(Array.isArray(share.allowedEmails) && share.allowedEmails.length > 0
        ? { allowedEmails: share.allowedEmails }
        : {}),
    };
  }

  async getShareByToken(token: string): Promise<any | null> {
    const share = await Share.findOne({ token, isRevoked: false }).lean();
    if (!share) return null;

    // Check expiry
    if (share.expiresAt && share.expiresAt <= new Date()) {
      return null;
    }

    // Attach basic item details
    let item: any = null;
    if (share.type === 'file') {
      item = await File.findOne({ _id: share.itemId, isDeleted: false }).lean();
    } else {
      item = await Folder.findOne({ _id: share.itemId, isDeleted: false }).lean();
    }
    if (!item) return null;

    return { ...share, item };
  }

  async revokeShare(id: string, ownerId: string): Promise<boolean> {
    const updated = await Share.findOneAndUpdate(
      { _id: id, ownerId, isRevoked: false },
      { $set: { isRevoked: true, updatedAt: new Date() } },
      { new: true }
    ).select({ _id: 1 }).lean();
    if (!updated) return false;
    logger.info('Share revoked', { id, ownerId });
    return true;
  }
}
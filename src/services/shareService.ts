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

  async listShares(ownerId: string): Promise<Array<{
    id: string;
    type: ShareType;
    itemId: string;
    token: string;
    permissions: SharePermission[];
    expiresAt?: Date | null;
    allowedEmails?: string[];
    isRevoked: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>> {
    const shares = await Share.find({ ownerId }).sort({ createdAt: -1 }).lean();
    return shares.map((s) => ({
      id: s._id.toString(),
      type: s.type as ShareType,
      itemId: s.itemId.toString(),
      token: s.token,
      permissions: s.permissions as SharePermission[],
      expiresAt: s.expiresAt ?? null,
      ...(Array.isArray(s.allowedEmails) && s.allowedEmails.length ? { allowedEmails: s.allowedEmails } : {}),
      isRevoked: !!s.isRevoked,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async updateShare(
    id: string,
    ownerId: string,
    patch: {
      permissions?: SharePermission[];
      expiresAt?: Date | null;
      allowedEmails?: string[];
      isRevoked?: boolean;
    }
  ): Promise<{
    id: string;
    type: ShareType;
    itemId: string;
    token: string;
    permissions: SharePermission[];
    expiresAt?: Date | null;
    allowedEmails?: string[];
    isRevoked: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    const update: any = {};

    if (patch.permissions) {
      update.permissions = this.normalizePermissions(patch.permissions);
    }

    if (patch.expiresAt !== undefined) {
      let expires: Date | null = patch.expiresAt ?? null;
      if (expires) {
        const now = new Date();
        if (expires <= now) {
          throw new Error('INVALID_EXPIRY');
        }
      }
      update.expiresAt = expires;
    }

    if (patch.allowedEmails !== undefined) {
      update.allowedEmails = Array.isArray(patch.allowedEmails)
        ? patch.allowedEmails.filter((e) => typeof e === 'string' && e.trim().length > 0)
        : [];
    }

    if (typeof patch.isRevoked === 'boolean') {
      update.isRevoked = patch.isRevoked;
    }

    if (Object.keys(update).length === 0) {
      return null;
    }

    const updated = await Share.findOneAndUpdate(
      { _id: id, ownerId },
      { $set: update },
      { new: true }
    ).lean();

    if (!updated) return null;

    return {
      id: updated._id.toString(),
      type: updated.type as ShareType,
      itemId: updated.itemId.toString(),
      token: updated.token,
      permissions: updated.permissions as SharePermission[],
      expiresAt: updated.expiresAt ?? null,
      ...(Array.isArray(updated.allowedEmails) && updated.allowedEmails.length ? { allowedEmails: updated.allowedEmails } : {}),
      isRevoked: !!updated.isRevoked,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
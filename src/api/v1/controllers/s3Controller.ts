import { Request, Response } from 'express';
import { listObjectsUnderPrefix } from '../../../services/s3FolderService';
import logger from '../../../utils/logger';

function sanitizeSegment(segment?: string): string {
  if (!segment) return '';
  return segment
    .trim()
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

export async function listS3Objects(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const baseRaw = (req.query.base as string) || 'files';
    const base = baseRaw === 'folders' ? 'folders' : 'files';
    const pathRaw = (req.query.path as string) || '';
    const recursive = String(req.query.recursive || 'false').toLowerCase() === 'true';
    const maxKeys = Math.min(Math.max(parseInt(String(req.query.maxKeys || '100'), 10) || 100, 1), 1000);
    const continuationToken = (req.query.continuationToken as string) || undefined;

    const path = sanitizeSegment(pathRaw);

    let prefix: string;
    if (base === 'folders') {
      prefix = `folders/${userId}/` + (path ? `${path}/` : '');
    } else {
      prefix = `${userId}/` + (path ? `${path}` : '');
    }

    logger.info('Listing S3 objects', { userId, base, prefix, recursive, maxKeys });

    const options: { recursive?: boolean; maxKeys?: number; continuationToken?: string } = {
      recursive,
      maxKeys,
    };
    if (typeof continuationToken === 'string') {
      options.continuationToken = continuationToken;
    }

    const result = await listObjectsUnderPrefix(prefix, options);

    return res.status(200).json({
      base,
      prefix,
      path,
      recursive,
      maxKeys,
      objects: result.objects,
      prefixes: result.prefixes,
      nextContinuationToken: result.nextContinuationToken,
      isTruncated: result.isTruncated,
      count: result.count,
    });
  } catch (error: any) {
    logger.error('Error listing S3 objects', {
      error: error?.message || error,
      query: req.query,
      userId: (req as any).user?.id,
    });

    const msg = typeof error?.message === 'string' ? error.message : 'Failed to list S3 objects';
    if (msg.includes('Access denied')) {
      return res.status(403).json({ error: msg });
    }
    if (msg.includes('bucket not found')) {
      return res.status(404).json({ error: msg });
    }
    return res.status(500).json({ error: 'Failed to list S3 objects' });
  }
}
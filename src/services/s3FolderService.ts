import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  HeadBucketCommand,
  CopyObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import logger from '../utils/logger';

const REGION = process.env.AWS_REGION!;
const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID!;
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY!;
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;

function assertAwsEnv() {
  if (!REGION || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET_NAME) {
    throw new Error('Missing AWS configuration environment variables');
  }
}

function buildClient(): S3Client {
  assertAwsEnv();
  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });
}

function sanitizeSegment(segment: string): string {
  return segment
    .trim()
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .replace(/\/+$/g, '')
    .replace(/^\/+/, '');
}

function userFolderPrefix(userId: string, folderName?: string): string {
  const base = `folders/${sanitizeSegment(userId)}/`;
  if (!folderName) return base;
  return `${base}${sanitizeSegment(folderName)}/`;
}

function buildUserFolderPrefix(userId: string, segments: string[] = []): string {
  const base = `folders/${sanitizeSegment(userId)}/`;
  if (!segments.length) return base;
  const path = segments.map(sanitizeSegment).filter(Boolean).join('/') + '/';
  return base + path;
}

async function listAllKeysUnderPrefix(prefix: string): Promise<string[]> {
  const s3 = buildClient();
  const keys: string[] = [];
  let ContinuationToken: string | undefined = undefined;

  do {
    const resp: ListObjectsV2CommandOutput = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken,
      })
    );
    for (const obj of resp.Contents || []) {
      if (obj.Key) keys.push(obj.Key);
    }
    ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (ContinuationToken);

  return keys;
}

export async function renameNestedUserFolderInS3(
  userId: string,
  oldSegments: string[],
  newSegments: string[]
): Promise<{ movedCount: number }> {
  const s3 = buildClient();
  const oldPrefix = buildUserFolderPrefix(userId, oldSegments);
  const newPrefix = buildUserFolderPrefix(userId, newSegments);

  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));

    const keys = await listAllKeysUnderPrefix(oldPrefix);
    const copied: string[] = [];

    for (const key of keys) {
      const newKey = key.replace(oldPrefix, newPrefix);
      await s3.send(
        new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${encodeURIComponent(key)}`,
          Key: newKey,
        })
      );
      copied.push(newKey);
    }

    if (keys.length) {
      // Delete originals in batches of 1000
      const batchSize = 1000;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: { Objects: batch.map((Key) => ({ Key })) },
          })
        );
      }
    }

    // Ensure new folder marker exists
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: newPrefix,
        Body: '',
        ContentType: 'application/x-directory',
      })
    );

    logger.info(`Renamed S3 folder subtree: ${oldPrefix} -> ${newPrefix}`);
    return { movedCount: keys.length };
  } catch (error: any) {
    logger.error('Failed to rename S3 folder subtree', {
      bucket: BUCKET_NAME,
      oldPrefix,
      newPrefix,
      error: error?.message || error,
    });
    throw new Error('Failed to rename folder in S3');
  }
}

export async function deleteUserFolderTreeInS3(
  userId: string,
  segments: string[]
): Promise<{ deletedCount: number }> {
  const s3 = buildClient();
  const prefix = buildUserFolderPrefix(userId, segments);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    const keys = await listAllKeysUnderPrefix(prefix);
    if (keys.length) {
      const batchSize = 1000;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: { Objects: batch.map((Key) => ({ Key })) },
          })
        );
      }
    }
    // Remove the folder marker itself
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: { Objects: [{ Key: prefix }] },
      })
    );
    logger.info(`Deleted S3 folder subtree: ${prefix}`);
    return { deletedCount: keys.length + 1 };
  } catch (error: any) {
    logger.error('Failed to delete S3 folder subtree', {
      bucket: BUCKET_NAME,
      prefix,
      error: error?.message || error,
    });
    if (error?.$metadata?.httpStatusCode === 403) {
      throw new Error('Access denied to S3 bucket');
    }
    if (error?.$metadata?.httpStatusCode === 404) {
      throw new Error('S3 bucket not found');
    }
    throw new Error('Failed to delete folder in S3');
  }
}

/**
 * Create a logical folder in S3 by writing a zero-byte object with a trailing slash.
 *
 * Usage example:
 *   await createUserFolderInS3('507f1f77bcf86cd799439011', 'Documents');
 */
export async function createUserFolderInS3(
  userId: string,
  folderName: string
): Promise<{ key: string }> {
  const s3 = buildClient();
  const key = userFolderPrefix(userId, folderName);

  try {
    // Validate bucket access first for clearer errors
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: '',
        ContentType: 'application/x-directory',
        // Consider default encryption via bucket policy
      })
    );

    logger.info(`Created S3 folder prefix: ${key}`);
    return { key };
  } catch (error: any) {
    const code = error?.$metadata?.httpStatusCode || error?.name;
    logger.error('Failed to create S3 folder', { key, bucket: BUCKET_NAME, code, error: error?.message || error });

    if (code === 403) {
      throw new Error('Access denied to S3 bucket');
    }
    if (code === 404) {
      throw new Error('S3 bucket not found');
    }
    if (code === 'InvalidBucketName') {
      throw new Error('Invalid S3 bucket name');
    }
    throw new Error('Failed to create folder in S3');
  }
}

export async function createNestedUserFolderInS3(
  userId: string,
  segments: string[]
): Promise<{ key: string }> {
  const s3 = buildClient();
  const key = buildUserFolderPrefix(userId, segments);

  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: '',
        ContentType: 'application/x-directory',
      })
    );

    logger.info(`Created nested S3 folder prefix: ${key}`);
    return { key };
  } catch (error: any) {
    const code = error?.$metadata?.httpStatusCode || error?.name;
    logger.error('Failed to create nested S3 folder', { key, bucket: BUCKET_NAME, code, error: error?.message || error });

    if (code === 403) {
      throw new Error('Access denied to S3 bucket');
    }
    if (code === 404) {
      throw new Error('S3 bucket not found');
    }
    throw new Error('Failed to create folder in S3');
  }
}

/**
 * List immediate child folders for a user (based on CommonPrefixes).
 *
 * Usage example:
 *   const result = await listUserFoldersInS3('507f1f77bcf86cd799439011');
 *   // result.folders -> [ { name: 'Documents', prefix: 'folders/<userId>/Documents/' } ]
 */
export async function listUserFoldersInS3(
  userId: string
): Promise<{ folders: { name: string; prefix: string }[]; totalCount: number }> {
  const s3 = buildClient();
  const Prefix = userFolderPrefix(userId);
  const Delimiter = '/';

  try {
    const folders: { name: string; prefix: string }[] = [];
    let ContinuationToken: string | undefined = undefined;

    do {
      const resp: ListObjectsV2CommandOutput = await s3.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix,
          Delimiter,
          ContinuationToken,
        })
      );

      const commons = resp.CommonPrefixes || [];
      for (const cp of commons) {
        const prefix = cp.Prefix!;
        const segments = prefix.replace(Prefix, '').split('/').filter(Boolean);
        const name = segments[0] || '';
        if (name) {
          folders.push({ name, prefix });
        }
      }

      ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (ContinuationToken);

    return { folders, totalCount: folders.length };
  } catch (error: any) {
    const code = error?.$metadata?.httpStatusCode || error?.name;
    logger.error('Failed to list user folders in S3', { Prefix, bucket: BUCKET_NAME, code, error: error?.message || error });

    if (code === 403) {
      throw new Error('Access denied to S3 bucket');
    }
    if (code === 404) {
      throw new Error('S3 bucket not found');
    }
    throw new Error('Failed to list folders in S3');
  }
}

export async function listUserChildFoldersInS3(
  userId: string,
  segments: string[] = []
): Promise<{ folders: { name: string; prefix: string }[]; totalCount: number }> {
  const s3 = buildClient();
  const Prefix = buildUserFolderPrefix(userId, segments);
  const Delimiter = '/';

  try {
    const folders: { name: string; prefix: string }[] = [];
    let ContinuationToken: string | undefined = undefined;

    do {
      const resp: ListObjectsV2CommandOutput = await s3.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix,
          Delimiter,
          ContinuationToken,
        })
      );

      const commons = resp.CommonPrefixes || [];
      for (const cp of commons) {
        const prefix = cp.Prefix!;
        const rel = prefix.replace(Prefix, '').split('/').filter(Boolean);
        const name = rel[0] || '';
        if (name) {
          folders.push({ name, prefix });
        }
      }

      ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (ContinuationToken);

    return { folders, totalCount: folders.length };
  } catch (error: any) {
    const code = error?.$metadata?.httpStatusCode || error?.name;
    logger.error('Failed to list user child folders in S3', { Prefix, bucket: BUCKET_NAME, code, error: error?.message || error });

    if (code === 403) {
      throw new Error('Access denied to S3 bucket');
    }
    if (code === 404) {
      throw new Error('S3 bucket not found');
    }
    throw new Error('Failed to list folders in S3');
  }
}

/**
 * List top-level folders in a bucket under a given prefix.
 * Provide `prefix` to scope listings (default 'folders/').
 *
 * Usage example:
 *   const all = await listFoldersInBucket('folders/');
 */
export async function listFoldersInBucket(
  prefix: string = 'folders/'
): Promise<{ folders: string[]; totalCount: number }> {
  const s3 = buildClient();
  const Delimiter = '/';

  try {
    const names: string[] = [];
    let ContinuationToken: string | undefined = undefined;

    do {
      const resp: ListObjectsV2CommandOutput = await s3.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: prefix,
          Delimiter,
          ContinuationToken,
        })
      );

      const commons = resp.CommonPrefixes || [];
      for (const cp of commons) {
        const p = cp.Prefix!;
        const rel = p.replace(prefix, '').replace(/\/$/, '');
        if (rel) names.push(rel);
      }

      ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (ContinuationToken);

    return { folders: names, totalCount: names.length };
  } catch (error: any) {
    const code = error?.$metadata?.httpStatusCode || error?.name;
    logger.error('Failed to list bucket folders in S3', { prefix, bucket: BUCKET_NAME, code, error: error?.message || error });

    if (code === 403) {
      throw new Error('Access denied to S3 bucket');
    }
    if (code === 404) {
      throw new Error('S3 bucket not found');
    }
    throw new Error('Failed to list folders in S3');
  }
}
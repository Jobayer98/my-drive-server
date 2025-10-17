/**
 * Verify transfer operations for files (DB association + S3 existence) and folders (S3 rename).
 *
 * Usage examples:
 *   node scripts/verify-transfer.js --mode file --userId <uid> --fileId <fid> [--expectFolderId <destId>]
 *   node scripts/verify-transfer.js --mode folder --userId <uid> --oldSegments "Parent/Child" --newSegments "NewParent/Child" [--expectedMovedCount 3]
 */

const { S3Client, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const mongoose = require('mongoose');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function assertEnv() {
  const req = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME'];
  const missing = req.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing AWS env vars: ${missing.join(', ')}`);
  }
}

function buildS3Client() {
  assertEnv();
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

function sanitizeSegment(segment) {
  return String(segment)
    .trim()
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .replace(/\/+$/g, '')
    .replace(/^\+/, '');
}

function buildUserFolderPrefix(userId, segments = []) {
  const base = `folders/${sanitizeSegment(userId)}/`;
  if (!segments.length) return base;
  const path = segments.map(sanitizeSegment).filter(Boolean).join('/') + '/';
  return base + path;
}

async function listKeysUnderPrefix(s3, bucket, prefix) {
  const keys = [];
  let token;
  do {
    const resp = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    (resp.Contents || []).forEach((o) => o.Key && keys.push(o.Key));
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function verifyFile({ userId, fileId, expectFolderId }) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mydrive';
  await mongoose.connect(mongoUri);

  // Minimal File schema just for read
  const FileSchema = new mongoose.Schema(
    {
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      folderId: { type: mongoose.Schema.Types.ObjectId, required: false },
      s3Key: { type: String, required: true },
      s3Bucket: { type: String, required: true },
      isDeleted: { type: Boolean, default: false },
    },
    { collection: 'files' }
  );
  const File = mongoose.models.File || mongoose.model('File', FileSchema);

  const doc = await File.findOne({ _id: fileId, userId, isDeleted: false }).lean();
  if (!doc) {
    console.error('File not found or access denied');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('DB Record:');
  console.log({
    id: String(doc._id),
    userId: String(doc.userId),
    folderId: doc.folderId ? String(doc.folderId) : null,
    s3Bucket: doc.s3Bucket,
    s3Key: doc.s3Key,
  });

  if (expectFolderId !== undefined) {
    const matches = (doc.folderId ? String(doc.folderId) : null) === (expectFolderId || null);
    console.log(`Folder association matches expected: ${matches}`);
    if (!matches) {
      await mongoose.disconnect();
      process.exit(2);
    }
  }

  const s3 = buildS3Client();
  try {
    await s3.send(new HeadObjectCommand({ Bucket: doc.s3Bucket, Key: doc.s3Key }));
    console.log('S3 object exists and is accessible');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Failed to verify S3 object:', err && err.message ? err.message : err);
    await mongoose.disconnect();
    process.exit(3);
  }
}

async function verifyFolder({ userId, oldSegments, newSegments, expectedMovedCount }) {
  const s3 = buildS3Client();
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  const oldPrefix = buildUserFolderPrefix(userId, oldSegments);
  const newPrefix = buildUserFolderPrefix(userId, newSegments);

  const oldKeys = await listKeysUnderPrefix(s3, bucket, oldPrefix);
  const newKeys = await listKeysUnderPrefix(s3, bucket, newPrefix);

  console.log('S3 Folder Verification:');
  console.log({ oldPrefix, oldCount: oldKeys.length, newPrefix, newCount: newKeys.length });

  const moved = oldKeys.length === 0 && newKeys.length > 0;
  if (!moved) {
    console.error('Folder rename not fully verified: old keys remain or new keys missing');
    process.exit(4);
  }

  if (expectedMovedCount !== undefined) {
    const matches = Number(expectedMovedCount) === newKeys.length;
    console.log(`Expected moved count matches: ${matches}`);
    if (!matches) process.exit(5);
  }

  console.log('S3 folder rename verified successfully');
  process.exit(0);
}

(async function main() {
  try {
    const args = parseArgs();
    const mode = args.mode;
    if (!mode) throw new Error('Missing --mode file|folder');

    if (mode === 'file') {
      if (!args.userId || !args.fileId) throw new Error('Missing --userId and/or --fileId');
      await verifyFile({ userId: args.userId, fileId: args.fileId, expectFolderId: args.expectFolderId });
    } else if (mode === 'folder') {
      if (!args.userId || !args.oldSegments || !args.newSegments) {
        throw new Error('Missing --userId, --oldSegments and/or --newSegments');
      }
      const oldSeg = String(args.oldSegments).split('/').filter(Boolean);
      const newSeg = String(args.newSegments).split('/').filter(Boolean);
      await verifyFolder({ userId: args.userId, oldSegments: oldSeg, newSegments: newSeg, expectedMovedCount: args.expectedMovedCount });
    } else {
      throw new Error(`Unknown mode: ${mode}`);
    }
  } catch (err) {
    console.error('Verification script error:', err && err.message ? err.message : err);
    process.exit(10);
  }
})();
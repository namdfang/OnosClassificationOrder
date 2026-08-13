import { createReadStream } from 'fs';

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

import { config } from './config';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
});

export async function getObjectStream(key: string): Promise<{ body: Readable; contentType?: string }> {
  const res = await s3.send(new GetObjectCommand({ Bucket: config.r2.bucket, Key: key }));
  return { body: res.Body as Readable, contentType: res.ContentType };
}

export async function putObjectFromFile(key: string, filePath: string, contentType: string): Promise<void> {
  const { statSync } = await import('fs');
  await s3.send(
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: statSync(filePath).size,
      ContentType: contentType,
      // Key theo sha nội dung → không bao giờ đổi → cache CDN vĩnh viễn.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

export async function putObjectBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: key }));
  } catch (err) {
    console.warn(`[r2] delete ${key} failed: ${(err as Error).message}`);
  }
}

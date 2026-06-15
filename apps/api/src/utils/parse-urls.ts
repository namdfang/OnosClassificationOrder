import { ConfigService } from '@nestjs/config';
import type { Document } from 'mongoose';

import { UploadService } from '@/modules/upload/upload.service';
import { ApiConfigService } from '@/shared/services';

type FileDocument = Document & {
  url: string;
  previewUrl?: string;
  thumbUrl?: string;
  isGoogleDrive?: boolean;
};

const configService = new ApiConfigService(new ConfigService());

// eslint-disable-next-line sonarjs/cognitive-complexity
export function parseUrls<T extends FileDocument>(fileDocument: T) {
  if (fileDocument.isGoogleDrive) {
    delete fileDocument.isGoogleDrive;

    if (fileDocument.url && fileDocument.url.includes('drive.google.com')) {
      const imageId = UploadService.getGDriveFileId(fileDocument.url);

      fileDocument.url = `https://drive.google.com/uc?export=download&id=${imageId}`;
      fileDocument.previewUrl = `${configService.GDriveCDNUrl}/preview/${imageId}`;
      fileDocument.thumbUrl = `${configService.GDriveCDNUrl}/thumb/${imageId}`;

      return;
    }

    if (fileDocument.url && !fileDocument.url.includes('http')) {
      fileDocument.url = `${configService.GDriveCDNUrl}/original/${fileDocument.url}`;
    }

    if (fileDocument.previewUrl && !fileDocument.previewUrl.includes('http')) {
      fileDocument.previewUrl = `${configService.GDriveCDNUrl}/preview/${fileDocument.previewUrl}`;
    }

    if (fileDocument.thumbUrl && !fileDocument.thumbUrl.includes('http')) {
      fileDocument.thumbUrl = `${configService.GDriveCDNUrl}/thumb/${fileDocument.thumbUrl}`;
    }

    return;
  }

  const bucketName = process.env.AWS_S3_IMAGES_BUCKET_NAME || '';
  const stripBucket = (path: string) => (bucketName && path.startsWith(bucketName + '/') ? path.slice(bucketName.length + 1) : path);

  if (fileDocument.url && !fileDocument.url.includes('http')) {
    fileDocument.url = `${process.env.CDN_URL}/${stripBucket(fileDocument.url)}`;
  }

  if (fileDocument.previewUrl && !fileDocument.previewUrl.includes('http')) {
    fileDocument.previewUrl = `${process.env.CDN_URL}/${stripBucket(fileDocument.previewUrl)}`;
  }

  if (fileDocument.thumbUrl && !fileDocument.thumbUrl.includes('http')) {
    fileDocument.thumbUrl = `${process.env.CDN_URL}/${stripBucket(fileDocument.thumbUrl)}`;
  }
}

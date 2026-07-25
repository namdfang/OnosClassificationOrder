import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import Bottleneck from 'bottleneck';
import type { IFile, UploadedFileDto } from 'core';
import { AwsS3Service, BackblazeService } from 'core';
import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import type { ResImageDto } from 'shared';
import { ImageType, myNanoid, Status } from 'shared';
import sharp from 'sharp';
import { URL } from 'url';

import type { UserDocument } from '@/modules/user/user.entity';
import { ApiConfigService } from '@/shared/services';
import { parseUrls } from '@/utils';

import type { ImageDocument, ImageEntity } from './image.entity';
import { ImageRepository } from './image.repository';
import { UniqueImageRepository } from './unique-image.repository';

const MIN_DPI = 72;
const ORIGINAL_SUFFIX = '-original';
const THUMBNAIL_SUFFIX = '-thumb';
const PREVIEW_SUFFIX = '-preview';

const IMAGE_EXTENSIONS = /(jpg|jpeg|png|webp)$/i;

type ImageConfig = Record<
  ImageType,
  {
    folder: string;
    allowedExtensions: RegExp;
    minDimensions: number[];
    maxDimensions: number[];
    isSquare?: boolean;
    hasThumbnail?: boolean;
    noPreview?: boolean;
    preview: { quality: number; width: number };
    thumbnail: { quality: number; width: number };
  }
>;

const IMAGE_CONFIG: ImageConfig = {
  [ImageType.ProductImage]: {
    folder: 'images',
    allowedExtensions: /(jpg|jpeg|png)$/i,
    isSquare: true,
    minDimensions: [1000, 1000],
    maxDimensions: [3000, 3000],
    hasThumbnail: true,
    preview: { quality: 100, width: 500 },
    thumbnail: { quality: 90, width: 200 },
  },
  [ImageType.Mockup]: {
    folder: 'u-images/mockup',
    allowedExtensions: /(jpg|jpeg|png|webp)$/i,
    minDimensions: [200, 200],
    maxDimensions: [10_000, 10_000],
    preview: { quality: 90, width: 500 },
    thumbnail: { quality: 80, width: 200 },
  },
  [ImageType.SizeChart]: {
    folder: 'u-images/size-chart',
    allowedExtensions: /(jpg|jpeg|png|webp)$/i,
    minDimensions: [200, 200],
    maxDimensions: [10_000, 10_000],
    preview: { quality: 90, width: 800 },
    thumbnail: { quality: 80, width: 200 },
  },
  [ImageType.Artwork]: {
    folder: 'u-images/artwork',
    allowedExtensions: /(jpg|jpeg|png)$/i,
    minDimensions: [1000, 1000],
    maxDimensions: [10_000, 10_000],
    hasThumbnail: true,
    preview: { quality: 90, width: 500 },
    thumbnail: { quality: 80, width: 200 },
  },
  [ImageType.Avatar]: {
    folder: 'u-images/avatar',
    allowedExtensions: /(jpg|jpeg|png)$/i,
    minDimensions: [1000, 1000],
    maxDimensions: [10_000, 10_000],
    hasThumbnail: true,
    preview: { quality: 90, width: 500 },
    thumbnail: { quality: 80, width: 200 },
  },
  [ImageType.TopupImage]: {
    folder: 'topup-images',
    allowedExtensions: /(jpg|jpeg|png)$/i,
    minDimensions: [200, 200],
    maxDimensions: [3000, 3000],
    hasThumbnail: true,
    noPreview: true,
    preview: { quality: 90, width: 500 },
    thumbnail: { quality: 80, width: 200 },
  },
  [ImageType.ProductDescImage]: {
    folder: 'product-description-image',
    allowedExtensions: /(jpg|jpeg|png)$/i,
    isSquare: true,
    minDimensions: [600, 600],
    maxDimensions: [3000, 3000],
    hasThumbnail: true,
    preview: { quality: 100, width: 500 },
    thumbnail: { quality: 90, width: 200 },
  },
  [ImageType.Feedback]: {
    folder: 'feedback-images',
    allowedExtensions: /(jpg|jpeg|png|gif|webp)$/i,
    minDimensions: [50, 50],
    maxDimensions: [10_000, 10_000],
    hasThumbnail: true,
    preview: { quality: 85, width: 1200 },
    thumbnail: { quality: 75, width: 300 },
  },
};

@Injectable()
export class UploadService {
  downloadLimiter = new Bottleneck();

  constructor(
    private imageRepository: ImageRepository,
    private uniqueImageRepository: UniqueImageRepository,
    private readonly awsS3Service: AwsS3Service,
    private readonly configService: ApiConfigService,
    private readonly backblazeService: BackblazeService,
  ) {}

  async uploadImage(type: ImageType, file: IFile, user: UserDocument, folderId?: string): Promise<ResImageDto> {
    if (!file) {
      throw new BadRequestException('Upload image not found');
    }

    this.validateFileFormat(IMAGE_EXTENSIONS, file.originalname);

    const { sharpImage, metadata, sha1 } = await this.processImage(file);

    this.validateImageFormat(IMAGE_CONFIG[type].allowedExtensions, type, metadata.format);
    this.validateImageDimensions(metadata.width!, metadata.height!, type);
    this.validateDpi(type, metadata.density!);

    file.mimetype = `image/${metadata.format}`;

    const uploadedImage = await this.createImage(type, file, user, sharpImage, metadata, sha1, folderId);

    parseUrls(uploadedImage);

    return {
      _id: uploadedImage._id,
      fileName: uploadedImage.fileName,
      url: uploadedImage.url,
      previewUrl: uploadedImage.previewUrl,
      thumbUrl: uploadedImage.thumbUrl,
      status: uploadedImage.status,
    };
  }

  private async createImage(
    type: ImageType,
    file: IFile,
    user: UserDocument,
    sharpImage: sharp.Sharp,
    metadata: sharp.Metadata,
    sha1: string,
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    folderId?: string | '',
  ): Promise<ImageDocument> {
    const {
      preview,
      width: previewWidth,
      quality: previewQuality,
      height: previewHeight,
      fileSize: previewFileSize,
    } = await this.createPreview(file, sharpImage, metadata, type);

    const folder = IMAGE_CONFIG[type].folder;
    const imageId = myNanoid();

    const result = await Promise.all([
      this.awsS3Service.uploadImage(
        imageId + '_' + myNanoid(10),
        file,
        this.configService.awsS3Config.imagesBucketName,
        folder + ORIGINAL_SUFFIX,
      ),
      this.awsS3Service.uploadImage(
        imageId,
        preview,
        this.configService.awsS3Config.imagesBucketName,
        folder + PREVIEW_SUFFIX,
      ),
    ]);

    const uploadedOriginal: UploadedFileDto = result[0];
    const uploadedPreview: UploadedFileDto = result[1];

    const imageData: ImageEntity = {
      type,
      userId: user._id,
      key: uploadedOriginal.key,
      mimetype: file.mimetype,
      region: uploadedOriginal.region,
      objectId: uploadedOriginal.objectId,
      bucket: uploadedOriginal.bucket,
      fileSize: file.size,
      sha1,
      status: Status.Inactive,
      fileName: file.originalname,
      folderId: folderId || '',
      width: metadata.width!,
      height: metadata.height!,
      dpi: metadata.density!,
      url: uploadedOriginal.url,

      previewObjectId: uploadedPreview.objectId,
      previewKey: uploadedPreview.key,
      previewQuality,
      previewWidth,
      previewHeight,
      previewUrl: uploadedPreview.url,
      previewFileSize,
    };

    if (IMAGE_CONFIG[type].hasThumbnail) {
      const { thumbnail, width, height, quality, fileSize } = await this.createThumbnail(
        file,
        sharpImage,
        metadata,
        type,
      );
      imageData.thumbWidth = width;
      imageData.thumbHeight = height;
      imageData.thumbQuality = quality;
      imageData.thumbFileSize = fileSize;

      const uploadedThumbnail = await this.awsS3Service.uploadImage(
        imageId,
        thumbnail,
        this.configService.awsS3Config.imagesBucketName,
        folder + THUMBNAIL_SUFFIX,
      );

      imageData.thumbKey = uploadedThumbnail.key;
      imageData.thumbUrl = uploadedThumbnail.url;
      imageData.thumbObjectId = uploadedThumbnail.objectId;
    }

    return await this.imageRepository.create(imageData);
  }

  private validateFileFormat(allowedExtensions: RegExp, fileName: string): void {
    const format = fileName.split('.').pop();

    if (!format || !allowedExtensions.test(format)) {
      throw new BadRequestException('Unsupported file format');
    }
  }

  private async processImage(
    file: IFile,
  ): Promise<{ sharpImage: sharp.Sharp; metadata: sharp.Metadata; sha1: string }> {
    let sharpImage: sharp.Sharp;
    let metadata: sharp.Metadata;

    const sha1 = crypto.createHash('sha1');
    sha1.update(file.buffer);

    try {
      sharpImage = sharp(file.buffer);
      metadata = await sharpImage.metadata();
    } catch {
      throw new BadRequestException('Cannot get image metadata');
    }

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException('Cannot get image dimensions');
    }

    if (!metadata.density) {
      throw new BadRequestException('Cannot get image dpi');
    }

    return { sharpImage, metadata, sha1: sha1.digest('hex') };
  }

  private validateImageFormat(allowedExtensions: RegExp, type: ImageType, format?: string): void {
    const uploadErrorMessage: Partial<Record<ImageType, string>> = {
      [ImageType.Mockup]: 'Invalid mockup file',
      [ImageType.SizeChart]: 'Invalid size chart file',
      [ImageType.Artwork]: 'Artwork only support png file',
      [ImageType.ProductImage]: 'Invalid product image file',
      [ImageType.TopupImage]: 'Invalid topup image file',
    };

    if (!format || !allowedExtensions.test(format)) {
      throw new BadRequestException(uploadErrorMessage[type] || 'Invalid image file');
    }
  }

  private validateImageDimensions(width: number, height: number, type: ImageType): void {
    if (IMAGE_CONFIG[type].isSquare && width !== height) {
      throw new BadRequestException('Image must be square');
    }

    const minDimensions = IMAGE_CONFIG[type].minDimensions;
    const maxDimensions = IMAGE_CONFIG[type].maxDimensions;

    if (
      width < minDimensions[0] ||
      height < minDimensions[0] ||
      width > maxDimensions[0] ||
      height > maxDimensions[1]
    ) {
      throw new BadRequestException(
        `Image must be bigger than ${minDimensions.join('x')} and less than ${maxDimensions}`,
      );
    }
  }

  private validateDpi(type: ImageType, dpi: number): void {
    if (type === ImageType.Artwork && dpi < MIN_DPI) {
      throw new BadRequestException(`Artwork image must be more than ${MIN_DPI} DPI`);
    }
  }

  private async createPreview(
    file: IFile,
    sharpImage: sharp.Sharp,
    metadata: sharp.Metadata,
    type: ImageType,
  ): Promise<{ preview: IFile; quality: number; width: number; height: number; fileSize: number }> {
    const { quality, width } = IMAGE_CONFIG[type].preview;

    const preview: IFile = { ...file, fieldname: file.fieldname, mimetype: 'image/webp' };
    const previewImage = await sharpImage.clone().resize(width).webp({ quality }).toBuffer({ resolveWithObject: true });
    const height = previewImage.info.height;
    // @ts-expect-error buffer
    preview.buffer = previewImage.data.buffer;

    const fileSize = previewImage.data.byteLength;

    return { preview, quality, width, height, fileSize };
  }

  private async createThumbnail(
    file: IFile,
    sharpImage: sharp.Sharp,
    metadata: sharp.Metadata,
    type: ImageType,
  ): Promise<{ thumbnail: IFile; quality: number; width: number; height: number; fileSize: number }> {
    const { quality, width } = IMAGE_CONFIG[type].thumbnail;

    const thumbnail: IFile = { ...file, fieldname: file.fieldname, mimetype: 'image/webp' };
    const thumbnailImage = await sharpImage
      .clone()
      .resize(width)
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    const height = thumbnailImage.info.height;
    // @ts-expect-error buffer
    thumbnail.buffer = thumbnailImage.data.buffer;

    const fileSize = thumbnailImage.data.byteLength;

    return { thumbnail, quality, width, height, fileSize };
  }

  private isPrivateIp(ip: string): boolean {
    if (!net.isIP(ip)) return false;
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (ip === '::1' || ip === '0.0.0.0') return true;
    return false;
  }

  private async validateUrl(rawUrl: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException('Invalid URL format');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Only HTTP/HTTPS URLs are allowed');
    }
    const hostname = parsed.hostname;
    if (net.isIP(hostname)) {
      if (this.isPrivateIp(hostname)) {
        throw new BadRequestException('Requests to private/internal IPs are not allowed');
      }
      return;
    }
    const addresses = await new Promise<string[]>((resolve) => {
      dns.resolve4(hostname, (err, addrs) => {
        if (err) return resolve([]);
        resolve(addrs);
      });
    });
    for (const addr of addresses) {
      if (this.isPrivateIp(addr)) {
        throw new BadRequestException('Requests to private/internal IPs are not allowed');
      }
    }
  }

  private async downloadFile(url: string, type: ImageType, externalId: string): Promise<IFile> {
    await this.validateUrl(url);

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30_000,
      maxContentLength: 50 * 1024 * 1024,
    });

    const { headers, data } = response;

    const file: IFile = {
      encoding: 'base64',
      buffer: data,
      fieldname: 'file',
      mimetype: headers['content-type'],
      originalname: externalId + '.png',
      size: Buffer.byteLength(data as Buffer),
    };

    return file;
  }

  async downloadAndUploadImage(url: string, user: UserDocument, type: ImageType = ImageType.Artwork) {
    const externalId = `partner-${Date.now()}`;
    const file = await this.downloadLimiter.schedule(() => this.downloadFile(url, type, externalId));

    return await this.uploadImage(type, file, user);
  }
}

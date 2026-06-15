import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import { type HydratedDocument } from 'mongoose';
import { ID_LENGTH, ImageType, Status } from 'shared';

import type { UserDocument } from '@/modules/user/user.entity';

import type { ImageEntity } from './image.entity';

@DatabaseEntity({ collection: 'uniqueImages' })
export class UniqueImageEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, index: true, type: String, enum: ImageType })
  type: ImageType;

  @Prop({ length: ID_LENGTH, ref: 'UniqueImageEntity' })
  parentId?: string;

  @Prop({ type: [{ type: String, length: ID_LENGTH, ref: 'UniqueImageEntity' }] })
  childrenIds?: string;

  @Prop({ required: true, ref: 'UserEntity' })
  userId: string;

  @Prop({ required: true })
  mimetype: string;

  @Prop({ required: true })
  region: string;

  @Prop({ required: true })
  bucket: string;

  @Prop({ required: true, unique: true })
  sha1: string;

  @Prop({ required: true, index: true, type: String, enum: Status, default: Status.Inactive })
  status: Status;

  @Prop({ required: true })
  fileName: string;

  // original
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true })
  objectId: string;

  @Prop({ required: true })
  width: number;

  @Prop({ required: true })
  height: number;

  @Prop({ required: true })
  dpi: number;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  fileSize: number;

  // preview
  @Prop({ required: true })
  previewKey: string;

  @Prop({ required: true })
  previewObjectId: string;

  @Prop({ required: true })
  previewWidth: number;

  @Prop({ required: true })
  previewHeight: number;

  @Prop({ required: true })
  previewQuality: number;

  @Prop({ required: true })
  previewUrl: string;

  @Prop({ required: true })
  previewFileSize: number;

  // thumbnail
  @Prop()
  thumbKey?: string;

  @Prop()
  thumbObjectId?: string;

  @Prop()
  thumbWidth?: number;

  @Prop()
  thumbHeight?: number;

  @Prop()
  thumbQuality?: number;

  @Prop()
  thumbUrl?: string;

  @Prop()
  thumbFileSize?: number;
}

export const UniqueImageSchema = SchemaFactory.createForClass(UniqueImageEntity);

UniqueImageSchema.index({ sha1: 1, fileName: 1 }, { unique: true });

UniqueImageSchema.virtual('user', {
  ref: 'UserEntity',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

export type UniqueImageDocument = HydratedDocument<ImageEntity> & {
  parseUrls(): void;
  user?: UserDocument;
};

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { ImageDocument } from './image.entity';
import { ImageEntity } from './image.entity';
@Injectable()
export class ImageRepository extends DatabaseRepositoryAbstract<ImageEntity, ImageDocument> {
  constructor(
    @InjectModel(ImageEntity.name)
    private readonly imageModel: Model<ImageEntity>,
  ) {
    super(imageModel);
  }
}

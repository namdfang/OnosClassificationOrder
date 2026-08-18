import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { DesignFileDocument } from './design-file.entity';
import { DesignFileEntity } from './design-file.entity';

@Injectable()
export class DesignFileRepository extends DatabaseRepositoryAbstract<DesignFileEntity, DesignFileDocument> {
  constructor(@InjectModel(DesignFileEntity.name) private readonly designFileModel: Model<DesignFileEntity>) {
    super(designFileModel);
  }
}

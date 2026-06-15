import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import { SystemConfigDocument, SystemConfigEntity } from './system-config.entity';

@Injectable()
export class SystemConfigRepository extends DatabaseRepositoryAbstract<SystemConfigEntity, SystemConfigDocument> {
  constructor(
    @InjectModel(SystemConfigEntity.name)
    private readonly systemConfigModel: Model<SystemConfigEntity>,
  ) {
    super(systemConfigModel);
  }
}

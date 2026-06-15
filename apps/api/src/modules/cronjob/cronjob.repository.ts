import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { CronjobDocument } from '../cronjob/cronjob.entity';
import { CronjobEntity } from '../cronjob/cronjob.entity';
@Injectable()
export class CronjobRepository extends DatabaseRepositoryAbstract<CronjobEntity, CronjobDocument> {
  constructor(
    @InjectModel(CronjobEntity.name)
    private readonly cronjobModel: Model<CronjobEntity>,
  ) {
    super(cronjobModel);
  }
}

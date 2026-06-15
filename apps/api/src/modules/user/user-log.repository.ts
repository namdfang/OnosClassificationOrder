import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { UserLogDocument } from './user-log.entity';
import { UserLogEntity } from './user-log.entity';

@Injectable()
export class UserLogRepository extends DatabaseRepositoryAbstract<UserLogEntity, UserLogDocument> {
  constructor(
    @InjectModel(UserLogEntity.name)
    private readonly userLogModel: Model<UserLogEntity>,
  ) {
    super(userLogModel);
  }
}

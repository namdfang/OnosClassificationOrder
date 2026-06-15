import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { MailHistoryDocument } from './mail-history.entity';
import { MailHistoryEntity } from './mail-history.entity';

@Injectable()
export class MailHistoryRepository extends DatabaseRepositoryAbstract<MailHistoryEntity, MailHistoryDocument> {
  constructor(
    @InjectModel(MailHistoryEntity.name)
    private readonly mailHistoryModel: Model<MailHistoryEntity>,
  ) {
    super(mailHistoryModel);
  }
}

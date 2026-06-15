import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { MailTemplateDocument } from './mail-template.entity';
import { MailTemplateEntity } from './mail-template.entity';

@Injectable()
export class MailTemplateRepository extends DatabaseRepositoryAbstract<MailTemplateEntity, MailTemplateDocument> {
  constructor(
    @InjectModel(MailTemplateEntity.name)
    private readonly mailTemplateModel: Model<MailTemplateEntity>,
  ) {
    super(mailTemplateModel);
  }
}

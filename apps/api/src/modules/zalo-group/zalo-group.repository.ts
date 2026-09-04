import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { ZaloGroupLinkDocument } from './zalo-group-link.entity';
import { ZaloGroupLinkEntity } from './zalo-group-link.entity';

@Injectable()
export class ZaloGroupRepository extends DatabaseRepositoryAbstract<ZaloGroupLinkEntity, ZaloGroupLinkDocument> {
  constructor(
    @InjectModel(ZaloGroupLinkEntity.name) private readonly zaloGroupLinkModel: Model<ZaloGroupLinkEntity>,
  ) {
    super(zaloGroupLinkModel);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { ActionDocument } from './action.entity';
import { ActionEntity } from './action.entity';

@Injectable()
export class ActionRepository extends DatabaseRepositoryAbstract<ActionEntity, ActionDocument> {
  constructor(
    @InjectModel(ActionEntity.name)
    private readonly actionModel: Model<ActionEntity>,
  ) {
    super(actionModel);
  }
}

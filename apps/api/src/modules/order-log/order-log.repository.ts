import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { OrderLogDocument } from './order-log.entity';
import { OrderLogEntity } from './order-log.entity';

@Injectable()
export class OrderLogRepository extends DatabaseRepositoryAbstract<OrderLogEntity, OrderLogDocument> {
  constructor(@InjectModel(OrderLogEntity.name) private readonly orderLogModel: Model<OrderLogEntity>) {
    super(orderLogModel);
  }
}

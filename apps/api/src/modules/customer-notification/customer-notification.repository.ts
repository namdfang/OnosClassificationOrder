import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { CustomerNotificationDocument } from './customer-notification.entity';
import { CustomerNotificationEntity } from './customer-notification.entity';

@Injectable()
export class CustomerNotificationRepository extends DatabaseRepositoryAbstract<
  CustomerNotificationEntity,
  CustomerNotificationDocument
> {
  constructor(
    @InjectModel(CustomerNotificationEntity.name) private readonly customerNotificationModel: Model<CustomerNotificationEntity>,
  ) {
    super(customerNotificationModel);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { NotificationDocument } from './notification.entity';
import { NotificationEntity } from './notification.entity';

@Injectable()
export class NotificationRepository extends DatabaseRepositoryAbstract<NotificationEntity, NotificationDocument> {
  constructor(
    @InjectModel(NotificationEntity.name)
    private readonly notificationModel: Model<NotificationEntity>,
  ) {
    super(notificationModel);
  }
}

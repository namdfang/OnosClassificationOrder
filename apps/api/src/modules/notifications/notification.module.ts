import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UserEntity, UserSchema } from '../user/user.entity';
import { UserRepository } from '../user/user.repository';
import { NotificationController } from './notification.controller';
import { NotificationEntity, NotificationSchema } from './notification.entity';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: NotificationEntity.name,
        schema: NotificationSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: UserEntity.name,
        schema: UserSchema,
      },
    ]),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository, UserRepository],
  exports: [NotificationService],
})
export class NotificationModule {}

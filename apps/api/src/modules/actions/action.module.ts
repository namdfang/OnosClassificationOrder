import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { NotificationEntity, NotificationSchema } from '../notifications/notification.entity';
import { NotificationRepository } from '../notifications/notification.repository';
import { UserEntity, UserSchema } from '../user/user.entity';
import { UserRepository } from '../user/user.repository';
import { ActionController } from './action.controller';
import { ActionEntity, ActionSchema } from './action.entity';
import { ActionRepository } from './action.repository';
import { ActionService } from './action.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ActionEntity.name,
        schema: ActionSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: UserEntity.name,
        schema: UserSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: NotificationEntity.name,
        schema: NotificationSchema,
      },
    ]),
  ],
  controllers: [ActionController],
  providers: [ActionService, ActionRepository, UserRepository, NotificationRepository],
  exports: [ActionService],
})
export class ActionModule {}

import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SharedModule } from '@/shared/shared.module';

import { NotificationEntity, NotificationSchema } from '../notifications/notification.entity';
import { NotificationRepository } from '../notifications/notification.repository';
import { UserEntity, UserSchema } from '../user/user.entity';
import { UserRepository } from '../user/user.repository';
import { CronjobController } from './cronjob.controller';
import { CronjobEntity, CronjobSchema } from './cronjob.entity';
import { CronjobRepository } from './cronjob.repository';
import { CronjobService } from './cronjob.service';
import { CronjobRunnerService } from './cronjob-runner.service';
import { TestJob } from './jobs';

@Global()
@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([{ name: CronjobEntity.name, schema: CronjobSchema }]),
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
  controllers: [CronjobController],
  exports: [CronjobService],
  providers: [
    TestJob,
    CronjobRepository,
    UserRepository,
    CronjobService,
    CronjobRunnerService,
    NotificationRepository,
  ],
})
export class CronjobModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SharedModule } from '@/shared/shared.module';

import { UserEntity, UserSchema } from '../user/user.entity';
import { ImageEntity, ImageSchema } from './image.entity';
import { ImageRepository } from './image.repository';
import { UniqueImageEntity, UniqueImageSchema } from './unique-image.entity';
import { UniqueImageRepository } from './unique-image.repository';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      {
        name: ImageEntity.name,
        schema: ImageSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: UniqueImageEntity.name,
        schema: UniqueImageSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: UserEntity.name,
        schema: UserSchema,
      },
    ]),
  ],
  controllers: [UploadController],
  providers: [UploadService, ImageRepository, UniqueImageRepository],
  exports: [UploadService, ImageRepository, UniqueImageRepository],
})
export class UploadModule {}

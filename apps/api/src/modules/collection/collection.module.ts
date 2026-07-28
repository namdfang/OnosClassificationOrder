import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CollectionController } from './collection.controller';
import { CollectionEntity, CollectionSchema } from './collection.entity';
import { CollectionRepository } from './collection.repository';
import { CollectionService } from './collection.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: CollectionEntity.name, schema: CollectionSchema }])],
  controllers: [CollectionController],
  providers: [CollectionService, CollectionRepository],
  exports: [CollectionService, CollectionRepository],
})
export class CollectionModule {}

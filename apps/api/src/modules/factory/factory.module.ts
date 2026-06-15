import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FactoryController } from './factory.controller';
import { FactoryEntity, FactorySchema } from './factory.entity';
import { FactoryRepository } from './factory.repository';
import { FactoryService } from './factory.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: FactoryEntity.name, schema: FactorySchema }])],
  controllers: [FactoryController],
  providers: [FactoryService, FactoryRepository],
  exports: [FactoryService, FactoryRepository],
})
export class FactoryModule {}

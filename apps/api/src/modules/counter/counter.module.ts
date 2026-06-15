import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CounterController } from './counter.controller';
import { CounterEntity, CounterSchema } from './counter.entity';
import { CounterRepository } from './counter.repository';
import { CounterService } from './counter.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: CounterEntity.name, schema: CounterSchema }])],
  controllers: [CounterController],
  exports: [CounterService, CounterRepository],
  providers: [CounterService, CounterRepository],
})
export class CounterModule {}

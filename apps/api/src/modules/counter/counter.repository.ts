import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { CounterDocument } from '@/modules/counter/counter.entity';
import { CounterEntity } from '@/modules/counter/counter.entity';
@Injectable()
export class CounterRepository extends DatabaseRepositoryAbstract<CounterEntity, CounterDocument> {
  constructor(
    @InjectModel(CounterEntity.name)
    private readonly counterModel: Model<CounterEntity>,
  ) {
    super(counterModel);
  }
}

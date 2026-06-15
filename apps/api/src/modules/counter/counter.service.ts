import { Injectable, NotFoundException } from '@nestjs/common';
import type mongoose from 'mongoose';

import type { CounterType } from '@/constants';

import type { CounterDocument } from './counter.entity';
import { CounterRepository } from './counter.repository';

@Injectable()
export class CounterService {
  constructor(private counterRepository: CounterRepository) {}

  async findAndUpdateCounter(
    key: string,
    type: CounterType,
    session?: mongoose.ClientSession,
  ): Promise<CounterDocument> {
    let counter = await this.counterRepository.findOneAndUpdate({ key, type }, { $inc: { seq: 1 } }, { session });

    if (!counter) {
      counter = await this.counterRepository.create({ key, type, seq: 1 }, { session });

      if (!counter) {
        throw new NotFoundException('Counter not found');
      }
    }

    return counter;
  }

  async getCounter(key: string, type: CounterType): Promise<CounterDocument> {
    const counter = await this.counterRepository.findOne({ key, type });

    if (!counter) {
      throw new NotFoundException('Counter not found');
    }

    return counter;
  }
}

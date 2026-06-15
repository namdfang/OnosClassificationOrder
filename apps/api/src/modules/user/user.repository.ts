import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { IDatabaseFindOneOptions } from 'core';
import { DatabaseRepositoryAbstract } from 'core';
import type { ClientSession, FilterQuery, UpdateQuery, UpdateWriteOpResult } from 'mongoose';
import { Model } from 'mongoose';

import { RedisCacheService } from '../redis-cache/redis-cache.service';
import type { UserDocument } from './user.entity';
import { UserEntity } from './user.entity';
@Injectable()
export class UserRepository extends DatabaseRepositoryAbstract<UserEntity, UserDocument> {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    private readonly redisCacheService: RedisCacheService,
  ) {
    super(userModel);
  }

  async updateOne(
    filterQuery: FilterQuery<UserEntity>,
    updateQuery: UpdateQuery<UserEntity>,
    options?: { session?: ClientSession },
  ): Promise<UpdateWriteOpResult> {
    const updateOptions = options?.session ? { session: options.session } : {};

    const updateResult = await super.updateOne(filterQuery, updateQuery, updateOptions);

    const user = await this._repository.findOne(filterQuery);

    if (user) {
      await this.redisCacheService.deleteKey(`user:${user._id}`);
    }

    return updateResult;
  }

  async findOneByIdAndUpdate<T = UserDocument>(
    _id: string,
    data: UpdateQuery<UserEntity>,
    options?: IDatabaseFindOneOptions<ClientSession>,
  ): Promise<T | null> {
    const user = await this._repository.findById(_id);

    if (user) {
      await this.redisCacheService.deleteKey(`user:${user._id}`);
    }

    return this.findOneAndUpdate({ _id }, data, options);
  }

  async findOneAndUpdate<T = UserDocument>(
    filterQuery: FilterQuery<UserEntity>,
    data: UpdateQuery<UserEntity>,
    options?: IDatabaseFindOneOptions<ClientSession>,
  ): Promise<T | null> {
    const findOne = this._repository.findOneAndUpdate<T>(filterQuery, data, {
      new: true,
      session: options?.session,
    });

    if (!options?.withDeleted) {
      void findOne.where('deletedAt').exists(false);
    }

    if (options?.select) {
      void findOne.select(options.select);
    }

    if (options?.populate) {
      if (typeof options.populate === 'boolean') {
        if (!this._joinOnFind) {
          throw new Error('You should provide the populate option');
        }

        void findOne.populate(this._joinOnFind);
      } else if (typeof options.populate !== 'boolean') {
        void findOne.populate(options.populate);
      }
    }

    if (options?.sort) {
      void findOne.sort(options.sort);
    }

    if (options?.lean !== false) {
      void findOne.lean();
    }

    const user = await this._repository.findOne(filterQuery);

    if (user) {
      await this.redisCacheService.deleteKey(`user:${user._id}`);
    }

    return findOne.exec();
  }
}

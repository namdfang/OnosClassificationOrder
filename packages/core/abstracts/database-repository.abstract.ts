// https://github.com/andrechristikan/ack-nestjs-boilerplate/blob/main/src/common/database/abstracts/mongo/repositories/database.mongo.uuid.repository.abstract.ts

import {
  ClientSession,
  Model,
  Document,
  PipelineStage,
  PopulateOptions,
  UpdateWithAggregationPipeline,
  UpdateQuery,
  FilterQuery,
  IfAny,
  MergeType,
  Require_id,
  UpdateWriteOpResult,
} from 'mongoose';
import { DATABASE_DELETED_AT_FIELD_NAME } from '@core/constants';
import {
  IDatabaseCreateOptions,
  IDatabaseExistOptions,
  IDatabaseFindAllOptions,
  IDatabaseGetTotalOptions,
  IDatabaseCreateManyOptions,
  IDatabaseManyOptions,
  IDatabaseFindOneOptions,
  IDatabaseRawFindAllOptions,
  IDatabaseRawGetTotalOptions,
  IDatabaseRestoreManyOptions,
  IDatabaseRawOptions,
  IDatabaseSoftDeleteManyOptions,
} from '@core/interfaces/IDatabaseRepository';
import { DatabaseEntityAbstract } from './entity.abstract';

export abstract class DatabaseRepositoryAbstract<Entity extends DatabaseEntityAbstract, EntityDocument> {
  protected _repository: Model<Entity>;
  protected _joinOnFind?: PopulateOptions | PopulateOptions[];

  constructor(repository: Model<Entity>, options?: PopulateOptions | PopulateOptions[]) {
    // super();

    this._repository = repository;
    this._joinOnFind = options;
  }

  async findAll<T = EntityDocument>(
    filterQuery?: FilterQuery<Entity>,
    options?: IDatabaseFindAllOptions<ClientSession>,
  ): Promise<T[]> {
    const findAll = this._repository.find<T>(filterQuery ? filterQuery : {});

    if (!options?.withDeleted) {
      findAll.where(DATABASE_DELETED_AT_FIELD_NAME).exists(false);
    }

    if (options?.select) {
      findAll.select(options.select);
    }

    if (options?.paging) {
      findAll.limit(options.paging.limit).skip(options.paging.skip);
    }

    if (options?.sort) {
      findAll.sort(options.sort);
    }

    if (options?.populate) {
      if (typeof options.populate === 'boolean') {
        if (!this._joinOnFind) {
          throw new Error('You should provide the populate option');
        }
        findAll.populate(this._joinOnFind);
      } else {
        findAll.populate(options.populate);
      }
    }

    if (options?.session) {
      findAll.session(options.session);
    }

    if (options?.lean === false) {
    } else {
      findAll.lean();
    }

    const data = await findAll.exec();

    return data as T[];
  }

  async findAllAndCount<T = EntityDocument>(
    filterQuery?: FilterQuery<Entity>,
    options?: IDatabaseFindAllOptions<ClientSession>,
  ): Promise<{ data: T[]; total: number }> {
    const findAll = this._repository.find<T>(filterQuery ? filterQuery : {});

    const total = await this.getTotal(filterQuery, options);

    if (!options?.withDeleted) {
      findAll.where(DATABASE_DELETED_AT_FIELD_NAME).exists(false);
    }

    if (options?.select) {
      findAll.select(options.select);
    }

    if (options?.paging) {
      findAll.limit(options.paging.limit).skip(options.paging.skip);
    }

    if (options?.sort) {
      findAll.sort(options.sort);
    }

    if (options?.populate) {
      if (typeof options.populate === 'boolean') {
        if (!this._joinOnFind) {
          throw new Error('You should provide the join option');
        }
        findAll.populate(this._joinOnFind);
      } else {
        findAll.populate(options.populate);
      }
    }

    if (options?.session) {
      findAll.session(options.session);
    }

    if (options?.lean === false) {
    } else {
      findAll.lean();
    }

    const data = await findAll.exec();

    return { data: data as T[], total };
  }

  async findAllDistinct<T = EntityDocument>(
    fieldDistinct: string,
    filterQuery?: FilterQuery<Entity>,
    options?: IDatabaseFindAllOptions<ClientSession>,
  ): Promise<T[]> {
    const findAll = this._repository.distinct<T>(fieldDistinct, filterQuery);

    if (!options?.withDeleted) {
      findAll.where(DATABASE_DELETED_AT_FIELD_NAME).exists(false);
    }

    if (options?.select) {
      findAll.select(options.select);
    }

    if (options?.paging) {
      findAll.limit(options.paging.limit).skip(options.paging.skip);
    }

    if (options?.sort) {
      findAll.sort(options.sort);
    }

    if (options?.populate) {
      if (typeof options.populate === 'boolean') {
        if (!this._joinOnFind) {
          throw new Error('You should provide the populate option');
        }
        findAll.populate(this._joinOnFind);
      } else {
        findAll.populate(options.populate);
      }
    }

    if (options?.session) {
      findAll.session(options.session);
    }

    if (options?.lean === false) {
    } else {
      findAll.lean();
    }

    const data = await findAll.exec();

    return data as T[];
  }

  async findOne<T = EntityDocument>(
    filterQuery: FilterQuery<Entity>,
    options?: IDatabaseFindOneOptions<ClientSession>,
  ): Promise<T | null> {
    const findOne = this._repository.findOne<T>(filterQuery);

    if (!options?.withDeleted) {
      findOne.where(DATABASE_DELETED_AT_FIELD_NAME).exists(false);
    }

    if (options?.select) {
      findOne.select(options.select);
    }

    if (options?.populate) {
      if (typeof options.populate === 'boolean') {
        if (!this._joinOnFind) {
          throw new Error('You should provide the populate option');
        }
        findOne.populate(this._joinOnFind);
      } else {
        findOne.populate(options.populate);
      }
    }

    if (options?.session) {
      findOne.session(options.session);
    }

    if (options?.sort) {
      findOne.sort(options.sort);
    }

    if (options?.lean === false) {
    } else {
      findOne.lean();
    }

    const data = await findOne.exec();

    return data as T;
  }

  async findOneById<T = EntityDocument>(
    _id: string,
    options?: IDatabaseFindOneOptions<ClientSession>,
  ): Promise<T | null> {
    return this.findOne<T>({ _id }, options);
  }

  async updateOne<T = EntityDocument>(
    filterQuery: FilterQuery<Entity>,
    updateQuery: UpdateQuery<Entity>,
    options?: IDatabaseFindOneOptions<ClientSession>,
  ): Promise<UpdateWriteOpResult> {
    const updateOne = this._repository.updateOne(filterQuery, updateQuery);

    if (options?.session) {
      updateOne.session(options.session);
    }

    return updateOne;
  }

  async findOneAndUpdate<T = EntityDocument>(
    filterQuery: FilterQuery<Entity>,
    data: UpdateQuery<Entity>,
    options?: IDatabaseFindOneOptions<ClientSession>,
  ): Promise<T | null> {
    const findOne = this._repository.findOneAndUpdate<T>(filterQuery, data, {
      new: true,
    });

    if (!options?.withDeleted) {
      findOne.where(DATABASE_DELETED_AT_FIELD_NAME).exists(false);
    }

    if (options?.select) {
      findOne.select(options.select);
    }

    if (options?.populate) {
      if (typeof options.populate === 'boolean') {
        if (!this._joinOnFind) {
          throw new Error('You should provide the populate option');
        }
        findOne.populate(this._joinOnFind);
      } else {
        findOne.populate(options.populate);
      }
    }

    if (options?.session) {
      findOne.session(options.session);
    }

    if (options?.sort) {
      findOne.sort(options.sort);
    }

    if (options?.lean === false) {
    } else {
      findOne.lean();
    }

    return findOne.exec();
  }

  async findOneByIdAndUpdate<T = EntityDocument>(
    _id: string,
    data: UpdateQuery<Entity>,
    options?: IDatabaseFindOneOptions<ClientSession>,
  ): Promise<T | null> {
    return this.findOneAndUpdate({ _id }, data, options);
  }

  async getTotal(
    filterQuery?: FilterQuery<Entity>,
    options?: IDatabaseGetTotalOptions<ClientSession>,
  ): Promise<number> {
    const count = this._repository.countDocuments(filterQuery);

    if (!options?.withDeleted) {
      count.where(DATABASE_DELETED_AT_FIELD_NAME).exists(false);
    }

    if (options?.session) {
      count.session(options.session);
    }

    if (options?.populate) {
      if (typeof options.populate === 'boolean') {
        if (!this._joinOnFind) {
          throw new Error('You should provide the populate option');
        }
        count.populate(this._joinOnFind);
      } else {
        count.populate(options.populate);
      }
    }

    return count;
  }

  async exists(filterQuery: FilterQuery<Entity>, options?: IDatabaseExistOptions<ClientSession>): Promise<boolean> {
    if (options?.excludeId) {
      filterQuery = {
        ...filterQuery,
        _id: {
          $nin: options?.excludeId.map((val) => val) ?? [],
        },
      };
    }

    const exist = this._repository.exists(filterQuery);
    if (!options?.withDeleted) {
      exist.where(DATABASE_DELETED_AT_FIELD_NAME).exists(false);
    }

    if (options?.session) {
      exist.session(options.session);
    }

    if (options?.populate) {
      if (typeof options.populate === 'boolean') {
        if (!this._joinOnFind) {
          throw new Error('You should provide the populate option');
        }
        exist.populate(this._joinOnFind);
      } else {
        exist.populate(options.populate);
      }
    }

    const result = await exist;
    return result ? true : false;
  }

  async create<T = EntityDocument>(data: Partial<Entity>, options?: IDatabaseCreateOptions<ClientSession>): Promise<T> {
    const dataCreate = data;

    if (options?._id) {
      dataCreate._id = options?._id;
    }

    const created = await this._repository.create([dataCreate], {
      session: options ? options.session : undefined,
    });

    return created[0] as T;
  }

  // async save(
  //   repository: EntityDocument & Document<Types.ObjectId>,
  //   options?: IDatabaseSaveOptions,
  // ): Promise<EntityDocument> {
  //   return repository.save(options);
  // }

  // async permanentlyDelete(
  //   repository: EntityDocument & Document<Types.ObjectId>,
  //   options?: IDatabaseSaveOptions,
  // ): Promise<EntityDocument> {
  //   return repository.deleteOne(options);
  // }

  async softDelete<T = EntityDocument>(
    filterQuery: FilterQuery<T>,
    options?: IDatabaseFindOneOptions<ClientSession>,
  ): Promise<boolean> {
    const findOne = this._repository.updateOne<EntityDocument>(
      filterQuery,
      {
        deletedAt: new Date(),
      },
      {
        new: true,
      },
    );

    if (options?.session) {
      findOne.session(options.session);
    }

    const result = await findOne.exec();

    if (result.matchedCount === 0) {
      throw new Error('Soft delete failed');
    }

    return true;
  }

  // async restore(
  //   repository: EntityDocument & Document<Types.ObjectId> & { deletedAt?: Date },
  //   options?: IDatabaseSaveOptions,
  // ): Promise<EntityDocument> {
  //   repository.deletedAt = undefined;
  //   return repository.save(options);
  // }

  // bulk
  async createMany<Dto = Partial<Entity>[]>(
    data: Partial<Entity>[],
    options?: IDatabaseCreateManyOptions<ClientSession>,
  ): Promise<
    Array<
      MergeType<
        IfAny<Entity, any, Document<unknown, {}, Entity> & Require_id<Entity>>,
        Omit<Array<Partial<Entity>>, '_id'>
      >
    >
  > {
    const create = this._repository.insertMany(data, {
      session: options ? options.session : undefined,
    });

    return await create;
  }

  async permanentlyDeleteMany(
    filterQuery: FilterQuery<Entity>,
    options?: IDatabaseManyOptions<ClientSession>,
  ): Promise<boolean> {
    const deleteMany = this._repository.deleteMany(filterQuery);

    if (options?.session) {
      deleteMany.session(options.session);
    }

    await deleteMany;
    return true;
  }

  async softDeleteMany(
    filterQuery: FilterQuery<Entity>,
    options?: IDatabaseSoftDeleteManyOptions<ClientSession>,
  ): Promise<boolean> {
    const softDel = this._repository
      .updateMany(filterQuery, {
        $set: {
          deletedAt: new Date(),
        },
      })
      .where(DATABASE_DELETED_AT_FIELD_NAME)
      .exists(false);

    if (options?.session) {
      softDel.session(options.session);
    }

    if (options?.populate) {
      if (typeof options.populate === 'boolean') {
        if (!this._joinOnFind) {
          throw new Error('You should provide the populate option');
        }
        softDel.populate(this._joinOnFind);
      } else {
        softDel.populate(options.populate);
      }
    }

    await softDel;
    return true;
  }

  async restoreMany(
    filterQuery: FilterQuery<Entity>,
    options?: IDatabaseRestoreManyOptions<ClientSession>,
  ): Promise<boolean> {
    const restoreMany = this._repository
      .updateMany(filterQuery, {
        $set: {
          deletedAt: undefined,
        },
      })
      .where(DATABASE_DELETED_AT_FIELD_NAME)
      .exists(true);

    if (options?.session) {
      restoreMany.session(options.session);
    }

    if (options?.populate) {
      if (typeof options.populate === 'boolean') {
        if (!this._joinOnFind) {
          throw new Error('You should provide the populate option');
        }
        restoreMany.populate(this._joinOnFind);
      } else {
        restoreMany.populate(options.populate);
      }
    }

    await restoreMany;
    return true;
  }

  async updateMany<T = EntityDocument>(
    filterQuery: FilterQuery<Entity>,
    updateQuery: UpdateQuery<Entity>,
    options?: IDatabaseManyOptions<ClientSession>,
  ): Promise<UpdateWriteOpResult> {
    const update = this._repository
      .updateMany(filterQuery, updateQuery)
      .where(DATABASE_DELETED_AT_FIELD_NAME)
      .exists(false);

    if (options?.session) {
      update.session(options.session as ClientSession);
    }

    return update;
  }

  // raw

  async updateManyRaw(
    filterQuery: FilterQuery<Entity>,
    data: UpdateWithAggregationPipeline | UpdateQuery<Entity>,
    options?: IDatabaseManyOptions<ClientSession>,
  ): Promise<boolean> {
    const update = this._repository.updateMany(filterQuery, data).where(DATABASE_DELETED_AT_FIELD_NAME).exists(false);

    if (options?.session) {
      update.session(options.session as ClientSession);
    }

    await update;
    return true;
  }

  async raw<RawResponse, RawQuery = PipelineStage[]>(
    rawOperation: RawQuery,
    options?: IDatabaseRawOptions,
  ): Promise<RawResponse[]> {
    if (!Array.isArray(rawOperation)) {
      throw new Error('Must in array');
    }

    let pipeline: PipelineStage[] = rawOperation;
    if (!options?.withDeleted) {
      pipeline = [
        {
          $match: {
            [DATABASE_DELETED_AT_FIELD_NAME]: { $exists: false },
          },
        },
        ...pipeline,
      ];
    }

    const aggregate = this._repository.aggregate<RawResponse>(pipeline);

    if (options?.session) {
      aggregate.session(options?.session);
    }

    return aggregate;
  }

  async rawFindAll<RawResponse, RawQuery = PipelineStage[]>(
    rawOperation: RawQuery,
    options?: IDatabaseRawFindAllOptions,
  ): Promise<RawResponse[]> {
    if (!Array.isArray(rawOperation)) {
      throw new Error('Must in array');
    }

    const pipeline: PipelineStage[] = rawOperation;
    if (!options?.withDeleted) {
      pipeline.push({
        $match: {
          [DATABASE_DELETED_AT_FIELD_NAME]: {
            $exists: false,
          },
        },
      });
    }

    if (options?.sort) {
      const keysOrder = Object.keys(options?.sort);
      pipeline.push({
        $sort: keysOrder.reduce(
          (a, b) => ({
            ...a,
            [b]: options?.sort![b],
          }),
          {},
        ),
      });
    }

    if (options?.paging) {
      pipeline.push(
        {
          $limit: options.paging.limit + options.paging.skip,
        },
        { $skip: options.paging.skip },
      );
    }

    const aggregate = this._repository.aggregate<RawResponse>(pipeline);

    if (options?.session) {
      aggregate.session(options?.session);
    }

    return aggregate;
  }

  async rawGetTotal<RawQuery = PipelineStage[]>(
    rawOperation: RawQuery,
    options?: IDatabaseRawGetTotalOptions,
  ): Promise<number> {
    if (!Array.isArray(rawOperation)) {
      throw new Error('Must in array');
    }

    const pipeline: PipelineStage[] = rawOperation;
    if (!options?.withDeleted) {
      pipeline.push({
        $match: {
          [DATABASE_DELETED_AT_FIELD_NAME]: {
            $exists: false,
          },
        },
      });
    }

    pipeline.push({
      $group: {
        _id: null,
        count: { $sum: 1 },
      },
    });

    const aggregate = this._repository.aggregate(pipeline);

    if (options?.session) {
      aggregate.session(options?.session);
    }

    const raw = await aggregate;
    return raw && raw.length > 0 ? raw[0].count : 0;
  }

  async model(): Promise<Model<Entity>> {
    return this._repository;
  }
}

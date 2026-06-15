// https://github.com/andrechristikan/ack-nestjs-boilerplate/blob/main/src/common/database/interfaces/database.interface.ts

import { PopulateOptions } from 'mongoose';
import { IPaginationOptions } from './IPagination';

// find one
export interface IDatabaseFindOneOptions<T = any> extends Pick<IPaginationOptions, 'sort'> {
  select?: Record<string, boolean | number> | string[];
  populate?: boolean | PopulateOptions | PopulateOptions[];
  session?: T;
  withDeleted?: boolean;
  lean?: boolean;
}

export type IDatabaseGetTotalOptions<T = any> = Pick<
  IDatabaseFindOneOptions<T>,
  'session' | 'withDeleted' | 'populate'
>;

export type IDatabaseSaveOptions<T = any> = Pick<IDatabaseFindOneOptions<T>, 'session'>;

// find
export interface IDatabaseFindAllOptions<T = any>
  extends IPaginationOptions,
    Omit<IDatabaseFindOneOptions<T>, 'sort'> {}

// create

export interface IDatabaseCreateOptions<T = any> extends Pick<IDatabaseFindOneOptions<T>, 'session'> {
  _id?: string;
}

// exist

export interface IDatabaseExistOptions<T = any>
  extends Pick<IDatabaseFindOneOptions<T>, 'session' | 'withDeleted' | 'populate'> {
  excludeId?: string[];
}

// bulk
export type IDatabaseManyOptions<T = any> = Pick<IDatabaseFindOneOptions<T>, 'session' | 'populate'>;

export type IDatabaseCreateManyOptions<T = any> = Pick<IDatabaseFindOneOptions<T>, 'session'> & {
  ordered?: boolean;
};

export type IDatabaseSoftDeleteManyOptions<T = any> = IDatabaseManyOptions<T>;

export type IDatabaseRestoreManyOptions<T = any> = IDatabaseManyOptions<T>;

// Raw

export type IDatabaseRawOptions<T = any> = Pick<IDatabaseFindOneOptions<T>, 'session' | 'withDeleted'>;

export type IDatabaseRawFindAllOptions<T = any> = Pick<
  IDatabaseFindAllOptions<T>,
  'sort' | 'paging' | 'session' | 'withDeleted'
>;

export type IDatabaseRawGetTotalOptions<T = any> = Pick<IDatabaseRawFindAllOptions<T>, 'session' | 'withDeleted'>;

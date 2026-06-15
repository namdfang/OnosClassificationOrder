import type { PopulateOptions } from 'mongoose';

import type { IPaginationOptions } from './IPagination';

export interface IDatabaseFindOneOptions<T = any | null> extends Pick<IPaginationOptions, 'sort'> {
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

// update

export interface IDatabaseUpdateOptions<T = any> extends Pick<IDatabaseFindOneOptions<T>, 'session'> {
  upsert?: boolean;
  multi?: boolean;
  new?: boolean;
  select?: Record<string, boolean | number>;
  populate?: boolean | PopulateOptions | PopulateOptions[];
  withDeleted?: boolean;
}

// exist

export interface IDatabaseExistOptions<T = any>
  extends Pick<IDatabaseFindOneOptions<T>, 'session' | 'withDeleted' | 'populate'> {
  excludeId?: string[];
}

// bulk
export type IDatabaseManyOptions<T = any> = Pick<IDatabaseFindOneOptions<T>, 'session' | 'populate'>;

export type IDatabaseCreateManyOptions<T = any> = Pick<IDatabaseFindOneOptions<T>, 'session'>;

export type IDatabaseSoftDeleteManyOptions<T = any> = IDatabaseManyOptions<T>;

export type IDatabaseRestoreManyOptions<T = any> = IDatabaseManyOptions<T>;

export type IDatabaseRawOptions<T = any> = Pick<IDatabaseFindOneOptions<T>, 'session' | 'withDeleted'>;

import { OrderDirection } from '@core/constants';

export type IPaginationOrder = Record<string, OrderDirection>;

export interface IPaginationPaging {
  limit: number;
  skip: number;
}

export interface IPaginationOptions {
  paging?: IPaginationPaging;
  sort?: IPaginationOrder;
}

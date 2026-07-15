import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { CustomerDocument } from './customer.entity';
import { CustomerEntity } from './customer.entity';

@Injectable()
export class CustomerRepository extends DatabaseRepositoryAbstract<CustomerEntity, CustomerDocument> {
  constructor(@InjectModel(CustomerEntity.name) private readonly customerModel: Model<CustomerEntity>) {
    super(customerModel);
  }
}

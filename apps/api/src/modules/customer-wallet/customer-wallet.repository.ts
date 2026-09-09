import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { CustomerWalletTransactionDocument } from './customer-wallet-transaction.entity';
import { CustomerWalletTransactionEntity } from './customer-wallet-transaction.entity';

@Injectable()
export class CustomerWalletRepository extends DatabaseRepositoryAbstract<
  CustomerWalletTransactionEntity,
  CustomerWalletTransactionDocument
> {
  constructor(
    @InjectModel(CustomerWalletTransactionEntity.name)
    private readonly txnModel: Model<CustomerWalletTransactionEntity>,
  ) {
    super(txnModel);
  }
}

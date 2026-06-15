import { Prop } from '@nestjs/mongoose';
import { customAlphabet } from 'nanoid';
import { ID_LENGTH } from 'shared';

export abstract class DatabaseEntityAbstract {
  @Prop({
    type: String,
    default: () => customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', ID_LENGTH)(), // myId()
  })
  _id?: string;

  @Prop({
    required: false,
    index: 'asc',
    type: Date,
  })
  deletedAt?: Date;

  @Prop({
    required: false,
    index: 'asc',
    type: Date,
    // default: new Date(),
  })
  createdAt?: Date;

  @Prop({
    required: false,
    index: 'asc',
    type: Date,
    // default: new Date(),
  })
  updatedAt?: Date;
}

import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';

@DatabaseEntity({ collection: 'customers' })
export class CustomerEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true, index: true })
  userSku: string;

  @Prop({ trim: true, default: '' })
  userEmail: string;

  @Prop({ default: 'sync' })
  source: string;

  // Tier VIP 0..5; null = khách lẻ (chưa xếp hạng).
  @Prop({ type: Number, default: null })
  tier: number | null;
}

export const CustomerSchema = SchemaFactory.createForClass(CustomerEntity);
// Khóa nhận diện khách = cặp (userSku, userEmail) → chống trùng.
CustomerSchema.index({ userSku: 1, userEmail: 1 }, { unique: true });

export type CustomerDocument = HydratedDocument<CustomerEntity>;

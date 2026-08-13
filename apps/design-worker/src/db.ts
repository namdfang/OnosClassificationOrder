import mongoose, { Schema } from 'mongoose';

import { config } from './config';

/**
 * Worker ghi Mongo TRỰC TIẾP (qua Tailscale) với schema tối thiểu
 * `strict: false` — nguồn chân lý schema vẫn là entity bên `apps/api`
 * (`design-file.entity.ts` / `order.entity.ts` / `customer-order.entity.ts`),
 * worker chỉ đụng đúng các field nó cần.
 */

const designFileSchema = new Schema(
  {
    sha256: { type: String, required: true, unique: true, index: true },
    status: { type: String, default: 'processing' },
    sourceKeys: { type: [String], index: true, default: [] },
  },
  { strict: false, timestamps: true, collection: 'design_files' },
);

const orderSchema = new Schema({}, { strict: false, collection: 'orders' });
const customerOrderSchema = new Schema({}, { strict: false, collection: 'customer_orders' });

export const DesignFileModel = mongoose.model('DesignFile', designFileSchema);
export const OrderModel = mongoose.model('Order', orderSchema);
export const CustomerOrderModel = mongoose.model('CustomerOrder', customerOrderSchema);

export async function connectDb(): Promise<void> {
  await mongoose.connect(config.dbUri);
  console.log('[db] connected');
}

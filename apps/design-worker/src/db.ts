import mongoose, { Schema } from 'mongoose';
import { customAlphabet } from 'nanoid';
import { ID_LENGTH } from 'shared';

import { config } from './config';

// MIRROR packages/core/abstracts/entity.abstract.ts — toàn hệ thống dùng _id
// STRING tự sinh (nanoid A-Z0-9), KHÔNG phải ObjectId. Thiếu khai báo này thì
// mọi query theo _id bị "Cast to ObjectId failed".
const generateId = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', ID_LENGTH);

/**
 * Worker ghi Mongo TRỰC TIẾP (qua Tailscale) với schema tối thiểu
 * `strict: false` — nguồn chân lý schema vẫn là entity bên `apps/api`
 * (`design-file.entity.ts` / `order.entity.ts` / `customer-order.entity.ts`),
 * worker chỉ đụng đúng các field nó cần.
 */

const designFileSchema = new Schema(
  {
    _id: { type: String, default: () => generateId() },
    sha256: { type: String, required: true, unique: true, index: true },
    status: { type: String, default: 'processing' },
    sourceKeys: { type: [String], index: true, default: [] },
  },
  { strict: false, timestamps: true, collection: 'design_files' },
);

const orderSchema = new Schema({ _id: { type: String } }, { strict: false, collection: 'orders' });
const customerOrderSchema = new Schema({ _id: { type: String } }, { strict: false, collection: 'customer_orders' });

export const DesignFileModel = mongoose.model('DesignFile', designFileSchema);
export const OrderModel = mongoose.model('Order', orderSchema);
export const CustomerOrderModel = mongoose.model('CustomerOrder', customerOrderSchema);

export async function connectDb(): Promise<void> {
  await mongoose.connect(config.dbUri);
  console.log('[db] connected');
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CreateCustomerDto,
  Customer,
  GetCustomersDto,
  GetCustomersResDto,
  ImportCustomerTiersDto,
  ImportCustomerTiersResDto,
  SyncCustomersResDto,
  UpdateCustomerTierDto,
} from 'shared';

import { OrderEntity } from '../order/order.entity';
import { CustomerEntity } from './customer.entity';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class CustomerService {
  constructor(
    @InjectModel(CustomerEntity.name) private readonly customerModel: Model<CustomerEntity>,
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
  ) {}

  async list(dto: GetCustomersDto): Promise<GetCustomersResDto> {
    const filter: Record<string, unknown> = {};
    if (dto.search?.trim()) {
      const rx = { $regex: escapeRegex(dto.search.trim()), $options: 'i' };
      filter.$or = [{ userSku: rx }, { userEmail: rx }];
    }
    const data = await this.customerModel
      .find(filter)
      .sort({ userSku: 1 })
      .lean()
      .exec();
    return { success: true, data: data as unknown as Customer[], total: data.length };
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const userSku = dto.userSku.trim();
    const userEmail = (dto.userEmail || '').trim().toLowerCase();
    if (!userSku) throw new BadRequestException('User SKU không được để trống');
    const existing = await this.customerModel.findOne({ userSku, userEmail });
    if (existing) throw new BadRequestException('Khách hàng (SKU + email) đã tồn tại');
    const created = await this.customerModel.create({ userSku, userEmail, source: 'manual' });
    return created.toObject() as unknown as Customer;
  }

  /**
   * Quét toàn bộ `orders`, gom **distinct cặp (userSku, userEmail)** rồi upsert
   * vào `customers`. Chỉ thêm mới — KHÔNG xóa khách cũ / khách nhập tay.
   */
  async sync(): Promise<SyncCustomersResDto> {
    const pairs = await this.orderModel.aggregate<{ _id: { userSku: string; userEmail: string } }>([
      { $match: { userSku: { $nin: [null, ''] } } },
      {
        $group: {
          _id: {
            userSku: '$userSku',
            userEmail: { $toLower: { $ifNull: ['$userEmail', ''] } },
          },
        },
      },
    ]);

    let created = 0;
    if (pairs.length > 0) {
      const res = await this.customerModel.bulkWrite(
        pairs.map((p) => ({
          updateOne: {
            filter: { userSku: p._id.userSku, userEmail: p._id.userEmail || '' },
            update: {
              $setOnInsert: {
                userSku: p._id.userSku,
                userEmail: p._id.userEmail || '',
                source: 'sync',
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
      created = res.upsertedCount ?? 0;
    }

    const total = await this.customerModel.countDocuments();
    return {
      success: true,
      data: { scanned: pairs.length, created, existing: pairs.length - created, total },
    };
  }

  async updateTier(id: string, dto: UpdateCustomerTierDto): Promise<Customer> {
    const updated = await this.customerModel
      .findByIdAndUpdate(id, { $set: { tier: dto.tier } }, { new: true })
      .lean();
    if (!updated) throw new NotFoundException('Không tìm thấy khách hàng');
    return updated as unknown as Customer;
  }

  /**
   * Import tier hàng loạt từ file `TÊN TÀI KHOẢN | VIP n`. Khớp theo **userSku**
   * không phân biệt hoa/thường; 1 SKU trùng nhiều dòng khách (nhiều email) →
   * gán tier cho TẤT CẢ. SKU không có trong `customers` → bỏ qua (`skippedSkus`),
   * KHÔNG tự tạo khách mới. Trùng SKU trong file → dòng sau thắng.
   */
  async importTiers(dto: ImportCustomerTiersDto): Promise<ImportCustomerTiersResDto> {
    const wanted = new Map<string, { sku: string; tier: number }>();
    for (const r of dto.rows) {
      const sku = r.userSku.trim();
      if (sku) wanted.set(sku.toLowerCase(), { sku, tier: r.tier });
    }
    if (!wanted.size) throw new BadRequestException('File không có dòng hợp lệ');

    // Map lower(userSku) → các giá trị userSku thật trong DB (match không phân biệt hoa/thường).
    const existing = await this.customerModel.find({}, { userSku: 1 }).lean();
    const skusByLower = new Map<string, Set<string>>();
    for (const c of existing) {
      const raw = String((c as unknown as { userSku: string }).userSku);
      const key = raw.trim().toLowerCase();
      if (!skusByLower.has(key)) skusByLower.set(key, new Set());
      skusByLower.get(key)!.add(raw);
    }

    const skippedSkus: string[] = [];
    const ops: { updateMany: { filter: Record<string, unknown>; update: Record<string, unknown> } }[] = [];
    let matchedSkus = 0;
    for (const { sku, tier } of wanted.values()) {
      const actual = skusByLower.get(sku.toLowerCase());
      if (!actual?.size) {
        skippedSkus.push(sku);
        continue;
      }
      matchedSkus += 1;
      ops.push({
        updateMany: {
          filter: { userSku: { $in: Array.from(actual) } },
          update: { $set: { tier } },
        },
      });
    }

    let updatedCustomers = 0;
    if (ops.length) {
      const res = await this.customerModel.bulkWrite(ops, { ordered: false });
      updatedCustomers = res.modifiedCount ?? 0;
    }
    return { success: true, data: { matchedSkus, updatedCustomers, skippedSkus } };
  }
}

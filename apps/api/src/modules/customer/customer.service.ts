import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CreateCustomerDto,
  Customer,
  GetCustomersDto,
  GetCustomersResDto,
  SyncCustomersResDto,
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
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CustomerNotification,
  GetCustomerNotificationsDto,
  GetCustomerNotificationsResDto,
  GetSentCustomerNotificationsDto,
  GetSentCustomerNotificationsResDto,
  MarkCustomerNotificationsReadResDto,
  SendCustomerNotificationDto,
  SendCustomerNotificationResDto,
} from 'shared';

import type { CustomerDocument } from '../customer/customer.entity';
import { CustomerEntity } from '../customer/customer.entity';
import type { UserDocument } from '../user/user.entity';
import { CustomerNotificationEntity } from './customer-notification.entity';

@Injectable()
export class CustomerNotificationService {
  constructor(
    @InjectModel(CustomerNotificationEntity.name)
    private readonly notificationModel: Model<CustomerNotificationEntity>,
    @InjectModel(CustomerEntity.name) private readonly customerModel: Model<CustomerEntity>,
  ) {}

  /** Admin/nội bộ soạn + gửi — 1 khách cụ thể (`dto.customerId`) hoặc broadcast (bỏ trống). */
  async send(admin: UserDocument, dto: SendCustomerNotificationDto): Promise<SendCustomerNotificationResDto> {
    if (dto.customerId) {
      const exists = await this.customerModel.exists({ _id: dto.customerId });
      if (!exists) throw new NotFoundException('Không tìm thấy khách hàng này');
    }
    const created = await this.notificationModel.create({
      title: dto.title.trim(),
      body: dto.body?.trim() || undefined,
      customerId: dto.customerId ?? null,
      createdByUserId: String(admin._id),
      createdByName: admin.fullName || 'Admin',
    });
    return { success: true, data: this.toDto(created.toObject()) };
  }

  /** Lịch sử đã gửi — dùng cho màn quản trị `/adm/settings`. */
  async listSent(dto: GetSentCustomerNotificationsDto): Promise<GetSentCustomerNotificationsResDto> {
    const skip = (dto.page - 1) * dto.limit;
    const [rows, total] = await Promise.all([
      this.notificationModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(dto.limit)
        .populate('customer', 'userSku userEmail fullName')
        .lean(),
      this.notificationModel.countDocuments(),
    ]);
    return { success: true, data: rows.map((r) => this.toDto(r, true)), total };
  }

  /** Đơn của CHÍNH khách đang đăng nhập — broadcast (`customerId=null`) + gửi riêng. */
  async listForCustomer(
    customer: CustomerDocument,
    dto: GetCustomerNotificationsDto,
  ): Promise<GetCustomerNotificationsResDto> {
    const filter = { $or: [{ customerId: String(customer._id) }, { customerId: null }] };
    const skip = (dto.page - 1) * dto.limit;
    const readAt = this.readAtOf(customer);
    const [rows, total, unreadCount] = await Promise.all([
      this.notificationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(dto.limit).lean(),
      this.notificationModel.countDocuments(filter),
      this.notificationModel.countDocuments({ ...filter, createdAt: { $gt: readAt } }),
    ]);
    return { success: true, data: rows.map((r) => this.toDto(r)), total, unreadCount };
  }

  /** Đánh dấu MỌI thông báo hiện có là đã đọc — bump 1 mốc thời gian, không track từng cái. */
  async markRead(customer: CustomerDocument): Promise<MarkCustomerNotificationsReadResDto> {
    await this.customerModel.updateOne({ _id: customer._id }, { notificationsReadAt: new Date() });
    return { success: true };
  }

  private readAtOf(customer: CustomerDocument): Date {
    const readAt = (customer as unknown as { notificationsReadAt?: Date | null }).notificationsReadAt;
    return readAt ?? new Date(0);
  }

  private toDto(doc: Record<string, unknown>, withCustomerLabel = false): CustomerNotification {
    const base: CustomerNotification = {
      _id: String(doc._id),
      title: doc.title as string,
      body: doc.body as string | undefined,
      customerId: (doc.customerId as string | null) ?? null,
      createdByUserId: String(doc.createdByUserId),
      createdByName: doc.createdByName as string,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
    if (!withCustomerLabel) return base;
    const c = doc.customer as { userSku?: string; userEmail?: string; fullName?: string } | undefined;
    base.customerLabel = c ? c.fullName || c.userEmail || c.userSku || '' : 'Tất cả khách hàng';
    return base;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CustomerNotification,
  CustomerNotificationEvent,
  CustomerNotificationEventData,
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

/**
 * Bản tiếng Việt DỰ PHÒNG cho thông báo hệ thống — nguồn hiển thị chính là
 * i18n phía FE theo `event`/`eventData` (khách đổi VI↔EN là đổi theo). Chuỗi
 * ở đây chỉ dùng khi client không hiểu `event` và cho màn lịch sử của admin.
 */
const SYSTEM_NOTIFICATION_FALLBACK_VI: Record<
  CustomerNotificationEvent,
  (d: CustomerNotificationEventData) => string
> = {
  'order.pushed': (d) => `Đơn ${d.orderCode ?? ''} đã vào sản xuất`.trim(),
  'order.production_completed': (d) => `Đơn ${d.orderCode ?? ''} đã sản xuất xong`.trim(),
  'order.held': (d) =>
    d.holdKind === 'waiting-design'
      ? `Đơn ${d.orderCode ?? ''} đang tạm giữ — cần bổ sung file thiết kế`.trim()
      : d.holdKind === 'waiting-address'
        ? `Đơn ${d.orderCode ?? ''} đang tạm giữ — cần bổ sung địa chỉ nhận hàng`.trim()
        : `Đơn ${d.orderCode ?? ''} đang tạm giữ — liên hệ hỗ trợ để biết thêm`.trim(),
  'order.unheld': (d) => `Đơn ${d.orderCode ?? ''} đã được tiếp tục sản xuất`.trim(),
  'order.item_cancelled': (d) => `Sản phẩm ${d.productionId ?? ''} trong đơn đã bị hủy`.trim(),
};

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

  /**
   * ORD-5 — thông báo HỆ THỐNG tự sinh theo trạng thái đơn. Không có người
   * gửi; `title`/`body` lưu bản tiếng Việt dự phòng, FE render theo ngôn ngữ
   * khách từ `event` + `eventData`. Lỗi ghi KHÔNG được ném ngược ra luồng
   * nghiệp vụ gốc (push/hold/hủy vẫn phải thành công) — caller gọi qua
   * `CustomerOrderEventService` vốn đã fire-and-forget, đây là lớp chặn thứ 2.
   */
  async createSystemNotification(input: {
    customerId: string;
    event: CustomerNotificationEvent;
    data: CustomerNotificationEventData;
  }): Promise<void> {
    try {
      await this.notificationModel.create({
        title: SYSTEM_NOTIFICATION_FALLBACK_VI[input.event](input.data),
        customerId: input.customerId,
        event: input.event,
        eventData: input.data,
      });
    } catch (err) {
      console.warn(`[customer-notification] tạo thông báo ${input.event} lỗi: ${(err as Error).message}`);
    }
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
      event: (doc.event as CustomerNotificationEvent | null) ?? undefined,
      eventData: (doc.eventData as CustomerNotificationEventData | null) ?? undefined,
      createdByUserId: doc.createdByUserId ? String(doc.createdByUserId) : undefined,
      createdByName: (doc.createdByName as string | undefined) || undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
    if (!withCustomerLabel) return base;
    const c = doc.customer as { userSku?: string; userEmail?: string; fullName?: string } | undefined;
    base.customerLabel = c ? c.fullName || c.userEmail || c.userSku || '' : 'Tất cả khách hàng';
    return base;
  }
}

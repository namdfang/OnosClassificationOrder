import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { createHmac, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import type {
  CreateCustomerWebhookDto,
  CreateCustomerWebhookResDto,
  CustomerWebhook,
  CustomerWebhookEvent,
  DeleteCustomerWebhookResDto,
  ListCustomerWebhooksResDto,
} from 'shared';
import { CUSTOMER_WEBHOOK_MAX_ACTIVE, customerMatchKey } from 'shared';

import { CustomerEntity } from '@/modules/customer/customer.entity';
import { customerMessage } from '@/shared/i18n/customer-messages';

import { CustomerWebhookDeliveryEntity, CustomerWebhookEntity } from './customer-webhook.entity';

/**
 * Dữ liệu 1 đơn cho emit — CHỈ field khách được thấy (SRS BR: không lộ nhân
 * viên/giá vốn/xưởng). Caller (order/fulfillment/customer-portal) tự bóc từ
 * OrderEntity.
 */
export interface WebhookOrderRef {
  productionId?: string;
  userSku?: string;
  userEmail?: string;
  /** Đã biết sẵn khách (vd. push từ portal) → bỏ qua bước resolve theo (userSku, userEmail). */
  customerId?: string;
  /** Dữ liệu bổ sung theo sự kiện — holdReason, cancelReason... đều là thứ portal đã hiện cho khách. */
  extra?: Record<string, string | null | undefined>;
}

const DELIVERY_TIMEOUT_MS = 5000;
/** Retry sau lần đầu thất bại — giới hạn rồi bỏ (BR), delay tăng dần. */
const RETRY_DELAYS_MS = [5_000, 25_000];

/**
 * Gửi webhook cho khách API khi đơn của họ đổi trạng thái (ORD-4).
 *
 * Module ĐỘC LẬP (chỉ bind model, không import module nghiệp vụ nào) để
 * OrderModule / FulfillmentModule / CustomerPortalModule cùng import mà không
 * tạo vòng DI. `emitForOrders()` là fire-and-forget hoàn toàn: lỗi mạng, URL
 * khách chậm hay chết đều KHÔNG chạm luồng nghiệp vụ chính (axios timeout 5s,
 * không follow redirect, chạy ngoài request qua promise nền).
 */
@Injectable()
export class CustomerWebhookService {
  constructor(
    @InjectModel(CustomerWebhookEntity.name)
    private readonly webhookModel: Model<CustomerWebhookEntity>,
    @InjectModel(CustomerWebhookDeliveryEntity.name)
    private readonly deliveryModel: Model<CustomerWebhookDeliveryEntity>,
    @InjectModel(CustomerEntity.name)
    private readonly customerModel: Model<CustomerEntity>,
  ) {}

  // ─── CRUD (portal, JWT Customer) ──────────────────────────────────────────

  private toDto(doc: CustomerWebhookEntity & { _id: unknown; createdAt?: Date }): CustomerWebhook {
    return {
      _id: String(doc._id),
      url: doc.url,
      events: doc.events?.length ? doc.events : undefined,
      secret: doc.secret,
      createdAt: doc.createdAt,
      lastSuccessAt: doc.lastSuccessAt ?? undefined,
      lastFailureAt: doc.lastFailureAt ?? undefined,
    };
  }

  async create(customerId: string, dto: CreateCustomerWebhookDto): Promise<CreateCustomerWebhookResDto> {
    const count = await this.webhookModel.countDocuments({ customerId, deletedAt: { $exists: false } });
    if (count >= CUSTOMER_WEBHOOK_MAX_ACTIVE) {
      throw new BadRequestException(customerMessage('webhookTooMany', CUSTOMER_WEBHOOK_MAX_ACTIVE));
    }
    const url = dto.url.trim();
    if (!/^https?:\/\//i.test(url)) throw new BadRequestException(customerMessage('webhookUrlInvalid'));
    const created = await this.webhookModel.create({
      customerId,
      url,
      events: dto.events ?? [],
      secret: `whsec_${randomBytes(16).toString('hex')}`,
    });
    return { success: true, data: this.toDto(created.toObject()) };
  }

  async list(customerId: string): Promise<ListCustomerWebhooksResDto> {
    const docs = await this.webhookModel
      .find({ customerId, deletedAt: { $exists: false } })
      .sort({ createdAt: 1 })
      .lean();
    return { success: true, data: docs.map((d) => this.toDto(d)) };
  }

  async remove(customerId: string, id: string): Promise<DeleteCustomerWebhookResDto> {
    const res = await this.webhookModel.deleteOne({ _id: id, customerId });
    if (res.deletedCount === 0) throw new NotFoundException(customerMessage('webhookNotFound'));
    return { success: true, data: { deleted: true } };
  }

  // ─── Emit — gọi từ order/fulfillment/customer-portal ─────────────────────

  /**
   * Emit 1 sự kiện cho danh sách đơn. Resolve khách theo (userSku, userEmail)
   * — cùng khóa `customerMatchKey` mọi tính năng khác dùng. KHÔNG await ở call
   * site (`void ...`); mọi lỗi nuốt tại đây kèm log, không ném ngược.
   */
  emitForOrders(event: CustomerWebhookEvent, orders: WebhookOrderRef[]): void {
    void this.emitForOrdersAsync(event, orders).catch((err) => {
      console.warn(`[customer-webhook] emit ${event} lỗi: ${(err as Error).message}`);
    });
  }

  private async emitForOrdersAsync(event: CustomerWebhookEvent, orders: WebhookOrderRef[]): Promise<void> {
    const valid = orders.filter((o) => o.productionId);
    if (valid.length === 0) return;

    // Ref chưa biết customerId → gom key khách → 1 query customers cho cả lô.
    const keys = new Map<string, { userSku: string; userEmail: string }>();
    for (const o of valid) {
      if (o.customerId) continue;
      const sku = (o.userSku ?? '').trim();
      const email = (o.userEmail ?? '').trim();
      keys.set(customerMatchKey(sku, email), { userSku: sku, userEmail: email });
    }
    const pairs = [...keys.values()];
    const customers =
      pairs.length > 0
        ? await this.customerModel
            .find({
              deletedAt: null,
              // Mirror `customerMatchKey`: userSku so CHÍNH XÁC (case-sensitive),
              // email không phân biệt hoa thường.
              $or: pairs.map((p) => ({
                userSku: p.userSku,
                userEmail: new RegExp(`^${escapeRegex(p.userEmail)}$`, 'i'),
              })),
            })
            .select('userSku userEmail')
            .lean()
        : [];
    const customerByKey = new Map(customers.map((c) => [customerMatchKey(c.userSku, c.userEmail), String(c._id)]));

    const customerIds = [
      ...new Set([...customerByKey.values(), ...valid.map((o) => o.customerId).filter((id): id is string => !!id)]),
    ];
    if (customerIds.length === 0) return;
    const webhooks = await this.webhookModel
      .find({ customerId: { $in: customerIds }, deletedAt: { $exists: false } })
      .lean();
    if (webhooks.length === 0) return;
    const webhooksByCustomer = new Map<string, typeof webhooks>();
    for (const w of webhooks) {
      if (w.events?.length && !w.events.includes(event)) continue;
      const list = webhooksByCustomer.get(w.customerId) ?? [];
      list.push(w);
      webhooksByCustomer.set(w.customerId, list);
    }

    for (const order of valid) {
      const customerId =
        order.customerId ?? customerByKey.get(customerMatchKey((order.userSku ?? '').trim(), (order.userEmail ?? '').trim()));
      if (!customerId) continue;
      for (const webhook of webhooksByCustomer.get(customerId) ?? []) {
        void this.deliver(event, order, customerId, webhook);
      }
    }
  }

  /** POST 1 payload tới 1 endpoint — timeout 5s, không redirect, retry giới hạn, ghi vết delivery. */
  private async deliver(
    event: CustomerWebhookEvent,
    order: WebhookOrderRef,
    customerId: string,
    webhook: { _id: unknown; url: string; secret: string },
  ): Promise<void> {
    const delivery = await this.deliveryModel.create({
      customerId,
      webhookId: String(webhook._id),
      event,
      productionId: order.productionId ?? '',
      status: 'pending',
    });
    const payload = JSON.stringify({
      id: String(delivery._id),
      event,
      createdAt: new Date().toISOString(),
      data: { productionId: order.productionId, ...(order.extra ?? {}) },
    });
    const signature = createHmac('sha256', webhook.secret).update(payload).digest('hex');
    await this.deliveryModel.updateOne({ _id: delivery._id }, { $set: { payload } }).catch(() => undefined);

    for (let attempt = 1; attempt <= 1 + RETRY_DELAYS_MS.length; attempt++) {
      try {
        await axios.post(webhook.url, payload, {
          timeout: DELIVERY_TIMEOUT_MS,
          maxRedirects: 0,
          headers: {
            'Content-Type': 'application/json',
            'X-Onos-Event': event,
            'X-Onos-Delivery': String(delivery._id),
            'X-Onos-Signature': `sha256=${signature}`,
          },
        });
        await Promise.all([
          this.deliveryModel.updateOne(
            { _id: delivery._id },
            { $set: { status: 'delivered', attempts: attempt, deliveredAt: new Date(), lastError: '' } },
          ),
          this.webhookModel.updateOne({ _id: webhook._id }, { $set: { lastSuccessAt: new Date() } }),
        ]).catch(() => undefined);
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await Promise.all([
          this.deliveryModel.updateOne(
            { _id: delivery._id },
            { $set: { status: 'failed', attempts: attempt, lastError: message.slice(0, 500) } },
          ),
          this.webhookModel.updateOne({ _id: webhook._id }, { $set: { lastFailureAt: new Date() } }),
        ]).catch(() => undefined);
        const delay = RETRY_DELAYS_MS[attempt - 1];
        if (delay === undefined) return; // hết lượt retry → bỏ (đã ghi vết failed)
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { CustomerWebhookEvent } from 'shared';

/**
 * Webhook endpoint khách API đăng ký (ORD-4) — nhận POST khi đơn của CHÍNH
 * khách đó đổi trạng thái (5 sự kiện `CUSTOMER_WEBHOOK_EVENTS`). Tối đa
 * `CUSTOMER_WEBHOOK_MAX_ACTIVE` URL / khách. `secret` lưu plaintext vì server
 * cần nó để ký HMAC-SHA256 từng payload (`X-Onos-Signature`) — khách đối chiếu
 * chữ ký để xác minh nguồn gửi.
 */
@DatabaseEntity({ collection: 'customer_webhooks' })
export class CustomerWebhookEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, index: true })
  customerId: string;

  @Prop({ required: true, trim: true })
  url: string;

  /** Rỗng = nhận TẤT CẢ sự kiện. */
  @Prop({ type: [String], default: [] })
  events: CustomerWebhookEvent[];

  @Prop({ required: true })
  secret: string;

  @Prop({ type: Date, default: null })
  lastSuccessAt: Date | null;

  @Prop({ type: Date, default: null })
  lastFailureAt: Date | null;
}

export const CustomerWebhookSchema = SchemaFactory.createForClass(CustomerWebhookEntity);
export type CustomerWebhookDocument = HydratedDocument<CustomerWebhookEntity>;

/**
 * Vết giao hàng webhook — mỗi lần emit 1 sự kiện tới 1 endpoint = 1 record
 * (status cập nhật theo attempt cuối). TTL 30 ngày — chỉ phục vụ đối chiếu
 * "webhook có gửi không / lỗi gì", không phải audit vĩnh viễn.
 */
@DatabaseEntity({ collection: 'customerWebhookDeliveries' })
export class CustomerWebhookDeliveryEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, index: true })
  customerId: string;

  @Prop({ required: true })
  webhookId: string;

  @Prop({ required: true })
  event: string;

  @Prop({ default: '' })
  productionId: string;

  /** Payload JSON đã gửi (nguyên văn — chính chuỗi được ký HMAC). */
  @Prop({ default: '' })
  payload: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: 'pending' })
  status: 'pending' | 'delivered' | 'failed';

  @Prop({ default: '' })
  lastError: string;

  @Prop({ type: Date, default: null })
  deliveredAt: Date | null;
}

export const CustomerWebhookDeliverySchema = SchemaFactory.createForClass(CustomerWebhookDeliveryEntity);
CustomerWebhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
export type CustomerWebhookDeliveryDocument = HydratedDocument<CustomerWebhookDeliveryEntity>;

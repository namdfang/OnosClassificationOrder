import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { CustomerHoldKind, PublicOrderTrack } from 'shared';
import {
  CUSTOMER_ORDER_COMPLETED_DAYS_DEFAULT,
  CUSTOMER_ORDER_COMPLETED_DAYS_KEY,
  CustomerOrderStatus,
  HOLD_REASON_WAITING_ADDRESS,
  HOLD_REASON_WAITING_DESIGN,
} from 'shared';

import { OrderEntity } from '@/modules/order/order.entity';
import { OrderService } from '@/modules/order/order.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';

import type { CustomerOrderItem } from './customer-order.entity';
import { CustomerOrderEntity } from './customer-order.entity';
import type { ProdDeriveFields } from './customer-order.service';
import {
  computeCurrentStage,
  CUSTOMER_STAGE_LABELS,
  deriveItemStatus,
  isReworkBadge,
  PROD_DERIVE_FIELDS,
} from './customer-order.service';

/**
 * Mã sản xuất hợp lệ (`XX-#####-#####`) — chỉ chữ/số/gạch ngang, độ dài có
 * trần. Chặn ngay ở cửa để URL rác không thành query regex vào DB.
 */
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{2,39}$/;

/** Field OrderEntity trang công khai được phép đọc — cố ý KHÔNG có designer/xưởng/giá. */
const PUBLIC_ORDER_FIELDS =
  'productionId externalId orderId type color size quantity mockupUrl printMethod orderAt shippingAddress ' +
  'cancelledAt ' +
  PROD_DERIVE_FIELDS;

type PublicOrderDoc = ProdDeriveFields & {
  productionId: string;
  externalId?: string;
  orderId?: string;
  type?: string;
  color?: string;
  size?: string;
  quantity?: number;
  mockupUrl?: string;
  printMethod?: string;
  orderAt?: Date;
  shippingAddress?: { city?: string; state?: string; country?: string };
};

/**
 * Tra cứu đơn CÔNG KHAI theo mã sản xuất (`GET /public/track/:code`).
 *
 * Cửa vào là chính mã đơn: ai cầm mã đều xem được, kể cả người mua cuối của
 * khách. Vì vậy service này KHÔNG tái dùng đường đọc đầy đủ của portal mà tự
 * gom một danh sách trắng field hẹp (`PUBLIC_ORDER_FIELDS` +
 * `PublicOrderTrackZod`): không giá, không tên nhân viên, không file thiết kế,
 * không nguyên văn ghi chú nội bộ, địa chỉ chỉ còn city/state/country.
 *
 * Trạng thái/chặng vẫn tính bằng ĐÚNG các hàm mà portal dùng
 * (`deriveItemStatus`/`computeCurrentStage`/`isReworkBadge` +
 * `OrderService.getLifecycleTrack`) để hai nơi không bao giờ lệch nhau.
 */
@Injectable()
export class PublicTrackService {
  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    @InjectModel(CustomerOrderEntity.name) private readonly customerOrderModel: Model<CustomerOrderEntity>,
    private readonly orderService: OrderService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  /** Nhóm lý do giữ an toàn — mirror `CustomerOrderEventService.holdKindOf`. */
  private holdKindOf(reason?: string): CustomerHoldKind {
    if (reason === HOLD_REASON_WAITING_DESIGN) return 'waiting-design';
    if (reason === HOLD_REASON_WAITING_ADDRESS) return 'waiting-address';
    return 'other';
  }

  private async getCompletedCutoff(): Promise<Date> {
    const days =
      (await this.systemConfigService.get<number>(CUSTOMER_ORDER_COMPLETED_DAYS_KEY)) ??
      CUSTOMER_ORDER_COMPLETED_DAYS_DEFAULT;
    return new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
  }

  async getTrack(code: string): Promise<{ success: true; data: PublicOrderTrack }> {
    const trimmed = (code ?? '').trim();
    // Mọi nhánh "không tra được" đều ném CÙNG một lỗi 404: mã sai định dạng,
    // mã không tồn tại và mã tồn tại-nhưng-không-đọc-được phải không phân biệt
    // được từ ngoài, nếu không endpoint thành máy dò mã đơn có thật.
    if (!CODE_PATTERN.test(trimmed)) throw new NotFoundException('Không tìm thấy đơn với mã này.');

    const rx = { $regex: `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    const [order, staging] = await Promise.all([
      this.orderModel.findOne({ productionId: rx }).select(PUBLIC_ORDER_FIELDS).lean<PublicOrderDoc>(),
      this.customerOrderModel
        .findOne({ 'items.productionId': rx })
        .select('orderId identifier orderName items pushedAt status cancelledAt refundedAt createdAt shippingAddress')
        .lean(),
    ]);
    if (!order && !staging) throw new NotFoundException('Không tìm thấy đơn với mã này.');

    const lower = trimmed.toLowerCase();
    const stagingItems = ((staging?.items ?? []) as CustomerOrderItem[]).filter((i) => !!i.productionId);
    const item = stagingItems.find((i) => i.productionId?.toLowerCase() === lower);
    const productionId = order?.productionId ?? item?.productionId ?? trimmed;
    const cutoff = await this.getCompletedCutoff();

    const status = order
      ? deriveItemStatus(order, cutoff)
      : staging?.refundedAt
        ? CustomerOrderStatus.Refunded
        : staging?.cancelledAt || staging?.status === 'cancelled'
          ? CustomerOrderStatus.Cancelled
          : CustomerOrderStatus.Pending;

    const stage = order ? computeCurrentStage(order) : undefined;

    // Chặng chi tiết chỉ có nghĩa sau khi đơn đã vào sản xuất.
    let stages: PublicOrderTrack['stages'] = [];
    if (order) {
      const track = await this.orderService.getLifecycleTrack(order.productionId);
      stages = track.data.stages.map((s) => ({ ...s, label: CUSTOMER_STAGE_LABELS[s.key] ?? s.label }));
    }

    const siblings = await this.buildSiblings(stagingItems, lower, cutoff);
    const addr = order?.shippingAddress ?? staging?.shippingAddress;

    return {
      success: true,
      data: {
        productionId,
        externalId: order?.externalId || undefined,
        orderId: (order?.orderId ?? staging?.orderId) || undefined,
        identifier: staging?.identifier || undefined,
        orderName: staging?.orderName || undefined,

        status,
        onHold: !!order?.heldAt,
        holdKind: order?.heldAt ? this.holdKindOf(order.holdReason) : undefined,
        rework: order ? isReworkBadge(order) : false,
        pushed: !!order,
        completed: !!order?.fulfillmentCompletedAt,
        currentStageKey: order?.cancelledAt ? undefined : stage?.key,
        currentStageLabel: order?.cancelledAt ? undefined : stage?.label,
        currentStageAt: order?.cancelledAt ? undefined : stage?.at,

        product: {
          type: order?.type ?? item?.type,
          color: order?.color ?? item?.color,
          size: order?.size ?? item?.size,
          quantity: order?.quantity ?? item?.quantity,
          sku: item?.sku,
          merchantSku: item?.merchantSku,
          printMethod: order?.printMethod ?? item?.printMethod,
          mockupUrl: order?.mockupUrl ?? item?.mockupUrl,
        },

        dates: {
          orderAt: order?.orderAt ?? staging?.createdAt,
          pushedAt: (staging?.pushedAt as Date | undefined) ?? undefined,
          inProductionAt: order?.inProductionAt,
          fulfillmentCompletedAt: order?.fulfillmentCompletedAt,
          cancelledAt: order?.cancelledAt ?? (staging?.cancelledAt as Date | undefined) ?? undefined,
        },

        // `labelUrl` (file nhãn in được) cố ý KHÔNG ra ngoài — chỉ số/hãng/link tra.
        tracking: item?.tracking?.number || item?.tracking?.carrier || item?.tracking?.url
          ? { number: item.tracking?.number, carrier: item.tracking?.carrier, url: item.tracking?.url }
          : undefined,

        destination: addr ? { city: addr.city, state: addr.state, country: addr.country } : undefined,

        stages,
        siblings,
      },
    };
  }

  /** Các item CÙNG ĐƠN với mã đang tra — 1 query gộp, không N+1 theo từng mã. */
  private async buildSiblings(
    stagingItems: CustomerOrderItem[],
    lowerCode: string,
    cutoff: Date,
  ): Promise<PublicOrderTrack['siblings']> {
    const others = stagingItems.filter((i) => i.productionId?.toLowerCase() !== lowerCode);
    if (others.length === 0) return [];

    const pids = others.map((i) => i.productionId as string);
    const docs = await this.orderModel
      .find({ productionId: { $in: pids } })
      .select(PROD_DERIVE_FIELDS)
      .lean<Array<ProdDeriveFields & { productionId: string }>>();
    const byPid = new Map(docs.map((d) => [d.productionId, d]));

    return others.map((i) => {
      const prod = byPid.get(i.productionId as string);
      const stage = prod ? computeCurrentStage(prod) : undefined;
      return {
        productionId: i.productionId as string,
        type: i.type,
        color: i.color,
        size: i.size,
        quantity: i.quantity,
        status: prod ? deriveItemStatus(prod, cutoff) : CustomerOrderStatus.Pending,
        currentStageKey: prod?.cancelledAt ? undefined : stage?.key,
        currentStageLabel: prod?.cancelledAt ? undefined : stage?.label,
      };
    });
  }
}

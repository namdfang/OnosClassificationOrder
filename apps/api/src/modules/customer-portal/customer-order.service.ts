import type { OnModuleInit } from '@nestjs/common';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type {
  CancelCustomerStagingOrderDto,
  CustomerImportResultRow,
  CustomerOrderCounts,
  CustomerOrderPriceSnapshot,
  CustomerPushQuoteOrder,
  CustomerShipMethod,
  CustomerStagingItem,
  CustomerStagingItemInput,
  CustomerStagingOrder,
  CustomerStagingOrderResDto,
  GetCustomerDashboardResDto,
  GetCustomerOrderCountsResDto,
  GetCustomerOrderProductTypesResDto,
  GetCustomerOrderTrackResDto,
  GetCustomerStagingOrdersDto,
  GetCustomerStagingOrdersResDto,
  ImportCustomerOrdersDto,
  ImportCustomerOrdersResDto,
  ImportProductionOrderRow,
  OpenApiGetOrderResDto,
  PlaceCustomerOrderDto,
  PreviewPushCustomerOrdersResDto,
  ProductionOrderShippingAddress,
  ProductPrintArea,
  PushCustomerOrdersDto,
  PushCustomerOrdersResDto,
  ResolveImportSkusDto,
  ResolveImportSkusResDto,
  UpdateCustomerOrderDto,
  UpdateCustomerOrderResDto,
  UpdateCustomerStagingOrderDto,
} from 'shared';
import {
  CUSTOMER_ORDER_COMPLETED_DAYS_DEFAULT,
  CUSTOMER_ORDER_COMPLETED_DAYS_KEY,
  CUSTOMER_ORDER_STATUS_PROGRESS,
  CUSTOMER_PAYMENT_GATE_KEY,
  customerOrderKey,
  CustomerOrderStatus,
  DEFAULT_CUSTOMER_SHIP_METHOD,
  DesignerStatus,
  extractDesignSha,
  FULFILLMENT_STAGE_LABELS,
  FULFILLMENT_STAGE_ORDER,
  FulfillmentStage,
  LIFECYCLE_STAGE_KEYS,
  PRODUCT_PRINT_AREA_LABEL_MAP,
  RoleType,
} from 'shared';

import type { CustomerDocument } from '@/modules/customer/customer.entity';
import { CustomerOrderEventService } from '@/modules/customer-event/customer-order-event.service';
import { DesignStorageService } from '@/modules/design-storage/design-storage.service';
import { OrderEntity } from '@/modules/order/order.entity';
import { OrderService } from '@/modules/order/order.service';
import { ProductConfigEntity } from '@/modules/product-config/product-config.entity';
import { applyPromotionDiscount, promotionMatches, PromotionService } from '@/modules/promotion/promotion.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { customerMessage } from '@/shared/i18n/customer-messages';

import type { CustomerOrderItem } from './customer-order.entity';
import { CustomerOrderEntity } from './customer-order.entity';
import { CustomerPaymentEntity } from './customer-payment.entity';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Random `productionId` — CÙNG pattern với mã đơn thật từ hệ thống chính (2
 * chữ cái + "-" + 5 số + "-" + 5 số, xem `CUTTING_FILE_PRODUCTION_ID_REGEX`
 * trong `production-order.dto.ts`) để đơn khách tự đặt tương thích với mọi
 * logic parse/regex sẵn có theo pattern này (vd matching cutting file).
 */
const PRODUCTION_ID_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Chỗ giữ khi đẩy đơn (`pushingAt`) quá hạn này thì coi như hết hiệu lực —
 * tiến trình chết giữa chừng không khoá đơn vĩnh viễn. Đặt rộng hơn nhiều lần
 * thời gian một lượt push thật (importOrders cho vài chục item tính bằng
 * giây), để lượt đang chạy chậm không bị lượt khác cướp chỗ. Xem ORD-20.
 */
const PUSH_CLAIM_STALE_MS = 5 * 60_000;
function randomDigits5(): string {
  return String(Math.floor(Math.random() * 100000)).padStart(5, '0');
}
function randomProductionId(): string {
  const letters = Array.from({ length: 2 }, () => PRODUCTION_ID_LETTERS[Math.floor(Math.random() * 26)]).join('');
  return `${letters}-${randomDigits5()}-${randomDigits5()}`;
}

/** Nhãn chặng hiện tại — hiển thị khách hàng, KHÔNG dùng thuật ngữ nội bộ (vd 'sew-in'). */
export const CUSTOMER_STAGE_LABELS: Record<string, string> = {
  'tool-check': 'Đang xử lý',
  designer: 'Đang thiết kế',
  ...FULFILLMENT_STAGE_LABELS,
};

/** Field OrderEntity cần cho derive trạng thái khách — dùng CHUNG cho $lookup pipeline lẫn find(). */
export const PROD_DERIVE_FIELDS =
  'productionId cancelledAt fulfillmentCompletedAt currentFulfillmentStage heldAt holdReason ' +
  'designerStatus productionErrorSource toolResultNote toolCheckedAt ' +
  'designerAssignedAt designerFirstStartedAt designerCompletedAt fulfillmentStages inProductionAt';

export interface ProdDeriveFields {
  productionId?: string;
  cancelledAt?: Date;
  fulfillmentCompletedAt?: Date;
  currentFulfillmentStage?: FulfillmentStage;
  heldAt?: Date;
  holdReason?: string;
  designerStatus?: DesignerStatus;
  productionErrorSource?: string;
  toolResultNote?: string;
  toolCheckedAt?: Date;
  designerAssignedAt?: Date;
  designerFirstStartedAt?: Date;
  designerCompletedAt?: Date;
  fulfillmentStages?: Record<string, { waitingAt?: Date; startedAt?: Date; completedAt?: Date }>;
  inProductionAt?: Date;
}

/**
 * Chặng hiện tại rút gọn cho khách hàng — MIRROR nhánh tính `currentIndex` ở
 * `OrderService.getLifecycleTrack()` (order.service.ts). Cố tình KHÔNG tái
 * dùng thẳng `getLifecycleTrack` (query riêng theo từng đơn) để tránh N+1 khi
 * hiển thị listing nhiều đơn cùng lúc. Đổi logic chặng ở 1 nơi thì nhớ đổi
 * luôn nơi kia.
 */
export function computeCurrentStage(d: ProdDeriveFields): {
  /** Key chặng (`LIFECYCLE_STAGE_KEYS`) — để FE dịch nhãn theo ngôn ngữ người xem. */
  key?: string;
  label?: string;
  at?: Date;
  completed: boolean;
} {
  const completed = !!d.fulfillmentCompletedAt;
  if (completed) return { label: undefined, at: d.fulfillmentCompletedAt, completed };

  const toolEmpty = !d.toolResultNote;
  let currentIndex: number;
  if (d.currentFulfillmentStage) currentIndex = 2 + FULFILLMENT_STAGE_ORDER[d.currentFulfillmentStage];
  else if (d.designerStatus && d.designerStatus !== DesignerStatus.Unassigned)
    currentIndex = d.designerStatus === DesignerStatus.Done ? 2 : 1;
  else if (toolEmpty) currentIndex = 0;
  else currentIndex = 1;

  const key = LIFECYCLE_STAGE_KEYS[currentIndex] ?? LIFECYCLE_STAGE_KEYS[LIFECYCLE_STAGE_KEYS.length - 1];
  const at =
    key === 'tool-check'
      ? d.toolCheckedAt
      : key === 'designer'
        ? d.designerCompletedAt ?? d.designerFirstStartedAt ?? d.designerAssignedAt
        : d.fulfillmentStages?.[key]?.startedAt ?? d.fulfillmentStages?.[key]?.waitingAt;

  return { key, label: CUSTOMER_STAGE_LABELS[key] ?? key, at, completed };
}

/**
 * Badge "Đang sửa lỗi" (Rework) — plan §1.1b: `designerStatus='rework'` HOẶC
 * (`productionErrorSource='tool-check'` && `toolResultNote` có giá trị != 'ok').
 * MIRROR với biểu thức aggregation trong `buildDerivePipeline()` — đổi 1 nơi
 * nhớ đổi nơi kia.
 */
export function isReworkBadge(p: ProdDeriveFields): boolean {
  if (p.designerStatus === DesignerStatus.Rework) return true;
  const note = (p.toolResultNote || '').trim().toLowerCase();
  return p.productionErrorSource === 'tool-check' && note !== '' && note !== 'ok';
}

/**
 * Trạng thái khách của 1 item đã push — plan §1: Processing = chưa từng vào
 * In; In Production = `currentFulfillmentStage` set; Fulfilled = đóng hàng
 * xong; Completed = Fulfilled + N ngày (cutoff tính sẵn từ system_configs).
 * MIRROR với `buildDerivePipeline()`.
 */
export function deriveItemStatus(p: ProdDeriveFields, completedCutoff: Date): CustomerOrderStatus {
  if (p.cancelledAt) return CustomerOrderStatus.Cancelled;
  if (p.fulfillmentCompletedAt)
    return p.fulfillmentCompletedAt <= completedCutoff ? CustomerOrderStatus.Completed : CustomerOrderStatus.Fulfilled;
  if (p.currentFulfillmentStage) return CustomerOrderStatus.InProduction;
  return CustomerOrderStatus.Processing;
}

/** Config + variation resolve được từ SKU / type — context chốt giá dùng chung import/preview/push. */
interface PricingConfig {
  _id: string;
  fullName: string;
  productCategoryId?: string;
  /** Ảnh mockup sản phẩm — trả về preview import cho khách đối chiếu. */
  mockup?: string;
  /** Vị trí in của sản phẩm — dùng để đòi design ở vị trí BẮT BUỘC (ORD-22). */
  printArea?: ProductPrintArea;
  variations: Array<{
    sku: string;
    attributes?: Array<{ label: string; value: string }>;
    status?: string;
    retailPrice?: number;
    nonShipCost?: number;
  }>;
}
interface PricingContext {
  bySku: Map<string, { config: PricingConfig; variation: PricingConfig['variations'][number] }>;
  byType: Map<string, PricingConfig>;
  /** Tra ngược theo `QuoteResult.productConfigId` — cần cho bước kiểm design (ORD-22). */
  byId: Map<string, PricingConfig>;
}
type ActivePromotion = Awaited<ReturnType<PromotionService['getActiveInDateRange']>>[number];

interface QuoteResult {
  productConfigId?: string;
  type?: string;
  size?: string;
  color?: string;
  snapshot?: CustomerOrderPriceSnapshot;
  error?: string;
}

/** Lấy value thuộc tính variation theo tên label (size/color) — attributes tự do key-value. */
function attrValue(
  attributes: Array<{ label: string; value: string }> | undefined,
  pattern: RegExp,
): string | undefined {
  return attributes?.find((a) => pattern.test(a.label))?.value;
}
const SIZE_LABEL = /size|kích/i;
const COLOR_LABEL = /color|colour|màu/i;

@Injectable()
export class CustomerOrderService implements OnModuleInit {
  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    @InjectModel(CustomerOrderEntity.name) private readonly customerOrderModel: Model<CustomerOrderEntity>,
    @InjectModel(CustomerPaymentEntity.name) private readonly customerPaymentModel: Model<CustomerPaymentEntity>,
    @InjectModel(ProductConfigEntity.name) private readonly productConfigModel: Model<ProductConfigEntity>,
    private readonly orderService: OrderService,
    private readonly promotionService: PromotionService,
    private readonly systemConfigService: SystemConfigService,
    private readonly designStorageService: DesignStorageService,
    private readonly customerOrderEventService: CustomerOrderEventService,
  ) {}

  // -------------------------------------------------------------------------
  // Backfill Luồng A (plan §12.5): đơn khách cũ trong `orders` → staging row
  // `pushedAt=createdAt`, KHÔNG tạo payment record (đơn hệ cũ không có giá
  // chốt — ledger chỉ ghi từ các lần push mới). Chạy 1 lần theo marker; đơn
  // sync về SAU đó được lazy-sync per-customer mỗi lần khách mở listing.
  // -------------------------------------------------------------------------

  async onModuleInit() {
    const MARKER = 'customer_orders_backfill_v1';
    try {
      const done = await this.systemConfigService.get<string>(MARKER);
      if (done) return;
      const customers = await this.customerOrderModel.db
        .collection('customers')
        .find({ deletedAt: null, $or: [{ userSku: { $ne: '' } }, { userEmail: { $ne: '' } }] })
        .project({ _id: 1, userSku: 1, userEmail: 1 })
        .toArray();
      let total = 0;
      for (const c of customers) {
        total += await this.syncLegacyOrdersForCustomer({
          _id: c._id,
          userSku: (c.userSku as string) || '',
          userEmail: (c.userEmail as string) || '',
        });
      }
      await this.systemConfigService.set(MARKER, new Date().toISOString(), 'Backfill staging customer_orders Luồng A');
      if (total > 0) console.log(`[customer-orders-backfill] created ${total} staging rows for legacy orders`);
    } catch (err) {
      console.error('[customer-orders-backfill] failed:', (err as Error).message);
    }
  }

  /**
   * Tạo staging row cho các đơn `OrderEntity` của khách CHƯA có trong staging
   * (đơn Luồng A sync từ hệ cũ) — idempotent nhờ unique (customerId, orderKey)
   * + insertMany ordered:false nuốt lỗi trùng. 1 đơn cũ = 1 staging doc 1 item.
   */
  private async syncLegacyOrdersForCustomer(customer: {
    _id: unknown;
    userSku: string;
    userEmail: string;
  }): Promise<number> {
    if (!customer.userSku && !customer.userEmail) return 0;
    const customerId = String(customer._id);
    const stagedPids = (
      await this.customerOrderModel.distinct('items.productionId', { customerId })
    ).filter((p): p is string => !!p);
    const missing = await this.orderModel
      .find({
        userSku: customer.userSku,
        userEmail: customer.userEmail,
        ...(stagedPids.length > 0 ? { productionId: { $nin: stagedPids } } : {}),
      })
      .select('productionId orderId type color size quantity mockupUrl printMethod designs shippingAddress productConfigId createdAt')
      .lean();
    if (missing.length === 0) return 0;

    const docs = missing.map((o) => ({
      customerId,
      userSku: customer.userSku,
      userEmail: customer.userEmail,
      orderKey: `legacy-${(o.productionId || '').toLowerCase()}`,
      orderId: o.orderId || o.productionId,
      source: 'sync' as const,
      status: 'pending' as const,
      shippingAddress: o.shippingAddress,
      items: [
        {
          type: o.type,
          color: o.color,
          size: o.size,
          quantity: o.quantity ?? 1,
          mockupUrl: o.mockupUrl,
          printMethod: o.printMethod,
          designs: o.designs,
          productConfigId: o.productConfigId ? String(o.productConfigId) : undefined,
          productionId: o.productionId,
        },
      ],
      pushedAt: o.createdAt ?? new Date(),
    }));
    try {
      const res = await this.customerOrderModel.insertMany(docs, { ordered: false });
      return res.length;
    } catch (err) {
      // BulkWriteError vì trùng orderKey (đã staged bởi request song song) — phần không trùng vẫn được insert.
      const inserted = (err as { insertedDocs?: unknown[] }).insertedDocs?.length ?? 0;
      return inserted;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers chung
  // -------------------------------------------------------------------------

  /**
   * Sinh `productionId` random KHÔNG đụng đơn đã có — cấp NGAY lúc tạo/import
   * staging (mã đi xuyên suốt portal → xưởng) nên phải check cả `orders` lẫn
   * item staging trong `customer_orders`. Retry vài lần cho chắc (không gian
   * mã ~6.7 nghìn tỷ, va chạm cực hiếm).
   */
  private async generateUniqueProductionId(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = randomProductionId();
      const [inOrders, inStaging] = await Promise.all([
        this.orderModel.exists({ productionId: candidate }),
        this.customerOrderModel.exists({ 'items.productionId': candidate }),
      ]);
      if (!inOrders && !inStaging) return candidate;
    }
    throw new Error('Không thể sinh mã đơn hàng, vui lòng thử lại');
  }

  /** Cấp mã cho mọi item chưa có `productionId` (tạo form / import CSV / thêm item khi sửa pending). */
  private async assignProductionIds(items: CustomerOrderItem[]): Promise<CustomerOrderItem[]> {
    for (const item of items) {
      if (!item.productionId) item.productionId = await this.generateUniqueProductionId();
    }
    return items;
  }

  /** Cutoff Completed = now − N ngày (N từ system_configs, plan §12.3). */
  private async getCompletedCutoff(): Promise<Date> {
    const days =
      (await this.systemConfigService.get<number>(CUSTOMER_ORDER_COMPLETED_DAYS_KEY)) ??
      CUSTOMER_ORDER_COMPLETED_DAYS_DEFAULT;
    return new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
  }

  /**
   * Pipeline aggregation dùng CHUNG listing + counts: $lookup orders theo
   * `items[].productionId` + $addFields `statusDerived`/`heldAny`/`reworkAny`.
   * MIRROR logic JS `deriveItemStatus`/`isReworkBadge`/`deriveOrderStatus` —
   * đổi 1 nơi nhớ đổi nơi kia.
   */
  private buildDerivePipeline(customerId: string, completedCutoff: Date): Record<string, unknown>[] {
    const progressExpr = {
      $switch: {
        branches: [
          {
            case: { $ne: [{ $ifNull: ['$$p.fulfillmentCompletedAt', null] }, null] },
            then: { $cond: [{ $lte: ['$$p.fulfillmentCompletedAt', completedCutoff] }, 4, 3] },
          },
          { case: { $ne: [{ $ifNull: ['$$p.currentFulfillmentStage', null] }, null] }, then: 2 },
        ],
        default: 1,
      },
    };
    const reworkCond = {
      $or: [
        { $eq: ['$$p.designerStatus', DesignerStatus.Rework] },
        {
          $and: [
            { $eq: ['$$p.productionErrorSource', 'tool-check'] },
            { $not: [{ $in: [{ $toLower: { $trim: { input: { $ifNull: ['$$p.toolResultNote', ''] } } } }, ['', 'ok']] }] },
          ],
        },
      ],
    };
    return [
      { $match: { customerId } },
      {
        // Nối bằng localField/foreignField để DÙNG ĐƯỢC index `productionId_1`.
        // Bản cũ lọc bằng `$expr: { $in: ['$productionId', '$$pids'] }` — `$expr`
        // KHÔNG dùng được index, nên mỗi document staging phải quét TOÀN BỘ
        // `orders`: khách 3.478 đơn × 40.065 đơn sản xuất ≈ 139 triệu lượt quét,
        // listing 71 giây. Dạng này đo lại còn 0,5 giây, kết quả khớp từng đơn.
        //
        // `productionId: { $ne: null }` là chốt chặn, KHÔNG phải trang trí: hai
        // dạng nối chỉ lệch nhau ở chỗ dạng mới còn khớp cả đơn có
        // `productionId` null/thiếu (khi `items` rỗng hoặc item thiếu
        // `productionId`). Entity khai `required: true, unique: true` nên đơn
        // như vậy không tồn tại, chốt này giữ cho tương lai. Xem ORD-18.
        $lookup: {
          from: 'orders',
          localField: 'items.productionId',
          foreignField: 'productionId',
          pipeline: [
            { $match: { productionId: { $ne: null } } },
            {
              $project: Object.fromEntries(PROD_DERIVE_FIELDS.split(' ').map((f) => [f, 1])),
            },
          ],
          as: 'prodOrders',
        },
      },
      {
        $addFields: {
          activeProd: {
            $filter: {
              input: '$prodOrders',
              as: 'p',
              cond: { $eq: [{ $ifNull: ['$$p.cancelledAt', null] }, null] },
            },
          },
        },
      },
      {
        $addFields: {
          statusDerived: {
            $switch: {
              branches: [
                { case: { $eq: ['$status', 'cancelled'] }, then: CustomerOrderStatus.Cancelled },
                {
                  case: { $ne: [{ $ifNull: ['$refundedAt', null] }, null] },
                  then: CustomerOrderStatus.Refunded,
                },
                { case: { $eq: [{ $ifNull: ['$pushedAt', null] }, null] }, then: CustomerOrderStatus.Pending },
                { case: { $eq: [{ $size: '$activeProd' }, 0] }, then: CustomerOrderStatus.Cancelled },
              ],
              default: {
                $let: {
                  vars: { minP: { $min: { $map: { input: '$activeProd', as: 'p', in: progressExpr } } } },
                  in: {
                    $switch: {
                      branches: [
                        { case: { $eq: ['$$minP', 1] }, then: CustomerOrderStatus.Processing },
                        { case: { $eq: ['$$minP', 2] }, then: CustomerOrderStatus.InProduction },
                        { case: { $eq: ['$$minP', 3] }, then: CustomerOrderStatus.Fulfilled },
                      ],
                      default: CustomerOrderStatus.Completed,
                    },
                  },
                },
              },
            },
          },
          heldAny: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: '$activeProd',
                    as: 'p',
                    cond: { $ne: [{ $ifNull: ['$$p.heldAt', null] }, null] },
                  },
                },
              },
              0,
            ],
          },
          reworkAny: {
            $gt: [{ $size: { $filter: { input: '$activeProd', as: 'p', cond: reworkCond } } }, 0],
          },
          sortAt: { $ifNull: ['$pushedAt', '$createdAt'] },
        },
      },
    ];
  }

  /** Map staging doc (+ prod orders đã join) → response `CustomerStagingOrder`. */
  private toStagingOrder(
    doc: Record<string, unknown>,
    prodByPid: Map<string, ProdDeriveFields>,
    completedCutoff: Date,
  ): CustomerStagingOrder {
    const rawItems = (doc.items || []) as CustomerOrderItem[];
    const pushed = !!doc.pushedAt;
    const items: CustomerStagingItem[] = rawItems.map((it) => {
      const base: CustomerStagingItem = {
        sku: it.sku,
        merchantSku: it.merchantSku,
        productConfigId: it.productConfigId,
        type: it.type,
        color: it.color,
        size: it.size,
        quantity: it.quantity ?? 1,
        shipMethod: it.shipMethod,
        activeService: it.activeService,
        mockupUrl: it.mockupUrl,
        printMethod: it.printMethod,
        designs: it.designs,
        tracking: it.tracking,
        priceSnapshot: it.priceSnapshot,
        productionId: it.productionId,
      };
      if (!pushed || !it.productionId) return base;
      const p = prodByPid.get(it.productionId);
      // Đơn nội bộ đã bị xóa (deleteOrder) → coi như hủy.
      if (!p) return { ...base, status: CustomerOrderStatus.Cancelled };
      const stage = computeCurrentStage(p);
      return {
        ...base,
        status: deriveItemStatus(p, completedCutoff),
        currentStageLabel: p.cancelledAt ? undefined : stage.label,
        currentStageAt: p.cancelledAt ? undefined : stage.at,
        held: !!p.heldAt,
        holdReason: p.holdReason,
        rework: isReworkBadge(p),
        cancelledAt: p.cancelledAt,
      };
    });

    // Trạng thái mức ĐƠN = item CHẬM NHẤT trong các item chưa hủy (plan §2).
    let status: CustomerOrderStatus;
    if (doc.status === 'cancelled') status = CustomerOrderStatus.Cancelled;
    else if (doc.refundedAt) status = CustomerOrderStatus.Refunded;
    else if (!pushed) status = CustomerOrderStatus.Pending;
    else {
      const active = items.filter((i) => i.status && i.status !== CustomerOrderStatus.Cancelled);
      if (active.length === 0) status = CustomerOrderStatus.Cancelled;
      else {
        let min = Number.POSITIVE_INFINITY;
        let minStatus = CustomerOrderStatus.Processing;
        for (const i of active) {
          const p = CUSTOMER_ORDER_STATUS_PROGRESS[i.status as CustomerOrderStatus] ?? 1;
          if (p < min) {
            min = p;
            minStatus = i.status as CustomerOrderStatus;
          }
        }
        status = minStatus;
      }
    }

    const totalAmount = items.reduce((s, i) => s + (i.priceSnapshot?.lineTotal ?? 0), 0);
    return {
      _id: String(doc._id),
      orderKey: doc.orderKey as string,
      orderId: doc.orderId as string | undefined,
      identifier: doc.identifier as string | undefined,
      orderName: doc.orderName as string | undefined,
      source: (doc.source as CustomerStagingOrder['source']) ?? 'form',
      status,
      held: items.some((i) => i.held),
      rework: items.some((i) => i.rework),
      note: doc.note as string | undefined,
      shippingAddress: doc.shippingAddress as ProductionOrderShippingAddress | undefined,
      items,
      totalQuantity: items.reduce((s, i) => s + (i.quantity ?? 1), 0),
      totalAmount: totalAmount > 0 ? Math.round(totalAmount * 100) / 100 : undefined,
      pushedAt: (doc.pushedAt as Date | null) ?? undefined,
      createdAt: doc.createdAt as Date | undefined,
      cancelledAt: (doc.cancelledAt as Date | null) ?? undefined,
      cancelReason: doc.cancelReason as string | undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Chốt giá (plan §13.2) — dùng chung import (giá tham khảo) + preview + push
  // -------------------------------------------------------------------------

  /** Load ProductConfig theo SKU (variations) + theo type (fullName) cho 1 batch items. */
  private async buildPricingContext(
    items: Array<{ sku?: string; type?: string }>,
  ): Promise<PricingContext> {
    const skus = [...new Set(items.map((i) => i.sku?.trim().toUpperCase()).filter((s): s is string => !!s))];
    const types = [...new Set(items.map((i) => i.type?.trim()).filter((t): t is string => !!t))];
    const or: Record<string, unknown>[] = [];
    if (skus.length > 0) or.push({ 'variations.sku': { $in: skus } });
    if (types.length > 0)
      or.push({ fullName: { $in: types.map((t) => new RegExp(`^${escapeRegex(t)}$`, 'i')) } });
    const bySku = new Map<string, { config: PricingConfig; variation: PricingConfig['variations'][number] }>();
    const byType = new Map<string, PricingConfig>();
    const byId = new Map<string, PricingConfig>();
    if (or.length === 0) return { bySku, byType, byId };

    const configs = (await this.productConfigModel
      .find({ $or: or })
      .select('fullName productCategoryId variations mockup printArea')
      .lean()) as unknown as Array<PricingConfig & { _id: unknown }>;
    for (const c of configs) {
      const config: PricingConfig = {
        _id: String(c._id),
        fullName: c.fullName,
        productCategoryId: c.productCategoryId ? String(c.productCategoryId) : undefined,
        mockup: c.mockup,
        printArea: c.printArea,
        variations: c.variations || [],
      };
      byType.set(config.fullName.trim().toLowerCase(), config);
      byId.set(config._id, config);
      for (const v of config.variations) {
        if (v.sku) bySku.set(v.sku.trim().toUpperCase(), { config, variation: v });
      }
    }
    return { bySku, byType, byId };
  }

  /** Chọn variation theo size/color khi item không có SKU (đơn form) — chỉ nhận khi match không mơ hồ. */
  private pickVariation(
    config: PricingConfig,
    size?: string,
    color?: string,
  ): PricingConfig['variations'][number] | undefined {
    const active = config.variations.filter((v) => v.status !== '0');
    if (active.length === 1) return active[0];
    const eq = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
    let candidates = active;
    if (size) candidates = candidates.filter((v) => eq(attrValue(v.attributes, SIZE_LABEL), size));
    if (color) candidates = candidates.filter((v) => eq(attrValue(v.attributes, COLOR_LABEL), color));
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  /**
   * Chốt giá 1 item: `cod`/`tiktok` (không dùng ship US của xưởng) →
   * `nonShipCost` fallback `retailPrice`; `express_us`/`economy_us` →
   * `retailPrice` fallback `nonShipCost`; sau đó áp Promotion theo tier
   * (tái dùng promotionMatches/applyPromotionDiscount như customer-catalog).
   */
  private quoteItem(
    item: { sku?: string; type?: string; size?: string; color?: string; quantity?: number; shipMethod?: CustomerShipMethod },
    ctx: PricingContext,
    activePromotions: ActivePromotion[],
    tier: number | null,
  ): QuoteResult {
    let config: PricingConfig | undefined;
    let variation: PricingConfig['variations'][number] | undefined;
    if (item.sku?.trim()) {
      const hit = ctx.bySku.get(item.sku.trim().toUpperCase());
      if (!hit) return { error: `SKU "${item.sku.trim()}" không tồn tại trong catalog` };
      config = hit.config;
      variation = hit.variation;
    } else if (item.type?.trim()) {
      config = ctx.byType.get(item.type.trim().toLowerCase());
      if (!config) return { error: `Sản phẩm "${item.type.trim()}" không có trong catalog` };
      variation = this.pickVariation(config, item.size, item.color);
    } else {
      return { error: 'Item thiếu cả sku lẫn type' };
    }

    const resolved: QuoteResult = {
      productConfigId: config._id,
      type: config.fullName,
      size: attrValue(variation?.attributes, SIZE_LABEL) ?? item.size,
      color: attrValue(variation?.attributes, COLOR_LABEL) ?? item.color,
    };
    if (!variation) return { ...resolved, error: 'Không xác định được biến thể (size/màu) để chốt giá' };

    const shipMethod = item.shipMethod ?? DEFAULT_CUSTOMER_SHIP_METHOD;
    const unitPrice =
      shipMethod === 'cod' || shipMethod === 'tiktok'
        ? variation.nonShipCost ?? variation.retailPrice
        : variation.retailPrice ?? variation.nonShipCost;
    if (unitPrice == null) return { ...resolved, error: 'Biến thể chưa có giá bán' };

    const quantity = item.quantity ?? 1;
    const matched = activePromotions
      .filter((p) =>
        promotionMatches(p, { productConfigId: config._id, productCategoryId: config.productCategoryId, tier, quantity }),
      )
      .map((p) => ({ promotion: p, price: applyPromotionDiscount(unitPrice, p) }))
      .sort((a, b) => a.price - b.price);
    const best = matched[0];
    const effective = best ? best.price : unitPrice;
    return {
      ...resolved,
      snapshot: {
        shipMethod,
        unitPrice,
        discountedPrice: best?.price,
        promotionName: best?.promotion.name,
        lineTotal: Math.round(effective * quantity * 100) / 100,
      },
    };
  }

  /**
   * Gom mọi URL design của list items — feed cho `touchUsageForUrls` (tự lọc
   * URL thuộc CDN design, còn lại bỏ qua). Xem DesignStorage plan.
   */
  private collectDesignUrls(items: Array<{ designs?: Record<string, string | undefined> }>): string[] {
    return items.flatMap((it) => Object.values(it.designs ?? {})).filter((u): u is string => !!u);
  }

  // -------------------------------------------------------------------------
  // Đặt đơn form → staging PENDING (plan §2 — KHÔNG gọi importOrders nữa)
  // -------------------------------------------------------------------------

  /**
   * Đòi mockup + design ở MỌI vị trí in bắt buộc, ngay tại máy chủ (ORD-22).
   *
   * Giao diện `new.tsx` đã chặn, nhưng giao diện không phải hàng rào: chỉ cần
   * một lần sửa điều kiện chặn ở đó là đơn rỗng lọt vào. Và hậu quả không dừng
   * ở staging — đơn đi tiếp sang sản xuất rồi TỚI TẬN XƯỞNG mới lộ ra là không
   * có gì để in, lúc đó đã chiếm mã đơn và đã vào hàng đợi soát tool.
   *
   * Luật lấy ĐÚNG như giao diện: `isRequired !== false` (vị trí không set cờ
   * coi như bắt buộc). Hai bên lệch nhau còn tệ hơn không kiểm — khách bị chặn
   * ở một nơi và lọt ở nơi khác thì không ai giải thích được.
   */
  private assertArtworkComplete(
    // Kiểu cấu trúc tối thiểu — dùng CHUNG cho item lúc đặt đơn (ORD-22) và
    // item staging lúc đẩy sản xuất (ORD-25). Một luật, một hàm.
    items: Array<{ type?: string; mockupUrl?: string; designs?: Record<string, string | undefined> }>,
    quotes: QuoteResult[],
    ctx: PricingContext,
  ): void {
    items.forEach((item, i) => {
      const label = quotes[i]?.type ?? item.type ?? `#${i + 1}`;
      if (!item.mockupUrl?.trim()) {
        throw new BadRequestException(customerMessage('missingMockup', label));
      }
      const configId = quotes[i]?.productConfigId;
      const areas = (configId ? ctx.byId.get(configId)?.printArea : undefined) ?? [];
      // Sản phẩm chưa cấu hình vị trí in nào → không đòi design, chỉ đòi mockup.
      const missing = areas
        .filter((a) => a.isRequired !== false)
        .filter((a) => !item.designs?.[a.key]?.trim());
      if (missing.length > 0) {
        // Nhãn tiếng Việt lấy từ bản đồ dùng chung với FE, khỏi lệch chữ. Kèm
        // key gốc trong ngoặc vì bản đồ nhãn CHỈ có tiếng Việt — người đọc bản
        // tiếng Anh vẫn cần biết chính xác vị trí nào.
        const names = missing.map((a) => `${PRODUCT_PRINT_AREA_LABEL_MAP[a.key] ?? a.key} (${a.key})`).join(', ');
        throw new BadRequestException(customerMessage('missingDesign', label, names));
      }
    });
  }

  async placeOrder(customer: CustomerDocument, dto: PlaceCustomerOrderDto): Promise<CustomerStagingOrderResDto> {
    const ctx = await this.buildPricingContext(dto.items);
    const [activePromotions, cutoff] = await Promise.all([
      this.promotionService.getActiveInDateRange(),
      this.getCompletedCutoff(),
    ]);
    const tier = customer.tier ?? null;

    const quotes = dto.items.map((item) => this.quoteItem(item, ctx, activePromotions, tier));
    this.assertArtworkComplete(dto.items, quotes, ctx);

    const items: CustomerOrderItem[] = dto.items.map((item, i) => {
      const q = quotes[i];
      return {
        type: q.type ?? item.type,
        color: q.color ?? item.color,
        size: q.size ?? item.size,
        productConfigId: q.productConfigId,
        quantity: item.quantity ?? 1,
        shipMethod: DEFAULT_CUSTOMER_SHIP_METHOD,
        mockupUrl: item.mockupUrl,
        printMethod: item.printMethod,
        weight: item.weight,
        width: item.width,
        height: item.height,
        length: item.length,
        designs: item.designs,
        priceSnapshot: q.snapshot,
      };
    });
    await this.assignProductionIds(items);

    const doc = await this.customerOrderModel.create({
      customerId: String(customer._id),
      userSku: customer.userSku,
      userEmail: customer.userEmail,
      orderKey: `form-${new Types.ObjectId().toString()}`,
      source: 'form',
      status: 'pending',
      shippingAddress: dto.shippingAddress,
      note: dto.referent,
      items,
    });

    // Design đã upload lên CDN → reset sliding window lastUsedAt (dedup/lifecycle).
    await this.designStorageService.touchUsageForUrls(this.collectDesignUrls(items));

    return { success: true, data: this.toStagingOrder(doc.toObject(), new Map(), cutoff) };
  }

  // -------------------------------------------------------------------------
  // Listing + counts (derive 8 status, plan §1 + §9)
  // -------------------------------------------------------------------------

  async listOrders(
    customer: CustomerDocument,
    dto: GetCustomerStagingOrdersDto,
  ): Promise<GetCustomerStagingOrdersResDto> {
    // Lazy-sync đơn Luồng A mới (sync hệ cũ sau backfill) trước khi list.
    await this.syncLegacyOrdersForCustomer({
      _id: customer._id,
      userSku: customer.userSku,
      userEmail: customer.userEmail,
    });

    const cutoff = await this.getCompletedCutoff();
    const pipeline: Record<string, unknown>[] = this.buildDerivePipeline(String(customer._id), cutoff);
    if (dto.search?.trim()) {
      const rx = { $regex: escapeRegex(dto.search.trim()), $options: 'i' };
      pipeline.push({
        $match: { $or: [{ orderId: rx }, { orderName: rx }, { 'items.productionId': rx }, { 'items.sku': rx }] },
      });
    }
    if (dto.status) pipeline.push({ $match: { statusDerived: dto.status } });
    if (dto.held) pipeline.push({ $match: { heldAny: true } });
    pipeline.push(
      { $sort: { sortAt: -1, _id: -1 } },
      {
        $facet: {
          page: [{ $skip: (dto.page - 1) * dto.limit }, { $limit: dto.limit }],
          total: [{ $count: 'n' }],
        },
      },
    );

    const [res] = await this.customerOrderModel.aggregate<{
      page: Array<Record<string, unknown> & { prodOrders?: ProdDeriveFields[] }>;
      total: Array<{ n: number }>;
    }>(pipeline as never[]);

    const data = (res?.page ?? []).map((doc) => {
      const prodByPid = new Map<string, ProdDeriveFields>(
        (doc.prodOrders ?? []).map((p) => [p.productionId as string, p]),
      );
      return this.toStagingOrder(doc, prodByPid, cutoff);
    });
    return { success: true, data, total: res?.total?.[0]?.n ?? 0 };
  }

  async getCounts(customer: CustomerDocument): Promise<GetCustomerOrderCountsResDto> {
    const cutoff = await this.getCompletedCutoff();
    const pipeline = [
      ...this.buildDerivePipeline(String(customer._id), cutoff),
      {
        $group: {
          _id: '$statusDerived',
          count: { $sum: 1 },
          held: { $sum: { $cond: ['$heldAny', 1, 0] } },
          rework: { $sum: { $cond: ['$reworkAny', 1, 0] } },
        },
      },
    ];
    const rows = await this.customerOrderModel.aggregate<{ _id: string; count: number; held: number; rework: number }>(
      pipeline as never[],
    );
    const counts: CustomerOrderCounts = {
      all: 0,
      pending: 0,
      processing: 0,
      inProduction: 0,
      fulfilled: 0,
      completed: 0,
      refunded: 0,
      cancelled: 0,
      held: 0,
      rework: 0,
    };
    const keyMap: Record<string, keyof CustomerOrderCounts> = {
      [CustomerOrderStatus.Pending]: 'pending',
      [CustomerOrderStatus.Processing]: 'processing',
      [CustomerOrderStatus.InProduction]: 'inProduction',
      [CustomerOrderStatus.Fulfilled]: 'fulfilled',
      [CustomerOrderStatus.Completed]: 'completed',
      [CustomerOrderStatus.Refunded]: 'refunded',
      [CustomerOrderStatus.Cancelled]: 'cancelled',
    };
    for (const r of rows) {
      counts.all += r.count;
      const k = keyMap[r._id];
      if (k) counts[k] += r.count;
      counts.held += r.held;
      counts.rework += r.rework;
    }
    return { success: true, data: counts };
  }

  // -------------------------------------------------------------------------
  // Public Order API (ORD-4) — adapter mỏng trên các method sẵn có, cùng ranh
  // giới dữ liệu: mọi query đều scoped theo customerId của key.
  // -------------------------------------------------------------------------

  /**
   * Resolve staging ids từ `externalRefs` (orderKey của khách) + `ids` — CHỈ
   * đơn của CHÍNH khách. Ref không tồn tại đơn giản là không có trong kết quả
   * (push sẽ báo `failed: Không tìm thấy đơn` cho id lạ, không lộ tồn tại).
   */
  async resolveStagingIdsForApi(
    customer: CustomerDocument,
    dto: { externalRefs?: string[]; ids?: string[] },
  ): Promise<string[]> {
    const ids = [...(dto.ids ?? [])];
    if (dto.externalRefs?.length) {
      const keys = dto.externalRefs.map((r) => customerOrderKey(r, undefined));
      const docs = await this.customerOrderModel
        .find({ customerId: String(customer._id), orderKey: { $in: keys } })
        .select('_id')
        .lean();
      ids.push(...docs.map((d) => String(d._id)));
    }
    return [...new Set(ids)];
  }

  /**
   * Tra 1 đơn theo `externalRef` HOẶC `productionId` của 1 item — đúng shape
   * listing portal (derive 8 trạng thái + badge). Không thuộc khách này → 404
   * chung chung (không lộ đơn tồn tại). Nếu ref là productionId đã push → kèm
   * `track` mirror trang track portal (cùng `trackOrder`, vốn không chứa tên
   * nhân viên/giá vốn).
   */
  async getOrderByRefForApi(customer: CustomerDocument, ref: string): Promise<OpenApiGetOrderResDto> {
    await this.syncLegacyOrdersForCustomer({
      _id: customer._id,
      userSku: customer.userSku,
      userEmail: customer.userEmail,
    });
    const trimmed = (ref ?? '').trim();
    if (!trimmed) throw new NotFoundException(customerMessage('orderNotFound'));
    const cutoff = await this.getCompletedCutoff();
    const rx = { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' };
    const pipeline = [
      ...this.buildDerivePipeline(String(customer._id), cutoff),
      { $match: { $or: [{ orderKey: customerOrderKey(trimmed, undefined) }, { 'items.productionId': rx }] } },
      { $limit: 1 },
    ];
    const [doc] = await this.customerOrderModel.aggregate<
      Record<string, unknown> & { prodOrders?: ProdDeriveFields[] }
    >(pipeline as never[]);
    if (!doc) throw new NotFoundException(customerMessage('orderNotFound'));

    const prodByPid = new Map<string, ProdDeriveFields>(
      (doc.prodOrders ?? []).map((p) => [p.productionId as string, p]),
    );
    const order = this.toStagingOrder(doc, prodByPid, cutoff);

    const matchedItem = order.items.find((i) => i.productionId?.toLowerCase() === trimmed.toLowerCase());
    let track: OpenApiGetOrderResDto['data']['track'];
    if (matchedItem?.productionId && order.pushedAt) {
      try {
        track = (await this.trackOrder(customer, matchedItem.productionId)).data;
      } catch {
        track = undefined;
      }
    }
    return { success: true, data: { order, track } };
  }

  // -------------------------------------------------------------------------
  // Sửa / hủy đơn PENDING (plan §2 — sửa tự do trước push)
  // -------------------------------------------------------------------------

  private async getPendingStagingOrder(customer: CustomerDocument, id: string) {
    const doc = await this.customerOrderModel.findOne({ _id: id, customerId: String(customer._id) });
    if (!doc) throw new NotFoundException(customerMessage('orderNotFoundDot'));
    if (doc.status === 'cancelled') throw new BadRequestException(customerMessage('orderCancelled'));
    if (doc.pushedAt) throw new BadRequestException(customerMessage('orderPushedEditLimited'));
    return doc;
  }

  async updateStagingOrder(
    customer: CustomerDocument,
    id: string,
    dto: UpdateCustomerStagingOrderDto,
  ): Promise<CustomerStagingOrderResDto> {
    const doc = await this.getPendingStagingOrder(customer, id);
    const set: Record<string, unknown> = {};
    if (dto.orderName !== undefined) set.orderName = dto.orderName;
    if (dto.note !== undefined) set.note = dto.note;
    if (dto.shippingAddress) set.shippingAddress = dto.shippingAddress;
    if (dto.items) {
      const ctx = await this.buildPricingContext(dto.items);
      const [activePromotions] = await Promise.all([this.promotionService.getActiveInDateRange()]);
      const tier = customer.tier ?? null;
      // Chỉ nhận echo-back productionId ĐANG thuộc chính đơn này — mã lạ bỏ qua, item mới cấp mã mới.
      const ownPids = new Set(
        ((doc.items || [])).map((i) => i.productionId).filter(Boolean),
      );
      const newItems = dto.items.map((item: CustomerStagingItemInput): CustomerOrderItem => {
        const q = this.quoteItem(item, ctx, activePromotions, tier);
        // ownPids.delete → mỗi mã chỉ dùng lại được 1 lần (echo trùng → item sau cấp mã mới).
        const keepPid = !!item.productionId && ownPids.delete(item.productionId);
        return {
          productionId: keepPid ? item.productionId : undefined,
          sku: item.sku?.trim() ? item.sku.trim().toUpperCase() : undefined,
          merchantSku: item.merchantSku,
          productConfigId: q.productConfigId,
          type: q.type ?? item.type,
          color: q.color ?? item.color,
          size: q.size ?? item.size,
          quantity: item.quantity ?? 1,
          shipMethod: item.shipMethod ?? DEFAULT_CUSTOMER_SHIP_METHOD,
          activeService: item.activeService,
          mockupUrl: item.mockupUrl,
          printMethod: item.printMethod,
          weight: item.weight,
          width: item.width,
          height: item.height,
          length: item.length,
          designs: item.designs,
          tracking: item.tracking,
          priceSnapshot: q.snapshot,
        };
      });
      set.items = await this.assignProductionIds(newItems);
    }
    await this.customerOrderModel.updateOne({ _id: doc._id }, { $set: set });
    if (set.items) {
      await this.designStorageService.touchUsageForUrls(this.collectDesignUrls(set.items as CustomerOrderItem[]));
    }
    const updated = await this.customerOrderModel.findById(doc._id).lean();
    const cutoff = await this.getCompletedCutoff();
    return { success: true, data: this.toStagingOrder(updated as Record<string, unknown>, new Map(), cutoff) };
  }

  async cancelStagingOrder(
    customer: CustomerDocument,
    id: string,
    dto: CancelCustomerStagingOrderDto,
  ): Promise<CustomerStagingOrderResDto> {
    const doc = await this.getPendingStagingOrder(customer, id);
    await this.customerOrderModel.updateOne(
      { _id: doc._id },
      { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: dto.reason } },
    );
    const updated = await this.customerOrderModel.findById(doc._id).lean();
    const cutoff = await this.getCompletedCutoff();
    return { success: true, data: this.toStagingOrder(updated as Record<string, unknown>, new Map(), cutoff) };
  }

  // -------------------------------------------------------------------------
  // CSV import theo template cũ (plan §6) — nhận orders[] ĐÃ group từ FE
  // -------------------------------------------------------------------------

  /**
   * Đối chiếu SKU với catalog cho bảng preview import — trả tên/ảnh/màu-size +
   * giá tham khảo TÍNH CÙNG CÔNG THỨC với import/push (`quoteItem`: ship
   * method + Promotion theo tier). SKU không match → `found=false`, FE chặn
   * submit (BE lúc import cũng fail cả đơn — rule khớp 2 đầu).
   */
  async resolveImportSkus(customer: CustomerDocument, dto: ResolveImportSkusDto): Promise<ResolveImportSkusResDto> {
    const ctx = await this.buildPricingContext(dto.items);
    const activePromotions = await this.promotionService.getActiveInDateRange();
    const tier = customer.tier ?? null;

    const data = dto.items.map((item) => {
      const hit = ctx.bySku.get(item.sku.trim().toUpperCase());
      const q = this.quoteItem(item, ctx, activePromotions, tier);
      return {
        sku: item.sku,
        found: !!q.productConfigId,
        productConfigId: q.productConfigId,
        type: q.type,
        color: q.color,
        size: q.size,
        imageUrl: hit?.config.mockup,
        priceSnapshot: q.snapshot,
        error: q.error,
      };
    });
    return { success: true, data };
  }

  async importOrdersCsv(
    customer: CustomerDocument,
    dto: ImportCustomerOrdersDto,
    // 'api' khi gọi qua Public Order API (ORD-4) — cùng luồng staging, chỉ khác nguồn.
    source: 'csv' | 'api' = 'csv',
  ): Promise<ImportCustomerOrdersResDto> {
    const totalLines = dto.orders.reduce((s, o) => s + o.items.length, 0);
    if (totalLines > 500) throw new BadRequestException(customerMessage('importTooManyLines'));

    const allItems = dto.orders.flatMap((o) => o.items);
    const ctx = await this.buildPricingContext(allItems);
    const activePromotions = await this.promotionService.getActiveInDateRange();
    const tier = customer.tier ?? null;
    const customerId = String(customer._id);

    const results: CustomerImportResultRow[] = [];
    const seenKeys = new Set<string>();
    let created = 0;
    let duplicated = 0;
    let failed = 0;

    for (const order of dto.orders) {
      const orderKey = customerOrderKey(order.orderId, order.identifier);
      const base = { orderId: order.orderId, identifier: order.identifier, orderKey };
      if (seenKeys.has(orderKey)) {
        duplicated++;
        results.push({ ...base, status: 'duplicated', error: 'Trùng (order_id, identifier) trong cùng file' });
        continue;
      }
      seenKeys.add(orderKey);

      // SKU BẮT BUỘC match (plan §13.1) — đơn có ≥1 dòng lỗi → CẢ ĐƠN không import.
      const itemErrors: Array<{ index: number; error: string }> = [];
      const items: CustomerOrderItem[] = [];
      for (let i = 0; i < order.items.length; i++) {
        const item = order.items[i];
        const q = this.quoteItem(item, ctx, activePromotions, tier);
        if (!q.productConfigId) {
          itemErrors.push({ index: i, error: q.error ?? 'SKU không hợp lệ' });
          continue;
        }
        items.push({
          sku: item.sku.trim().toUpperCase(),
          merchantSku: item.merchantSku,
          productConfigId: q.productConfigId,
          type: q.type,
          color: q.color ?? item.rawColor,
          size: q.size ?? item.rawSize,
          quantity: item.quantity ?? 1,
          shipMethod: item.shipMethod ?? DEFAULT_CUSTOMER_SHIP_METHOD,
          activeService: item.activeService,
          mockupUrl: item.mockupUrl,
          designs: item.designs,
          tracking: item.tracking,
          priceSnapshot: q.snapshot,
        });
      }
      if (itemErrors.length > 0) {
        failed++;
        results.push({ ...base, status: 'failed', error: 'Đơn có dòng lỗi — cả đơn không được import', itemErrors });
        continue;
      }
      await this.assignProductionIds(items);

      try {
        await this.customerOrderModel.create({
          customerId,
          userSku: customer.userSku,
          userEmail: customer.userEmail,
          orderKey,
          orderId: order.orderId,
          identifier: order.identifier,
          orderName: order.orderName,
          note: order.note,
          source,
          status: 'pending',
          shippingAddress: order.shippingAddress,
          items,
        });
        created++;
        results.push({ ...base, status: 'created' });
        await this.designStorageService.touchUsageForUrls(this.collectDesignUrls(items));
      } catch (err) {
        if ((err as { code?: number }).code === 11000) {
          duplicated++;
          results.push({ ...base, status: 'duplicated', error: 'Đơn đã tồn tại — sửa/xóa trên portal rồi import lại' });
        } else {
          failed++;
          results.push({ ...base, status: 'failed', error: (err as Error).message });
        }
      }
    }

    return { success: true, data: { created, duplicated, failed, results } };
  }

  // -------------------------------------------------------------------------
  // Push to production (plan §3): chốt giá → payment waived → importOrders
  // -------------------------------------------------------------------------

  /** Load + validate các staging orders được tick — dùng chung preview/push. */
  private async loadPushTargets(customer: CustomerDocument, ids: string[]) {
    const docs = await this.customerOrderModel
      .find({ _id: { $in: ids }, customerId: String(customer._id) })
      .lean();
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    return ids.map((id) => ({ id, doc: byId.get(id) }));
  }

  /**
   * Giành chỗ đẩy 1 đơn staging bằng MỘT lệnh ghi có điều kiện (ORD-20).
   * Trả `true` nếu lượt này giành được, `false` nếu đơn đã đẩy hoặc lượt khác
   * đang đẩy.
   *
   * Điều kiện nằm ở LỆNH GHI chứ không phải ở bước đọc: cả luồng push là đọc →
   * chốt giá → `importOrders()` → ghi `pushedAt`, và chỗ hở nằm ở khoảng giữa
   * đọc và ghi. Hai lượt song song đều đọc thấy `pushedAt` rỗng nên cùng chạy
   * tới `importOrders()`; lượt sau đụng unique index `productionId` và ném lỗi
   * trùng khoá — hậu quả nặng thì unique index đã chặn, nhưng khách nhận về
   * một lỗi tầng dưới khó hiểu và người đọc log tưởng hỏng khâu cấp mã.
   *
   * Chỗ giữ quá hạn thì coi như hết hiệu lực, để tiến trình chết giữa chừng
   * không khoá đơn vĩnh viễn.
   */
  private async claimPush(stagingId: string, customerId: string): Promise<boolean> {
    const now = Date.now();
    const res = await this.customerOrderModel.updateOne(
      {
        _id: stagingId,
        customerId,
        pushedAt: null,
        $or: [{ pushingAt: null }, { pushingAt: { $exists: false } }, { pushingAt: { $lt: new Date(now - PUSH_CLAIM_STALE_MS) } }],
      },
      { $set: { pushingAt: new Date(now) } },
    );
    return res.modifiedCount > 0;
  }

  /** Nhả chỗ giữ khi lượt đẩy hỏng — đơn quay lại trạng thái đẩy được. */
  private async releasePushClaims(stagingIds: string[]): Promise<void> {
    if (stagingIds.length === 0) return;
    await this.customerOrderModel.updateMany(
      { _id: { $in: stagingIds }, pushedAt: null },
      { $set: { pushingAt: null } },
    );
  }

  /** Lý do đơn không giành được chỗ — đọc lại để nói đúng chuyện gì đang xảy ra. */
  private async describeLostClaim(stagingId: string): Promise<string> {
    const doc = await this.customerOrderModel.findById(stagingId).select('pushedAt').lean();
    return doc?.pushedAt ? 'Đơn đã đẩy sản xuất trước đó' : 'Đơn đang được đẩy sản xuất — chờ một lát rồi tải lại trang';
  }

  private validatePushable(doc: Record<string, unknown> | undefined): string | undefined {
    if (!doc) return 'Không tìm thấy đơn';
    if (doc.status === 'cancelled') return 'Đơn đã hủy';
    if (doc.pushedAt) return 'Đơn đã đẩy sản xuất trước đó';
    const items = (doc.items || []) as CustomerOrderItem[];
    if (items.length === 0) return 'Đơn không có item nào';
    const addr = doc.shippingAddress as ProductionOrderShippingAddress | undefined;
    if (!addr?.firstName?.trim() || !addr?.address1?.trim() || !addr?.city?.trim())
      return 'Thiếu thông tin địa chỉ nhận hàng (tên/địa chỉ/thành phố)';
    return undefined;
  }

  /** Quote toàn bộ items của 1 staging order — trả kèm tổng tiền. */
  private quoteStagingOrder(
    doc: Record<string, unknown>,
    ctx: PricingContext,
    activePromotions: ActivePromotion[],
    tier: number | null,
  ): { quotes: QuoteResult[]; orderTotal: number } {
    const items = (doc.items || []) as CustomerOrderItem[];
    const quotes = items.map((it) => this.quoteItem(it, ctx, activePromotions, tier));
    const orderTotal = quotes.reduce((s, q) => s + (q.snapshot?.lineTotal ?? 0), 0);
    return { quotes, orderTotal: Math.round(orderTotal * 100) / 100 };
  }

  async previewPush(customer: CustomerDocument, dto: PushCustomerOrdersDto): Promise<PreviewPushCustomerOrdersResDto> {
    const targets = await this.loadPushTargets(customer, dto.ids);
    const allItems = targets.flatMap((t) => ((t.doc?.items || []) as CustomerOrderItem[]).map((i) => i));
    const ctx = await this.buildPricingContext(allItems);
    const activePromotions = await this.promotionService.getActiveInDateRange();
    const tier = customer.tier ?? null;
    const paymentGateEnabled = !!(await this.systemConfigService.get<boolean>(CUSTOMER_PAYMENT_GATE_KEY));

    let totalAmount = 0;
    const orders: CustomerPushQuoteOrder[] = targets.map(({ id, doc }) => {
      const error = this.validatePushable(doc);
      if (error || !doc) return { stagingId: id, orderId: doc?.orderId, items: [], orderTotal: 0, error };
      const items = (doc.items || []) as CustomerOrderItem[];
      const { quotes, orderTotal } = this.quoteStagingOrder(doc, ctx, activePromotions, tier);
      totalAmount += orderTotal;
      return {
        stagingId: id,
        orderId: doc.orderId,
        orderName: doc.orderName,
        orderTotal,
        items: items.map((it, i) => ({
          sku: it.sku,
          type: quotes[i].type ?? it.type,
          size: quotes[i].size ?? it.size,
          quantity: it.quantity ?? 1,
          priceSnapshot: quotes[i].snapshot,
          error: quotes[i].error,
        })),
      };
    });

    return {
      success: true,
      data: { orders, totalAmount: Math.round(totalAmount * 100) / 100, paymentGateEnabled },
    };
  }

  async pushToProduction(customer: CustomerDocument, dto: PushCustomerOrdersDto): Promise<PushCustomerOrdersResDto> {
    const paymentGateEnabled = !!(await this.systemConfigService.get<boolean>(CUSTOMER_PAYMENT_GATE_KEY));
    // Plan §12.1: đợt này gate OFF — chưa build luồng Admin confirm nên gate ON chặn hẳn.
    if (paymentGateEnabled)
      throw new BadRequestException(customerMessage('paymentGateNotReady'));

    const targets = await this.loadPushTargets(customer, dto.ids);
    const allItems = targets.flatMap((t) => ((t.doc?.items || []) as CustomerOrderItem[]).map((i) => i));
    const ctx = await this.buildPricingContext(allItems);
    const activePromotions = await this.promotionService.getActiveInDateRange();
    const tier = customer.tier ?? null;

    const results: PushCustomerOrdersResDto['data']['results'] = [];
    const importRows: ImportProductionOrderRow[] = [];
    const pendingUpdates: Array<{ stagingId: string; items: CustomerOrderItem[]; orderTotal: number }> = [];
    let totalAmount = 0;
    /**
     * Mốc "đơn vào sản xuất" của cả lô đẩy này.
     *
     * Đơn portal không đi qua sheet import nên không có sẵn cột ngày như đơn
     * nội bộ, mà `inProductionAt` lại là TRỤC THỜI GIAN của gần hết hệ thống:
     * bảng "Danh sách đơn" mặc định lọc đúng hôm nay trên chính trường này
     * (`Orders.md §7`), Dashboard/Lifecycle/báo cáo Telegram đều bucket theo
     * nó. Bỏ trống thì đơn đẩy vào sản xuất xong vẫn vô hình với xưởng —
     * không khoảng ngày nào khớp một trường không tồn tại.
     *
     * Một mốc duy nhất cho cả `OrderEntity.inProductionAt` lẫn
     * `customer_orders.pushedAt` bên dưới: hai con số đó tả cùng một sự kiện,
     * gọi `new Date()` hai lần chỉ đẻ ra chênh lệch vài mili giây để người
     * đọc số sau này phải đi giải thích.
     */
    const pushedAt = new Date();

    for (const { id, doc } of targets) {
      const error = this.validatePushable(doc);
      if (error || !doc) {
        results.push({ stagingId: id, orderId: doc?.orderId, status: 'failed', error });
        continue;
      }
      const items = (doc.items || []) as CustomerOrderItem[];
      const { quotes, orderTotal } = this.quoteStagingOrder(doc, ctx, activePromotions, tier);

      // CỬA CUỐI CÙNG cho luật "phải có mockup + design ở vị trí in bắt buộc"
      // (ORD-25). ORD-22 chặn ở `placeOrder`, nhưng đó chỉ là MỘT đường vào:
      // Public Order API đi `importOrdersCsv`, và `updateStagingOrder` cho phép
      // gỡ design ra khỏi đơn đã tạo. Đơn Pending là vùng nháp nên được phép
      // thiếu — chỗ KHÔNG được phép thiếu là lúc đơn rời vùng nháp để vào sản
      // xuất. Chặn ở đây phủ mọi đường vào, kể cả đường sinh ra sau này.
      //
      // Kiểm TRƯỚC khi giành chỗ: đơn hỏng thì đừng chiếm chỗ rồi phải nhả.
      // Dùng lại đúng hàm của ORD-22 — hai luật giống nhau đặt hai nơi là mầm
      // của lỗi lệch. Bắt lỗi để hỏng RIÊNG đơn này, lô vẫn đẩy tiếp.
      try {
        this.assertArtworkComplete(items, quotes, ctx);
      } catch (e) {
        const reason = e instanceof BadRequestException ? e.message : 'Đơn thiếu file thiết kế';
        results.push({
          stagingId: id,
          orderId: doc.orderId,
          status: 'failed',
          error: `Đơn ${doc.orderId ?? id}: ${reason}`,
        });
        continue;
      }

      // Giành chỗ TRƯỚC khi dựng row import — lượt song song thứ hai dừng ở đây
      // và nhận thông báo rõ ràng, thay vì chạy tiếp tới importOrders rồi vỡ ở
      // unique index. Một đơn hỏng chỉ hỏng riêng nó, lô vẫn đẩy tiếp (ORD-20).
      if (!(await this.claimPush(id, String(customer._id)))) {
        results.push({ stagingId: id, orderId: doc.orderId, status: 'failed', error: await this.describeLostClaim(id) });
        continue;
      }
      const addr = doc.shippingAddress as ProductionOrderShippingAddress | undefined;

      const updatedItems: CustomerOrderItem[] = [];
      const productionIds: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const q = quotes[i];
        // Mã đã cấp NGAY lúc tạo/import — push GIỮ NGUYÊN (khách theo dõi 1 mã
        // xuyên suốt). Fallback sinh mới cho staging doc cũ tạo trước cơ chế này.
        const productionId = it.productionId ?? (await this.generateUniqueProductionId());
        productionIds.push(productionId);
        updatedItems.push({
          ...it,
          productConfigId: q.productConfigId ?? it.productConfigId,
          type: q.type ?? it.type,
          size: q.size ?? it.size,
          color: q.color ?? it.color,
          priceSnapshot: q.snapshot ?? it.priceSnapshot,
          productionId,
        });
        importRows.push({
          productionId,
          userSku: customer.userSku,
          userEmail: customer.userEmail,
          // type = fullName của config resolve từ SKU → importOrders map đúng
          // config (match `fullName` case-insensitive, plan §6.1).
          type: q.type ?? it.type,
          color: q.color ?? it.color,
          size: q.size ?? it.size,
          mockupUrl: it.mockupUrl,
          printMethod: it.printMethod,
          weight: it.weight,
          width: it.width,
          height: it.height,
          length: it.length,
          quantity: it.quantity ?? 1,
          designs: it.designs,
          // Vận đơn khách tự cấp đi kèm item (CSV template cột
          // `tracking_*`/`shipping_label`, hoặc `items[].tracking` qua Public
          // Order API) — `importOrders` lưu lên đơn RỒI ghi record vào module
          // vận đơn. Trước ORD-26 field này chết ở staging, xưởng không thấy.
          tracking: it.tracking,
          orderId: (doc.orderId) ?? undefined,
          referent: (doc.note) ?? undefined,
          // Hai mốc thời gian của đơn, `importOrders` đọc cả hai qua
          // `parseImportDate` (nhận ISO có tz):
          //   orderAt        = lúc KHÁCH đặt  → staging `createdAt`
          //   inProductionAt = lúc VÀO SX     → mốc đẩy của cả lô
          // Chúng khác nhau đúng bằng quãng đơn nằm ở vùng nháp Pending, có
          // thể là vài phút mà cũng có thể là vài ngày — gộp làm một là mất
          // luôn quãng chờ đó khỏi mọi báo cáo. Staging doc quá cũ không có
          // `createdAt` thì lùi về mốc đẩy: sai lệch một quãng đã không còn
          // đo được, vẫn hơn để trống rồi thủng sort `orderAt: -1` ở kanban
          // Fulfillment.
          orderAt: (doc.createdAt ?? pushedAt).toISOString(),
          inProductionAt: pushedAt.toISOString(),
          shippingAddress: addr,
        });
      }
      totalAmount += orderTotal;
      pendingUpdates.push({ stagingId: id, items: updatedItems, orderTotal });
      results.push({
        stagingId: id,
        orderId: doc.orderId,
        status: 'pushed',
        productionIds,
      });
    }

    if (importRows.length === 0) return { success: true, data: { results, totalAmount: 0 } };

    // 1 lệnh importOrders duy nhất cho mọi item của mọi đơn — pipeline sẵn có
    // (map config, ép xưởng theo khách, auto-gán designer, Telegram noti).
    // Hỏng ở đây thì NHẢ hết chỗ giữ: đơn phải quay lại trạng thái đẩy được,
    // không được kẹt nửa vời (ORD-20).
    let payment: { _id: unknown };
    try {
      await this.orderService.importOrders(
        { rows: importRows },
        {
          user: {
            _id: customer._id,
            fullName: customer.fullName,
            email: customer.userEmail,
            role: { name: RoleType.Customer },
          },
        },
      );

      // Ledger: gate OFF vẫn ghi 1 record `waived` + tổng amount (plan §12.1).
      payment = await this.customerPaymentModel.create({
        customerId: String(customer._id),
        orderIds: pendingUpdates.map((u) => u.stagingId),
        amount: Math.round(totalAmount * 100) / 100,
        status: 'waived',
        method: 'waived',
      });
    } catch (e) {
      await this.releasePushClaims(pendingUpdates.map((u) => u.stagingId));
      throw e;
    }

    await Promise.all(
      pendingUpdates.map((u) =>
        this.customerOrderModel.updateOne(
          // `pushedAt: null` là lưới an toàn cuối: tới đây lượt này đang giữ chỗ
          // nên không ai chen được, nhưng ghi có điều kiện thì rẻ mà chắc.
          { _id: u.stagingId, pushedAt: null },
          { $set: { items: u.items, pushedAt, paymentId: String(payment._id), pushingAt: null } },
        ),
      ),
    );

    // Webhook `order.pushed` cho khách API (ORD-4) — fire-and-forget, không chặn response.
    this.customerOrderEventService.emit(
      'order.pushed',
      pendingUpdates.flatMap((u) =>
        u.items
          .filter((it) => it.productionId)
          .map((it) => ({
            productionId: it.productionId,
            customerId: String(customer._id),
            extra: { externalRef: (targets.find((t) => t.id === u.stagingId)?.doc?.orderId as string) ?? null },
          })),
      ),
    );

    // Design storage hook (plan DesignStorage-R2-ProcessingWorker §C4): design đã
    // là CDN URL → touch lastUsedAt; design còn là URL ngoài (Drive…) → đẩy job
    // cho design-worker tải về R2 + thay URL ở CẢ OrderEntity lẫn staging item.
    // Push KHÔNG chờ worker — đơn vào sản xuất ngay với URL gốc.
    const cdnUrls: string[] = [];
    for (const u of pendingUpdates) {
      for (const it of u.items) {
        if (!it.productionId) continue;
        for (const [designKey, url] of Object.entries(it.designs ?? {})) {
          if (!url) continue;
          if (extractDesignSha(url)) {
            cdnUrls.push(url);
          } else if (/^https?:\/\//i.test(url)) {
            await this.designStorageService.enqueueUrlIngest({
              kind: 'url',
              url,
              designKey,
              productionId: it.productionId,
              stagingId: u.stagingId,
              customerId: String(customer._id),
              userEmail: customer.userEmail,
            });
          }
        }
        // Label khách cấp cũng lưu về R2 cho chắc (link ngoài có thể chết) —
        // worker chỉ thay staging tracking.labelUrl (target='tracking-label').
        const labelUrl = it.tracking?.labelUrl;
        if (labelUrl) {
          if (extractDesignSha(labelUrl)) {
            cdnUrls.push(labelUrl);
          } else if (/^https?:\/\//i.test(labelUrl)) {
            await this.designStorageService.enqueueUrlIngest({
              kind: 'url',
              url: labelUrl,
              designKey: 'labelUrl',
              target: 'tracking-label',
              productionId: it.productionId,
              stagingId: u.stagingId,
              customerId: String(customer._id),
              userEmail: customer.userEmail,
            });
          }
        }
      }
    }
    await this.designStorageService.touchUsageForUrls(cdnUrls);

    return { success: true, data: { results, totalAmount: Math.round(totalAmount * 100) / 100 } };
  }

  // -------------------------------------------------------------------------
  // Các API sẵn có giữ nguyên hành vi (đơn ĐÃ PUSH — OrderEntity)
  // -------------------------------------------------------------------------

  /** Distinct `type` các đơn của khách — option cho filter "Sản phẩm" ở listing. */
  async listProductTypes(customer: CustomerDocument): Promise<GetCustomerOrderProductTypesResDto> {
    const types = await this.orderModel.distinct('type', {
      userSku: customer.userSku,
      userEmail: customer.userEmail,
    });
    const cleaned = types
      .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      .sort((a, b) => a.localeCompare(b, 'vi'));
    return { success: true, data: cleaned };
  }

  /**
   * Dashboard portal — đếm theo staging (gồm cả Pending) + 5 đơn mới nhất.
   * `processing` = phần còn lại sau khi trừ pending/hủy/hoàn thành.
   */
  async getDashboard(customer: CustomerDocument): Promise<GetCustomerDashboardResDto> {
    const countsRes = await this.getCounts(customer);
    const c = countsRes.data;
    const listRes = await this.listOrders(customer, { page: 1, limit: 5 } as GetCustomerStagingOrdersDto);
    const recentOrders = listRes.data.flatMap((o) =>
      o.items.map((i) => ({
        _id: o._id,
        productionId: i.productionId ?? '',
        type: i.type,
        color: i.color,
        size: i.size,
        quantity: i.quantity,
        mockupUrl: i.mockupUrl,
        createdAt: o.createdAt,
        currentStageLabel: i.currentStageLabel,
        currentStageAt: i.currentStageAt,
        completed: i.status === CustomerOrderStatus.Completed || i.status === CustomerOrderStatus.Fulfilled,
        cancelledAt: i.cancelledAt ?? o.cancelledAt,
        designs: i.designs,
        productConfigId: i.productConfigId,
        shippingAddress: o.shippingAddress,
      })),
    );
    return {
      success: true,
      data: {
        totals: {
          total: c.all,
          processing: Math.max(0, c.all - c.pending - c.cancelled - c.completed - c.fulfilled - c.refunded),
          completed: c.completed + c.fulfilled,
          cancelled: c.cancelled,
        },
        recentOrders: recentOrders.slice(0, 5),
      },
    };
  }

  /**
   * Khách tự sửa mockup/design/địa chỉ ship của 1 đơn ĐÃ PUSH (KHÔNG sửa được
   * type/color/size/quantity — đổi số lượng/biến thể phải qua support nội
   * bộ). Chặn sửa đơn đã hủy. `designs` merge với giá trị cũ.
   */
  async updateOrder(
    customer: CustomerDocument,
    productionId: string,
    dto: UpdateCustomerOrderDto,
  ): Promise<UpdateCustomerOrderResDto> {
    const trimmed = (productionId ?? '').trim();
    if (!trimmed) throw new NotFoundException(customerMessage('productionIdEmpty'));

    const order = await this.orderModel.findOne({
      productionId: trimmed,
      userSku: customer.userSku,
      userEmail: customer.userEmail,
    });
    if (!order) throw new NotFoundException(customerMessage('orderNotFoundByCode'));
    if (order.cancelledAt) throw new BadRequestException(customerMessage('orderCancelledCannotEdit'));

    const set: Record<string, unknown> = {};
    if (dto.mockupUrl !== undefined) {
      set.mockupUrl = dto.mockupUrl;
      set.mockupOriginalUrl = dto.mockupUrl;
    }
    if (dto.designs) {
      const merged = { ...order.designs, ...dto.designs };
      set.designs = merged;
      set.designsOriginal = merged;
      await this.designStorageService.touchUsageForUrls(Object.values(dto.designs));
    }
    if (dto.shippingAddress) set.shippingAddress = dto.shippingAddress;

    await this.orderModel.updateOne({ _id: order._id }, { $set: set });

    // Đồng bộ lại staging item để listing hiển thị đúng (mockup/designs/address).
    const stagingSet: Record<string, unknown> = {};
    if (set.mockupUrl !== undefined) stagingSet['items.$.mockupUrl'] = set.mockupUrl;
    if (set.designs !== undefined) stagingSet['items.$.designs'] = set.designs;
    if (Object.keys(stagingSet).length > 0 || dto.shippingAddress) {
      await this.customerOrderModel.updateOne(
        { customerId: String(customer._id), 'items.productionId': trimmed },
        {
          $set: {
            ...stagingSet,
            ...(dto.shippingAddress ? { shippingAddress: dto.shippingAddress } : {}),
          },
        },
      );
    }

    const updated = await this.orderModel.findById(order._id).select('productionId').lean();
    if (!updated) throw new NotFoundException(customerMessage('orderNotFoundByCode'));
    return this.trackSummaryRes(customer, trimmed);
  }

  /** Response gọn sau update — tái dùng track (đơn lẻ nên không lo N+1). */
  private async trackSummaryRes(customer: CustomerDocument, productionId: string): Promise<UpdateCustomerOrderResDto> {
    const order = await this.orderModel
      .findOne({ productionId, userSku: customer.userSku, userEmail: customer.userEmail })
      .select(
        'productionId type color size quantity mockupUrl status orderAt cancelledAt cancelReason createdAt designs productConfigId shippingAddress inProductionAt ' +
          PROD_DERIVE_FIELDS,
      )
      .lean();
    if (!order) throw new NotFoundException(customerMessage('orderNotFoundByCode'));
    const stage = computeCurrentStage(order as ProdDeriveFields);
    return {
      success: true,
      data: {
        _id: String(order._id),
        productionId: order.productionId,
        type: order.type,
        color: order.color,
        size: order.size,
        quantity: order.quantity,
        mockupUrl: order.mockupUrl,
        status: order.status,
        orderAt: order.orderAt,
        cancelledAt: order.cancelledAt ?? undefined,
        cancelReason: order.cancelReason,
        createdAt: (order as { createdAt?: Date }).createdAt,
        inProductionAt: order.inProductionAt,
        currentStageLabel: order.cancelledAt ? undefined : stage.label,
        currentStageAt: order.cancelledAt ? undefined : stage.at,
        completed: stage.completed,
        designs: order.designs,
        productConfigId: order.productConfigId ? String(order.productConfigId) : undefined,
        shippingAddress: order.shippingAddress,
      },
    };
  }

  /** Xem tiến trình 1 đơn — chỉ cho phép xem đơn thuộc chính khách hàng đó. */
  async trackOrder(customer: CustomerDocument, productionId: string): Promise<GetCustomerOrderTrackResDto> {
    const trimmed = (productionId ?? '').trim();
    if (!trimmed) throw new NotFoundException(customerMessage('productionIdEmpty'));

    const summary = await this.trackSummaryRes(customer, trimmed);
    const track = await this.orderService.getLifecycleTrack(trimmed);

    return { success: true, data: { order: summary.data, track: track.data } };
  }
}

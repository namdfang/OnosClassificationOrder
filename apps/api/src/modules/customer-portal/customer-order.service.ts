import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CustomerOrderSummary,
  DesignFields,
  GetCustomerOrdersDto,
  GetCustomerOrdersResDto,
  GetCustomerOrderTrackResDto,
  ImportProductionOrderRow,
  PlaceCustomerOrderDto,
  PlaceCustomerOrderResDto,
  ProductionOrderShippingAddress,
  UpdateCustomerOrderDto,
  UpdateCustomerOrderResDto,
} from 'shared';
import {
  DesignerStatus,
  FULFILLMENT_STAGE_LABELS,
  FULFILLMENT_STAGE_ORDER,
  FulfillmentStage,
  LIFECYCLE_STAGE_KEYS,
  RoleType,
} from 'shared';

import type { CustomerDocument } from '@/modules/customer/customer.entity';
import { OrderEntity } from '@/modules/order/order.entity';
import { OrderService } from '@/modules/order/order.service';

/**
 * Random `productionId` — CÙNG pattern với mã đơn thật từ hệ thống chính (2
 * chữ cái + "-" + 5 số + "-" + 5 số, xem `CUTTING_FILE_PRODUCTION_ID_REGEX`
 * trong `production-order.dto.ts`) để đơn khách tự đặt tương thích với mọi
 * logic parse/regex sẵn có theo pattern này (vd matching cutting file).
 */
const PRODUCTION_ID_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function randomDigits5(): string {
  return String(Math.floor(Math.random() * 100000)).padStart(5, '0');
}
function randomProductionId(): string {
  const letters = Array.from({ length: 2 }, () => PRODUCTION_ID_LETTERS[Math.floor(Math.random() * 26)]).join('');
  return `${letters}-${randomDigits5()}-${randomDigits5()}`;
}

/** Field cơ bản trả về cho khách hàng — ẩn toàn bộ field sản xuất nội bộ. */
const CUSTOMER_ORDER_FIELDS =
  'productionId type color size quantity mockupUrl status orderAt cancelledAt cancelReason createdAt userSku userEmail ' +
  'designs productConfigId shippingAddress ' +
  // Field thô để tính chặng sản xuất hiện tại (`computeCurrentStage`) — KHÔNG
  // trả thẳng cho khách, chỉ dùng nội bộ để rút gọn thành currentStageLabel/At.
  'toolResultNote toolCheckedAt designerStatus designerAssignedAt designerFirstStartedAt designerCompletedAt ' +
  'currentFulfillmentStage fulfillmentStages fulfillmentCompletedAt inProductionAt';

/** Nhãn chặng hiện tại — hiển thị khách hàng, KHÔNG dùng thuật ngữ nội bộ (vd 'sew-in'). */
const CUSTOMER_STAGE_LABELS: Record<string, string> = {
  'tool-check': 'Đang xử lý',
  designer: 'Đang thiết kế',
  ...FULFILLMENT_STAGE_LABELS,
};

interface RawStageFields {
  toolResultNote?: string;
  toolCheckedAt?: Date;
  designerStatus?: DesignerStatus;
  designerAssignedAt?: Date;
  designerFirstStartedAt?: Date;
  designerCompletedAt?: Date;
  currentFulfillmentStage?: FulfillmentStage;
  fulfillmentStages?: Record<string, { waitingAt?: Date; startedAt?: Date; completedAt?: Date }>;
  fulfillmentCompletedAt?: Date;
}

/**
 * Chặng hiện tại rút gọn cho khách hàng — MIRROR nhánh tính `currentIndex` ở
 * `OrderService.getLifecycleTrack()` (order.service.ts). Cố tình KHÔNG tái
 * dùng thẳng `getLifecycleTrack` (query riêng theo từng đơn) để tránh N+1 khi
 * hiển thị listing nhiều đơn cùng lúc — field cần thiết đã có sẵn trong 1 query
 * `find()` của `listOrders()`. Đổi logic chặng ở 1 nơi thì nhớ đổi luôn nơi kia.
 */
function computeCurrentStage(d: RawStageFields): { label?: string; at?: Date; completed: boolean } {
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
        ? (d.designerCompletedAt ?? d.designerFirstStartedAt ?? d.designerAssignedAt)
        : (d.fulfillmentStages?.[key]?.startedAt ?? d.fulfillmentStages?.[key]?.waitingAt);

  return { label: CUSTOMER_STAGE_LABELS[key] ?? key, at, completed };
}

@Injectable()
export class CustomerOrderService {
  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    private readonly orderService: OrderService,
  ) {}

  /** Sinh `productionId` random KHÔNG đụng đơn đã có — retry vài lần cho chắc (không gian mã ~6.7 nghìn tỷ, va chạm cực hiếm). */
  private async generateUniqueProductionId(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = randomProductionId();
      const exists = await this.orderModel.exists({ productionId: candidate });
      if (!exists) return candidate;
    }
    throw new Error('Không thể sinh mã đơn hàng, vui lòng thử lại');
  }

  private toSummary(doc: Record<string, unknown>): CustomerOrderSummary {
    const stage = computeCurrentStage(doc as RawStageFields);
    return {
      _id: String(doc._id),
      productionId: doc.productionId as string,
      type: doc.type as string | undefined,
      color: doc.color as string | undefined,
      size: doc.size as string | undefined,
      quantity: doc.quantity as number | undefined,
      mockupUrl: doc.mockupUrl as string | undefined,
      status: doc.status as string | undefined,
      orderAt: doc.orderAt as Date | undefined,
      cancelledAt: doc.cancelledAt as Date | undefined,
      cancelReason: doc.cancelReason as string | undefined,
      createdAt: doc.createdAt as Date | undefined,
      inProductionAt: doc.inProductionAt as Date | undefined,
      currentStageLabel: doc.cancelledAt ? undefined : stage.label,
      currentStageAt: doc.cancelledAt ? undefined : stage.at,
      completed: stage.completed,
      designs: doc.designs as DesignFields | undefined,
      productConfigId: doc.productConfigId ? String(doc.productConfigId) : undefined,
      shippingAddress: doc.shippingAddress as ProductionOrderShippingAddress | undefined,
    };
  }

  /**
   * Đặt đơn — nhận `items[]` (nhiều sản phẩm, mỗi item → 1 `OrderEntity` row
   * riêng) + `shippingAddress` DÙNG CHUNG cho mọi item trong lần đặt này. Mọi
   * field sản xuất (factory/machine/fabric/toolResult...) được DEFAULT tự
   * động giống hệt luồng import nội bộ — tái dùng thẳng
   * `OrderService.importOrders` (map ProductConfig theo `type`, ưu tiên gán
   * xưởng theo khách...) thay vì viết lại logic default riêng cho customer
   * portal, GỘP TOÀN BỘ items vào 1 lệnh import duy nhất.
   */
  async placeOrder(customer: CustomerDocument, dto: PlaceCustomerOrderDto): Promise<PlaceCustomerOrderResDto> {
    const rows: ImportProductionOrderRow[] = [];
    for (const item of dto.items) {
      const productionId = await this.generateUniqueProductionId();
      rows.push({
        productionId,
        userSku: customer.userSku,
        userEmail: customer.userEmail,
        type: item.type,
        color: item.color,
        size: item.size,
        mockupUrl: item.mockupUrl,
        printMethod: item.printMethod,
        weight: item.weight,
        width: item.width,
        height: item.height,
        length: item.length,
        quantity: item.quantity,
        designs: item.designs,
        referent: dto.referent,
        shippingAddress: dto.shippingAddress,
      });
    }

    await this.orderService.importOrders(
      { rows },
      {
        user: {
          _id: customer._id,
          fullName: customer.fullName,
          email: customer.userEmail,
          role: { name: RoleType.Customer },
        },
      },
    );

    const productionIds = rows.map((r) => r.productionId);
    const created = await this.orderModel
      .find({ productionId: { $in: productionIds } })
      .select(CUSTOMER_ORDER_FIELDS)
      .lean();
    if (created.length === 0) throw new NotFoundException('Đặt đơn thất bại, vui lòng thử lại');

    // Giữ đúng thứ tự items đã submit thay vì thứ tự trả về từ DB.
    const byProductionId = new Map(created.map((d) => [d.productionId, d]));
    const ordered = productionIds.map((id) => byProductionId.get(id)).filter((d): d is (typeof created)[number] => !!d);

    return { success: true, data: ordered.map((d) => this.toSummary(d)) };
  }

  /** Danh sách đơn của CHÍNH khách hàng đang đăng nhập — khớp (userSku, userEmail). */
  async listOrders(customer: CustomerDocument, dto: GetCustomerOrdersDto): Promise<GetCustomerOrdersResDto> {
    const filter = { userSku: customer.userSku, userEmail: customer.userEmail };
    const skip = (dto.page - 1) * dto.limit;
    const [data, total] = await Promise.all([
      this.orderModel.find(filter).select(CUSTOMER_ORDER_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(dto.limit).lean(),
      this.orderModel.countDocuments(filter),
    ]);

    return { success: true, data: data.map((d) => this.toSummary(d)), total };
  }

  /**
   * Khách tự sửa mockup/design/địa chỉ ship của 1 đơn ĐÃ đặt (KHÔNG sửa được
   * type/color/size/quantity — đổi số lượng/biến thể phải qua support nội
   * bộ). Chặn sửa đơn đã hủy. `designs` merge với giá trị cũ (chỉ ghi đè key
   * được gửi lên, giữ nguyên các vị trí in khác) — khớp cách hiển thị ở FE
   * (mỗi vị trí in 1 ô sửa riêng, không bắt gửi lại toàn bộ `designs`).
   */
  async updateOrder(
    customer: CustomerDocument,
    productionId: string,
    dto: UpdateCustomerOrderDto,
  ): Promise<UpdateCustomerOrderResDto> {
    const trimmed = (productionId ?? '').trim();
    if (!trimmed) throw new NotFoundException('Production ID rỗng.');

    const order = await this.orderModel.findOne({
      productionId: trimmed,
      userSku: customer.userSku,
      userEmail: customer.userEmail,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn với mã này.');
    if (order.cancelledAt) throw new BadRequestException('Đơn đã hủy, không thể chỉnh sửa.');

    const set: Record<string, unknown> = {};
    if (dto.mockupUrl !== undefined) {
      set.mockupUrl = dto.mockupUrl;
      set.mockupOriginalUrl = dto.mockupUrl;
    }
    if (dto.designs) {
      const merged = { ...order.designs, ...dto.designs };
      set.designs = merged;
      set.designsOriginal = merged;
    }
    if (dto.shippingAddress) set.shippingAddress = dto.shippingAddress;

    await this.orderModel.updateOne({ _id: order._id }, { $set: set });

    const updated = await this.orderModel.findById(order._id).select(CUSTOMER_ORDER_FIELDS).lean();
    if (!updated) throw new NotFoundException('Không tìm thấy đơn với mã này.');

    return { success: true, data: this.toSummary(updated) };
  }

  /** Xem tiến trình 1 đơn — chỉ cho phép xem đơn thuộc chính khách hàng đó. */
  async trackOrder(customer: CustomerDocument, productionId: string): Promise<GetCustomerOrderTrackResDto> {
    const trimmed = (productionId ?? '').trim();
    if (!trimmed) throw new NotFoundException('Production ID rỗng.');

    const order = await this.orderModel
      .findOne({ productionId: trimmed, userSku: customer.userSku, userEmail: customer.userEmail })
      .select(CUSTOMER_ORDER_FIELDS)
      .lean();
    if (!order) throw new NotFoundException('Không tìm thấy đơn với mã này.');

    const track = await this.orderService.getLifecycleTrack(trimmed);

    return { success: true, data: { order: this.toSummary(order), track: track.data } };
  }
}

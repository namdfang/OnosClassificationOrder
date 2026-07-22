import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CustomerOrderSummary,
  GetCustomerOrdersDto,
  GetCustomerOrdersResDto,
  GetCustomerOrderTrackResDto,
  PlaceCustomerOrderDto,
  PlaceCustomerOrderResDto,
} from 'shared';
import { RoleType } from 'shared';

import { CounterType } from '@/constants';
import { CounterService } from '@/modules/counter/counter.service';
import type { CustomerDocument } from '@/modules/customer/customer.entity';
import { OrderEntity } from '@/modules/order/order.entity';
import { OrderService } from '@/modules/order/order.service';

/** Field cơ bản trả về cho khách hàng — ẩn toàn bộ field sản xuất nội bộ. */
const CUSTOMER_ORDER_FIELDS =
  'productionId type color size quantity mockupUrl status orderAt cancelledAt cancelReason createdAt userSku userEmail';

@Injectable()
export class CustomerOrderService {
  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    private readonly orderService: OrderService,
    private readonly counterService: CounterService,
  ) {}

  private toSummary(doc: Record<string, unknown>): CustomerOrderSummary {
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
    };
  }

  /**
   * Đặt đơn — chỉ nhận thông tin cơ bản (`PlaceCustomerOrderDto`). Mọi field
   * sản xuất (factory/machine/fabric/toolResult...) được DEFAULT tự động
   * giống hệt luồng import nội bộ — tái dùng thẳng `OrderService.importOrders`
   * (map ProductConfig theo `type`, ưu tiên gán xưởng theo khách...) thay vì
   * viết lại logic default riêng cho customer portal.
   */
  async placeOrder(customer: CustomerDocument, dto: PlaceCustomerOrderDto): Promise<PlaceCustomerOrderResDto> {
    const counter = await this.counterService.findAndUpdateCounter('customer-portal-order', CounterType.OrderCode);
    const productionId = `CUS${String(counter.seq).padStart(6, '0')}`;

    await this.orderService.importOrders(
      {
        rows: [
          {
            productionId,
            userSku: customer.userSku,
            userEmail: customer.userEmail,
            type: dto.type,
            color: dto.color,
            size: dto.size,
            mockupUrl: dto.mockupUrl,
            printMethod: dto.printMethod,
            weight: dto.weight,
            width: dto.width,
            height: dto.height,
            length: dto.length,
            quantity: dto.quantity,
            designs: dto.designs,
            referent: dto.referent,
          },
        ],
      },
      {
        user: {
          _id: customer._id,
          fullName: customer.fullName,
          email: customer.userEmail,
          role: { name: RoleType.Customer },
        },
      },
    );

    const created = await this.orderModel.findOne({ productionId }).select(CUSTOMER_ORDER_FIELDS).lean();
    if (!created) throw new NotFoundException('Đặt đơn thất bại, vui lòng thử lại');

    return { success: true, data: this.toSummary(created) };
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

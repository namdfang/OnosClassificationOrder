import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { ProductionOrderTracking } from 'shared';
import { SHIPMENT_PROVIDER_CUSTOMER } from 'shared';
import { Logger } from 'winston';

import { genCode } from '@/utils/gen-code';

import { ShipmentEntity } from './shipment.entity';
import { ShippingPackageEntity } from './shipping-package.entity';

/**
 * Chuẩn hóa số tracking: bỏ MỌI khoảng trắng + uppercase — dùng CHUNG khi
 * lưu `trackingCode` và khi tra idempotency. Cùng một số tracking gõ
 * "9400 1000..." và "94001000..." phải quy về 1 kiện, không đẻ record thứ hai.
 */
export function normalizeTrackingCode(raw?: string): string | undefined {
  const v = (raw ?? '').replace(/\s+/g, '').toUpperCase();
  return v || undefined;
}

/** 1 item đã có đơn sản xuất + vận đơn khách tự cấp đi kèm. */
export interface ExternalTrackingInput {
  /** OrderEntity._id. */
  orderId: string;
  productionId: string;
  /** `orderId` seller (mã đơn của khách) — dùng gắn vào kiện, có thể trống. */
  sellerOrderId?: string;
  factoryId?: string;
  tracking: ProductionOrderTracking;
}

interface IngestActor {
  userId?: string;
  userName?: string;
}

/**
 * Nhận vận đơn KHÁCH TỰ CẤP (label mua sẵn bên ngoài) vào đúng module vận đơn:
 * cùng cặp bảng `shipping_packages` + `shipments` mà label VNP hệ thống mua
 * đang dùng, chỉ khác `provider` (`customer` vs `vnp-eglobal`). Nhờ vậy trang
 * lịch sử vận đơn / tra theo tracking / sau này auto-hook công đoạn Đóng hàng
 * chỉ phải đọc MỘT nguồn.
 *
 * Vì sao không tự đẻ bảng riêng: label dán lên KIỆN chứ không dán lên đơn, và
 * cái luật đó không đổi theo chỗ mua label. Một bảng thứ hai chỉ để chứa label
 * khách mang tới sẽ buộc mọi chỗ đọc vận đơn phải union 2 nguồn mãi mãi.
 *
 * Nguyên tắc:
 * - **Idempotent** — import lại cùng file / push lại cùng đơn không đẻ record
 *   trùng: nhận diện theo (provider, trackingCode) — hoặc labelUrl khi đơn chỉ
 *   có file label — rồi `$addToSet` item vào kiện sẵn có.
 * - **1 tracking = 1 kiện**: nhiều item cùng số tracking là cùng một kiện vật
 *   lý, gom chung 1 pack (khớp mô hình `ShippingPackageEntity`).
 * - **KHÔNG BAO GIỜ chặn luồng chính** — lên đơn hỏng vì ghi vận đơn lỗi là
 *   đổi một việc phụ lấy việc chính; lỗi được nuốt + log lại.
 */
@Injectable()
export class ShipmentIngestService {
  constructor(
    @InjectModel(ShippingPackageEntity.name) private readonly packageModel: Model<ShippingPackageEntity>,
    @InjectModel(ShipmentEntity.name) private readonly shipmentModel: Model<ShipmentEntity>,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  /**
   * Khoá nhận diện 1 vận đơn khách: ưu tiên số tracking (chuẩn hoá hoa/thường
   * + bỏ khoảng trắng), không có thì tới file label. Không có cả hai → không
   * có gì để ghi.
   */
  private identity(tracking: ProductionOrderTracking): { key: string; byLabel: boolean } | undefined {
    const code = normalizeTrackingCode(tracking.number);
    if (code) return { key: code, byLabel: false };
    const label = tracking.labelUrl?.trim();
    if (label) return { key: label, byLabel: true };
    return undefined;
  }

  /**
   * Ghi vận đơn khách tự cấp cho 1 lô item vừa vào sản xuất. Trả về số record
   * `shipments` MỚI tạo (item gộp vào kiện sẵn có không tính).
   */
  async recordExternalTracking(entries: ExternalTrackingInput[], actor?: IngestActor): Promise<number> {
    let createdCount = 0;
    // Gom theo (đơn seller, vận đơn): 2 item cùng số tracking trong cùng đơn là
    // cùng 1 kiện. Cố ý KHÔNG gom xuyên đơn seller — trùng số tracking giữa 2
    // đơn khác nhau gần như luôn là lỗi dữ liệu, gộp lại là trộn nhầm kiện.
    const groups = new Map<string, { entries: ExternalTrackingInput[]; tracking: ProductionOrderTracking; byLabel: boolean }>();
    for (const entry of entries) {
      const id = this.identity(entry.tracking);
      if (!id) continue;
      const key = `${entry.sellerOrderId?.trim() ?? ''}::${id.key}`;
      const group = groups.get(key);
      if (group) {
        group.entries.push(entry);
        // Item sau bổ sung field item trước thiếu (vd dòng 1 có label, dòng 2 có url).
        group.tracking = { ...entry.tracking, ...group.tracking };
      } else {
        groups.set(key, { entries: [entry], tracking: { ...entry.tracking }, byLabel: id.byLabel });
      }
    }

    for (const group of groups.values()) {
      try {
        const created = await this.upsertGroup(group.entries, group.tracking, group.byLabel, actor);
        if (created) createdCount++;
      } catch (error) {
        this.logger.error({
          message: JSON.stringify({
            action: 'recordExternalTracking',
            productionIds: group.entries.map((e) => e.productionId),
            trackingNumber: group.tracking.number,
            error: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    }
    return createdCount;
  }

  /** 1 nhóm = 1 kiện: tìm record cũ để gộp, không có thì tạo pack + shipment mới. */
  private async upsertGroup(
    entries: ExternalTrackingInput[],
    tracking: ProductionOrderTracking,
    byLabel: boolean,
    actor?: IngestActor,
  ): Promise<boolean> {
    const first = entries[0];
    const orderIds = entries.map((e) => e.orderId);
    const productionIds = entries.map((e) => e.productionId);
    const sellerOrderId = first.sellerOrderId?.trim();
    // Lưu + tra CÙNG dạng chuẩn hóa — khác spacing/hoa-thường không được đẻ kiện mới.
    const trackingCode = normalizeTrackingCode(tracking.number);

    const existing = await this.shipmentModel
      .findOne({
        provider: SHIPMENT_PROVIDER_CUSTOMER,
        ...(byLabel ? { labelUrl: tracking.labelUrl, trackingCode: { $in: [null, ''] } } : { trackingCode }),
      })
      .lean();

    if (existing) {
      // Import lại / push lại: KHÔNG tạo record thứ hai cho cùng một vận đơn —
      // chỉ nhét thêm item vào kiện và bù các field lần trước còn trống.
      await this.packageModel.updateOne(
        { _id: existing.packageId },
        {
          $addToSet: {
            productionOrderIds: { $each: orderIds },
            productionIds: { $each: productionIds },
            ...(sellerOrderId ? { orderCodes: sellerOrderId } : {}),
          },
        },
      );
      const fill: Record<string, unknown> = {};
      if (!existing.labelUrl && tracking.labelUrl) fill.labelUrl = tracking.labelUrl;
      if (!existing.carrier && tracking.carrier) fill.carrier = tracking.carrier;
      if (!existing.trackingUrl && tracking.url) fill.trackingUrl = tracking.url;
      if (Object.keys(fill).length > 0) await this.shipmentModel.updateOne({ _id: existing._id }, { $set: fill });
      return false;
    }

    const now = new Date();
    const pack = await this.packageModel.create({
      code: `PK-${genCode(10)}`,
      factoryId: first.factoryId || undefined,
      orderCodes: sellerOrderId ? [sellerOrderId] : [],
      productionOrderIds: orderIds,
      productionIds,
      createdAt: now,
    });
    await this.shipmentModel.create({
      packageId: pack._id,
      provider: SHIPMENT_PROVIDER_CUSTOMER,
      trackingCode,
      labelUrl: tracking.labelUrl?.trim() || undefined,
      carrier: tracking.carrier?.trim() || undefined,
      trackingUrl: tracking.url?.trim() || undefined,
      status: 'created',
      createdByUserId: actor?.userId,
      createdByUserName: actor?.userName,
      createdAt: now,
    });
    this.logger.info({
      message: JSON.stringify({
        action: 'recordExternalTracking',
        packageCode: pack.code,
        trackingCode: tracking.number,
        carrier: tracking.carrier,
        hasLabel: !!tracking.labelUrl,
        productionIds,
      }),
    });
    return true;
  }
}

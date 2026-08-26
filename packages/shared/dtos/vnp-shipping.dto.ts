import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { ResZod } from '@shared/types';
import { z } from 'zod';

/**
 * VNP eGlobal Shipment API — DTO cho luồng tạo vận đơn/label từ đơn sản xuất.
 *
 * Nguồn spec: `Data/Tai_lieu_API_VNP_eGlobal_dev.pdf` + OpenAPI sống
 * `https://vnp-eglobal.itel.dev/api/v3/api-docs`. Spec bên đó KHÔNG khai báo
 * response body (toàn `object` trống) nên mọi Res DTO ở đây giữ field `raw`
 * (JSON nguyên văn từ VNP) để phục vụ giai đoạn test/khảo sát — đặc biệt để
 * tìm xem label nằm ở đâu trong response.
 */

/** Enum service đúng theo `ShipmentRequest.service` trong OpenAPI VNP. */
export const VNP_SHIPPING_SERVICES = [
  'Standard',
  'Express',
  'Uniuni',
  'Letter',
  'FirstFlat',
  'FirstClass',
  'UpsGround',
] as const;
export const VnpShippingServiceZod = z.enum(VNP_SHIPPING_SERVICES);
export type VnpShippingService = z.infer<typeof VnpShippingServiceZod>;

/** Enum shipping_type đúng theo `ShipmentRequest.shipping_type`. */
export const VNP_SHIPPING_TYPES = ['GDE', 'DOMESTIC'] as const;
export const VnpShippingTypeZod = z.enum(VNP_SHIPPING_TYPES);
export type VnpShippingType = z.infer<typeof VnpShippingTypeZod>;

/**
 * Subdoc lưu trên OrderEntity sau khi tạo vận đơn — chỉ giữ phần cốt lõi để
 * hiển thị/tra cứu; raw response KHÔNG lưu vào đơn (trả 1 lần qua API test).
 */
export const VnpShipmentInfoZod = z.object({
  /** ID shipment VNP trả về sau createShipment. */
  shipmentId: z.string().optional(),
  /** Mã tracking (nếu VNP trả riêng; nhiều hệ dùng luôn shipmentId). */
  trackingCode: z.string().optional(),
  /** URL file label (PDF/PNG) nếu response có — mục tiêu chính của đợt test. */
  labelUrl: z.string().optional(),
  service: VnpShippingServiceZod.optional(),
  shippingType: VnpShippingTypeZod.optional(),
  /** ID địa chỉ ShippingTo đã tạo bên VNP cho đơn này. */
  toAddressId: z.string().optional(),
  /** Kết quả checkAddress gần nhất. */
  addressValid: z.boolean().optional(),
  addressCheckedAt: z.date().optional(),
  createdAt: z.date().optional(),
  cancelledAt: z.date().optional(),
  /** Trạng thái tracking gần nhất (text VNP trả về). */
  lastTrackingStatus: z.string().optional(),
  lastTrackingAt: z.date().optional(),
});
export type VnpShipmentInfo = z.infer<typeof VnpShipmentInfoZod>;

// ─── Cấu hình địa chỉ gửi (ShippingFrom) theo xưởng ─────────────────────────
//
// Lưu blob `system_configs` key VNP_SHIPPING_CONFIG_KEY — cấu hình SỐNG THEO
// MÔI TRƯỜNG (local/production tự tạo địa chỉ + gán xưởng qua UI Settings,
// KHÔNG restore data từ local lên production). Đơn từ xưởng nào ship từ địa
// chỉ gán cho xưởng đó; nhiều xưởng dùng chung 1 địa chỉ được (2D Thái Nguyên
// + Gỗ Thái Nguyên → cùng địa chỉ Thái Nguyên). Không gán → defaultAddressId
// → env VNP_EGLOBAL_FROM_ADDRESS_ID (fallback cuối, tùy chọn).

export const VNP_SHIPPING_CONFIG_KEY = 'vnp_shipping_config';

/** 1 địa chỉ gửi đã tạo bên VNP — snapshot để hiển thị, id là của VNP. */
export const VnpFromAddressZod = z.object({
  /** ID địa chỉ bên VNP (response createAddress). */
  vnpAddressId: z.string(),
  /** Nhãn gợi nhớ nội bộ, vd "Kho Thái Nguyên". */
  label: z.string(),
  name: z.string(),
  phoneNumber: z.string(),
  street1: z.string(),
  street2: z.string().optional(),
  ward: z.string(),
  district: z.string(),
  city: z.string(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string(),
  createdAt: z.union([z.date(), z.string()]).optional(),
});
export type VnpFromAddress = z.infer<typeof VnpFromAddressZod>;

export const VnpShippingConfigZod = z.object({
  addresses: z.array(VnpFromAddressZod).default([]),
  /** factoryId → vnpAddressId. */
  factoryMap: z.record(z.string()).default({}),
  /** Địa chỉ gửi mặc định cho xưởng chưa gán / đơn chưa map xưởng. */
  defaultAddressId: z.string().optional(),
});
export type VnpShippingConfig = z.infer<typeof VnpShippingConfigZod>;

export class GetVnpShippingConfigResDto extends createZodDto(
  extendApi(ResZod.extend({ data: VnpShippingConfigZod })),
) {}

/** Tạo địa chỉ gửi mới: BE gọi VNP createAddress(ShippingFrom) rồi lưu blob. */
export const CreateVnpFromAddressZod = z.object({
  label: z.string().min(1),
  name: z.string().min(1),
  phoneNumber: z.string().min(1),
  street1: z.string().min(1),
  street2: z.string().optional(),
  ward: z.string().min(1),
  district: z.string().min(1),
  city: z.string().min(1),
  /** Bang (US) — bắt buộc với địa chỉ Mỹ, vd "CA". */
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().default('VN'),
});
export class CreateVnpFromAddressDto extends createZodDto(extendApi(CreateVnpFromAddressZod)) {}
export class CreateVnpFromAddressResDto extends createZodDto(
  extendApi(ResZod.extend({ data: z.object({ config: VnpShippingConfigZod, raw: z.unknown() }) })),
) {}

/**
 * Thêm địa chỉ ĐÃ TỒN TẠI bên VNP vào config bằng id (không tạo mới) — dùng
 * khi shipping unit yêu cầu from = hub US có sẵn của VNP (Carson/Jamaica/...).
 */
export const ImportVnpFromAddressZod = z.object({
  vnpAddressId: z.string().min(1),
  label: z.string().min(1),
  /** Mô tả hiển thị (địa chỉ hub) — chỉ để nhìn, không gửi VNP. */
  note: z.string().optional(),
});
export class ImportVnpFromAddressDto extends createZodDto(extendApi(ImportVnpFromAddressZod)) {}

export class GetVnpRemoteAddressesResDto extends createZodDto(
  extendApi(ResZod.extend({ data: z.object({ raw: z.unknown() }) })),
) {}

/** Lưu mapping xưởng → địa chỉ + địa chỉ mặc định (không đụng addresses). */
export const SaveVnpShippingMapZod = z.object({
  factoryMap: z.record(z.string()),
  defaultAddressId: z.string().optional(),
});
export class SaveVnpShippingMapDto extends createZodDto(extendApi(SaveVnpShippingMapZod)) {}
export class SaveVnpShippingMapResDto extends createZodDto(
  extendApi(ResZod.extend({ data: VnpShippingConfigZod })),
) {}

export class DeleteVnpFromAddressResDto extends createZodDto(
  extendApi(ResZod.extend({ data: VnpShippingConfigZod })),
) {}

// ─── Trạng thái cấu hình (FE hiện cảnh báo khi thiếu env) ────────────────────

export const VnpShippingStatusZod = z.object({
  configured: z.boolean(),
  /** Thiếu env nào (tên biến) — không bao giờ trả giá trị secret. */
  missing: z.array(z.string()),
  apiUrl: z.string().optional(),
  shippingUnitId: z.string().optional(),
});
export type VnpShippingStatus = z.infer<typeof VnpShippingStatusZod>;
export class GetVnpShippingStatusResDto extends createZodDto(
  extendApi(ResZod.extend({ data: VnpShippingStatusZod })),
) {}

// ─── Ví (wallet) — VNP đòi số dư tối thiểu $50 mới cho tạo vận đơn ──────────

export class GetVnpWalletResDto extends createZodDto(
  extendApi(ResZod.extend({ data: z.object({ balance: z.string().optional(), raw: z.unknown() }) })),
) {}

// ─── Check address ───────────────────────────────────────────────────────────

export const VnpCheckAddressResZod = z.object({
  valid: z.boolean(),
  /** Thông điệp/lý do từ VNP (nếu có). */
  message: z.string().optional(),
  raw: z.unknown(),
});
export class CheckVnpAddressResDto extends createZodDto(
  extendApi(ResZod.extend({ data: VnpCheckAddressResZod })),
) {}

// ─── Create shipment ─────────────────────────────────────────────────────────

export const CreateVnpShipmentZod = z.object({
  service: VnpShippingServiceZod.default('Standard'),
  shippingType: VnpShippingTypeZod.default('GDE'),
  /**
   * Cân nặng fallback mỗi item (gram) — chỉ áp cho item trong nhóm THIẾU
   * `order.weight`. Vận đơn gộp theo `orderId` (1 đơn seller = 1 label),
   * mỗi item của nhóm thành 1 entry `package_details` với weight riêng.
   */
  weightGram: z.number().positive(),
  lengthCm: z.number().positive().optional(),
  wideCm: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  /** package_type — chỉ cần cho service FirstClass (UspsCard/UspsLetter/UspsFlat). */
  packageType: z.string().optional(),
  /** Số kiện — mặc định 1. */
  packages: z.number().int().positive().default(1),
});
export class CreateVnpShipmentDto extends createZodDto(extendApi(CreateVnpShipmentZod)) {}

/** 1 item trong nhóm cùng `orderId` — hiện ở dialog trước khi tạo label chung. */
export const VnpShipmentGroupItemZod = z.object({
  id: z.string(),
  productionId: z.string(),
  type: z.string().optional(),
  quantity: z.number().optional(),
  weight: z.number().optional(),
  /** Item đã có vận đơn active (chưa hủy) — cả nhóm bị chặn tạo thêm. */
  hasActiveShipment: z.boolean(),
});
export const VnpShipmentGroupZod = z.object({
  /** orderId seller — rỗng nếu đơn không có orderId (nhóm = 1 mình nó). */
  orderId: z.string().optional(),
  items: z.array(VnpShipmentGroupItemZod),
});
export class GetVnpShipmentGroupResDto extends createZodDto(
  extendApi(ResZod.extend({ data: VnpShipmentGroupZod })),
) {}

export const CreateVnpShipmentResZod = z.object({
  shipment: VnpShipmentInfoZod,
  /** productionId của TẤT CẢ item cùng orderId đã gắn chung vận đơn này. */
  groupProductionIds: z.array(z.string()),
  /** Response nguyên văn của createShipment — soi label URL ở giai đoạn test. */
  raw: z.unknown(),
  /** Response nguyên văn của createAddress (ShippingTo). */
  rawAddress: z.unknown().optional(),
});
export class CreateVnpShipmentResDto extends createZodDto(
  extendApi(ResZod.extend({ data: CreateVnpShipmentResZod })),
) {}

// ─── Packages + Shipments (bảng riêng — lịch sử vận đơn) ─────────────────────
//
// Model: 1 đơn sản xuất (OrderEntity) = 1 item của khách; 1 đơn khách
// (`orderId` seller) nhiều item; label luôn dán lên 1 KIỆN vật lý = 1 pack →
// shipment TRỎ VÀO PACK (không trỏ đơn khách — để sau này gộp nhiều đơn cùng
// địa chỉ vào 1 pack / thùng master đi hub qua `parentPackageId` không phải
// đổi schema). Hiện tại pack tự sinh ngầm lúc Admin mua label, 1 pack = 1 đơn
// khách. Mỗi lần mua label = 1 record shipment MỚI (không ghi đè) — hủy set
// `cancelledAt`, mua lại tạo record mới → lịch sử tự có. `order.vnpShipment`
// trên orders chỉ còn là SNAPSHOT mỏng để render list không phải join.

/**
 * `provider` của record `shipments`:
 * - `vnp-eglobal` — label HỆ THỐNG mua qua VNP eGlobal (module này).
 * - `customer` — label KHÁCH TỰ CẤP đi kèm lúc lên đơn (CSV khách / CSV admin
 *   / Public Order API), hệ thống chỉ nhận + in dán, không mua, không hủy được.
 */
export const SHIPMENT_PROVIDER_VNP = 'vnp-eglobal';
export const SHIPMENT_PROVIDER_CUSTOMER = 'customer';

export const VNP_SHIPMENT_RECORD_STATUSES = ['created', 'cancelled'] as const;
export const VnpShipmentRecordStatusZod = z.enum(VNP_SHIPMENT_RECORD_STATUSES);
export type VnpShipmentRecordStatus = z.infer<typeof VnpShipmentRecordStatusZod>;

/** 1 kiện hàng vật lý (collection `shipping_packages`). */
export const VnpShippingPackageZod = z.object({
  _id: z.string(),
  /** Mã kiện hiển thị, dạng `PK-XXXXXXXXXX`. */
  code: z.string(),
  factoryId: z.string().optional(),
  /** orderId seller trong kiện — hiện luôn 1 phần tử (hoặc rỗng nếu đơn không có orderId). */
  orderCodes: z.array(z.string()),
  /** OrderEntity._id các item trong kiện. */
  productionOrderIds: z.array(z.string()),
  /** productionId hiển thị của các item. */
  productionIds: z.array(z.string()),
  /** Kiện cha (thùng master gom nhiều kiện đi hub) — để dành, CHƯA dùng. */
  parentPackageId: z.string().optional(),
  createdAt: z.union([z.date(), z.string()]).optional(),
});
export type VnpShippingPackage = z.infer<typeof VnpShippingPackageZod>;

/** 1 lần mua label (collection `shipments`) — immutable trừ trạng thái/tracking. */
export const VnpShipmentRecordZod = z.object({
  _id: z.string(),
  packageId: z.string(),
  /** Nhà cung cấp label — 'vnp-eglobal'; sau này thêm khi tự đi ship. */
  provider: z.string(),
  /** ID shipment bên VNP (uuid). */
  vnpShipmentId: z.string().optional(),
  trackingCode: z.string().optional(),
  labelUrl: z.string().optional(),
  /** Hãng vận chuyển khách khai — chỉ record provider `customer`. */
  carrier: z.string().optional(),
  /** Link tra cứu khách gửi kèm — chỉ record provider `customer`. */
  trackingUrl: z.string().optional(),
  service: z.string().optional(),
  shippingType: z.string().optional(),
  fromAddressId: z.string().optional(),
  toAddressId: z.string().optional(),
  /** shipping_cost VNP trả lúc tạo (string nguyên văn). */
  shippingCost: z.string().optional(),
  status: VnpShipmentRecordStatusZod,
  cancelledAt: z.union([z.date(), z.string()]).optional(),
  lastTrackingStatus: z.string().optional(),
  lastTrackingAt: z.union([z.date(), z.string()]).optional(),
  createdByUserId: z.string().optional(),
  createdByUserName: z.string().optional(),
  createdAt: z.union([z.date(), z.string()]).optional(),
  /** Kiện chứa (join khi list/history). */
  package: VnpShippingPackageZod.optional(),
});
export type VnpShipmentRecord = z.infer<typeof VnpShipmentRecordZod>;

/** Danh sách vận đơn (lịch sử toàn hệ thống, Admin check). */
export const GetVnpShipmentsZod = z.object({
  page: z.coerce.number().int().positive().default(1),
  size: z.coerce.number().int().positive().max(100).default(20),
  /** Khớp trackingCode / vnpShipmentId / mã kiện / productionId / orderId seller. */
  search: z.string().optional(),
});
export class GetVnpShipmentsDto extends createZodDto(extendApi(GetVnpShipmentsZod)) {}
export class GetVnpShipmentsResDto extends createZodDto(
  extendApi(ResZod.extend({ data: z.array(VnpShipmentRecordZod), total: z.number() })),
) {}

/** Lịch sử vận đơn của 1 đơn sản xuất (mọi record của các kiện chứa nó). */
export class GetVnpOrderShipmentsResDto extends createZodDto(
  extendApi(ResZod.extend({ data: z.array(VnpShipmentRecordZod) })),
) {}

// ─── Tracking / get shipment / cancel ────────────────────────────────────────

export const VnpTrackingResZod = z.object({
  shipment: VnpShipmentInfoZod.optional(),
  raw: z.unknown(),
});
export class GetVnpTrackingResDto extends createZodDto(
  extendApi(ResZod.extend({ data: VnpTrackingResZod })),
) {}

export class GetVnpShipmentResDto extends createZodDto(
  extendApi(ResZod.extend({ data: z.object({ raw: z.unknown() }) })),
) {}

export class CancelVnpShipmentResDto extends createZodDto(
  extendApi(ResZod.extend({ data: z.object({ shipment: VnpShipmentInfoZod, raw: z.unknown() }) })),
) {}

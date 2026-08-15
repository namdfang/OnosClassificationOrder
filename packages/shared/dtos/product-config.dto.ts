import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { PriceZod, ProductPrintAreaKeyZod } from '@shared/constants';
import { ProductConfigStatus, Status } from '@shared/enums';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { IDZod } from '../constants/common-zod';
import { getObjectValues } from '../utils/getObjectValues';

/** 1 dòng "item specifics" — thuộc tính tự do (VD: "Chất liệu" / "Cotton 100%"). */
export const ProductItemSpecificZod = z.object({
  label: z.string().min(1).max(120),
  value: z.string().min(1).max(500),
});
export type ProductItemSpecific = z.infer<typeof ProductItemSpecificZod>;

/**
 * Danh sách vị trí in của 1 sản phẩm — mỗi phần tử là 1 key CỐ ĐỊNH trong
 * `PRODUCT_PRINT_AREAS` (`packages/shared/constants/product-print-area.ts`,
 * map 1-1 với `DesignFields`/order.designs). KHÔNG cho tự gõ key/label —
 * admin chỉ CHỌN trong danh mục cố định để tránh sai chính tả / trỏ tới field
 * design không tồn tại. Nhãn hiển thị resolve từ constant, không lưu trùng
 * lặp theo từng sản phẩm.
 */
export const ProductPrintAreaZod = ProductPrintAreaKeyZod.array()
  .max(30)
  .refine((keys) => new Set(keys).size === keys.length, { message: 'Vị trí in bị trùng lặp' });
export type ProductPrintArea = z.infer<typeof ProductPrintAreaZod>;

/**
 * Biến thể sản phẩm (VD: màu/size cụ thể, nhưng KHÔNG định nghĩa cứng field
 * nào — admin tự đặt tên thuộc tính qua `attributes` key-value) — SKU riêng,
 * giá vốn (cost/nonShipCost) dùng nội bộ, `retailPrice` là giá niêm yết hiển
 * thị cho khách (chưa áp discount). `weight/width/height/length` override
 * đóng gói mặc định của sản phẩm khi biến thể này có kích thước/khối lượng
 * khác.
 */
export const ProductVariationZod = z.object({
  sku: z.string().min(1).max(100).trim().toUpperCase(),
  /** Thuộc tính biến thể tự do dạng key-value (VD: "Màu" → "Đỏ", "Size" → "M"). */
  attributes: ProductItemSpecificZod.array().max(20).optional(),
  /** Giá vốn sản xuất. */
  cost: PriceZod.optional(),
  /** Giá vốn KHÔNG gồm phí ship. */
  nonShipCost: PriceZod.optional(),
  /** Giá bán niêm yết cho khách ("EXP US $" hệ cũ — trước khi áp chương trình giảm giá). */
  retailPrice: PriceZod.optional(),
  /** Giá bán sỉ ("Wholesale" hệ cũ). */
  wholesalePrice: PriceZod.optional(),
  /** Giá bán kênh TikTok ("TT US $" hệ cũ). */
  tiktokPrice: PriceZod.optional(),
  /** Phí ship Express US ("EXP US" hệ cũ — hệ cũ auto từ onosexpress, hiện nhập tay). */
  expUsShipCost: PriceZod.optional(),
  /** Phí ship TikTok US ("TIKTOK US" hệ cũ — nhập tay). */
  tiktokShipCost: PriceZod.optional(),
  weight: z.coerce.number().min(0).optional(),
  width: z.coerce.number().min(0).optional(),
  height: z.coerce.number().min(0).optional(),
  length: z.coerce.number().min(0).optional(),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
});
export type ProductVariation = z.infer<typeof ProductVariationZod>;

export const ProductConfigZod = BaseEntityZod.extend({
  fullName: z.string().min(1).max(300),
  shortName: z.string().min(1).max(60),
  /** Mã SKU riêng của sản phẩm (KHÔNG phải SKU biến thể) — unique toàn hệ thống nếu có. */
  sku: z.string().max(100).optional(),
  /** Slug SEO/URL (parity hệ cũ) — chưa dùng để routing, chỉ lưu. */
  slug: z.string().max(300).optional(),
  /** Active = hiện catalog khách hàng, Inactive = ẩn catalog nhưng vẫn hiện quản trị, Hidden = ẩn cả 2 (KHÔNG xóa). */
  status: z.enum(getObjectValues(ProductConfigStatus)).default(ProductConfigStatus.Active),
  /** Machine number/identifier (e.g. "94", "27"). Empty → product has no tool. */
  machineNumber: z.string().max(60).optional(),
  /** Optional từ 2026-07 — sản phẩm tạo nhanh từ kanban Settings (kéo từ cột "Chưa xác định xưởng") chưa có loại máy, bổ sung sau ở trang Products. */
  machineTypeId: IDZod.optional(),
  /**
   * Optional — sản phẩm có thể tạo mà chưa gán xưởng, bổ sung sau ở trang
   * Products. Đơn import khớp sản phẩm chưa có `factoryId` sẽ tự rơi vào
   * "Không xác định xưởng" (xem `Orders.md §19`), CÙNG cách xử lý với đơn
   * chưa map product config.
   */
  factoryId: IDZod.optional(),
  /** workshop_config code (category=fabric_type). Default fabric used at import. */
  fabricType: z.string().max(60).optional(),
  /** workshop_config code (category=tool_result). Default tool status at import. */
  toolResult: z.string().max(60).optional(),
  /** Ảnh/URL mockup sản phẩm (ảnh CHÍNH — index 0 của gallery) — hiển thị cột đầu bảng config. */
  mockup: z.string().max(1000).optional(),
  /** Gallery ảnh bổ sung (ngoài `mockup`) — URL hoặc ảnh upload local-disk. */
  images: z.array(z.string().max(1000)).max(20).optional(),
  /** ref CollectionEntity — 1 sản phẩm thuộc nhiều collection (multi-select). */
  collectionIds: IDZod.array().max(20).optional(),
  /** Cấp độ sản phẩm 1..10 (PRODUCT_LEVELS) — hiển thị badge màu. */
  level: z.number().int().min(1).max(10).optional(),
  /** Hướng dẫn / ghi chú sản xuất (HTML từ rich text editor). */
  guide: z.string().max(20000).optional(),

  // ─── Thông tin chi tiết sản phẩm (catalog cho khách hàng) ───────
  /** ref ProductCategoryEntity — module riêng, xem `product-category.dto.ts`. */
  productCategoryId: IDZod.optional(),
  /** workshop_config code (category=print_method). */
  printMethod: z.string().max(60).optional(),
  /** Danh sách vị trí in — mảng key CỐ ĐỊNH (xem `PRODUCT_PRINT_AREAS`), KHÔNG còn free-text. */
  printArea: ProductPrintAreaZod.optional(),
  /** Ảnh/URL bảng size. */
  sizeChartUrl: z.string().max(1000).optional(),
  /** Mô tả sản phẩm (HTML) — hiển thị cho khách hàng ở Customer Portal ("Item description" hệ cũ). */
  description: z.string().max(20000).optional(),
  /** Mô tả ngắn (HTML) — "Short description" hệ cũ. */
  shortDescription: z.string().max(20000).optional(),
  /** Mô tả template/file in (HTML) — "Template description" hệ cũ. */
  templateDescription: z.string().max(20000).optional(),
  /** "Shipping time" hệ cũ — Max Production time (ngày). */
  maxProductionTime: z.coerce.number().min(0).optional(),
  /** "Shipping time" hệ cũ — Max shipping time (ngày). */
  maxShippingTime: z.coerce.number().min(0).optional(),
  /** "Hide product for seller" hệ cũ — mới lưu, CHƯA wire vào logic nào. */
  hideForSeller: z.boolean().optional(),
  /** "Enable design check" hệ cũ — mới lưu, CHƯA wire vào logic nào. */
  enableDesignCheck: z.boolean().optional(),
  /** "Enable affiliate commission" hệ cũ — mới lưu, CHƯA wire vào logic nào. */
  enableAffiliate: z.boolean().optional(),
  /** Thông số kỹ thuật dạng key-value tự do (chất liệu, kiểu dáng...). */
  itemSpecifics: ProductItemSpecificZod.array().max(50).optional(),
  /** Đóng gói mặc định (áp dụng khi biến thể không override). */
  weight: z.coerce.number().min(0).optional(),
  width: z.coerce.number().min(0).optional(),
  height: z.coerce.number().min(0).optional(),
  length: z.coerce.number().min(0).optional(),
  /** Danh sách biến thể (màu/size) — SKU riêng từng biến thể. */
  variations: ProductVariationZod.array().max(200).optional(),
});
export type ProductConfig = z.infer<typeof ProductConfigZod>;

//
export const GetProductConfigsZod = PageQueryZod.extend({
  factoryId: IDZod.optional(),
  machineTypeId: IDZod.optional(),
  /** Không truyền ⇒ mặc định loại `Hidden` khỏi danh sách (vẫn thấy Active + Inactive). Truyền cụ thể để xem đúng 1 trạng thái (VD: `hidden` để xem sản phẩm đã ẩn). */
  status: z.enum(getObjectValues(ProductConfigStatus)).optional(),
});
export class GetProductConfigsDto extends createZodDto(extendApi(GetProductConfigsZod)) {}

export const GetProductConfigsResZod = PageResZod.extend({ data: ProductConfigZod.array() });
export class GetProductConfigsResDto extends createZodDto(extendApi(GetProductConfigsResZod)) {}

//
export const GetProductConfigResZod = ResZod.extend({ data: ProductConfigZod });
export class GetProductConfigResDto extends createZodDto(extendApi(GetProductConfigResZod)) {}

//
export const CreateProductConfigZod = z.object({
  fullName: ProductConfigZod.shape.fullName,
  shortName: ProductConfigZod.shape.shortName,
  sku: ProductConfigZod.shape.sku,
  slug: ProductConfigZod.shape.slug,
  status: ProductConfigZod.shape.status,
  machineNumber: ProductConfigZod.shape.machineNumber,
  machineTypeId: ProductConfigZod.shape.machineTypeId,
  factoryId: ProductConfigZod.shape.factoryId,
  fabricType: ProductConfigZod.shape.fabricType,
  toolResult: ProductConfigZod.shape.toolResult,
  mockup: ProductConfigZod.shape.mockup,
  images: ProductConfigZod.shape.images,
  collectionIds: ProductConfigZod.shape.collectionIds,
  level: ProductConfigZod.shape.level,
  guide: ProductConfigZod.shape.guide,
  productCategoryId: ProductConfigZod.shape.productCategoryId,
  printMethod: ProductConfigZod.shape.printMethod,
  printArea: ProductConfigZod.shape.printArea,
  sizeChartUrl: ProductConfigZod.shape.sizeChartUrl,
  description: ProductConfigZod.shape.description,
  shortDescription: ProductConfigZod.shape.shortDescription,
  templateDescription: ProductConfigZod.shape.templateDescription,
  maxProductionTime: ProductConfigZod.shape.maxProductionTime,
  maxShippingTime: ProductConfigZod.shape.maxShippingTime,
  hideForSeller: ProductConfigZod.shape.hideForSeller,
  enableDesignCheck: ProductConfigZod.shape.enableDesignCheck,
  enableAffiliate: ProductConfigZod.shape.enableAffiliate,
  itemSpecifics: ProductConfigZod.shape.itemSpecifics,
  weight: ProductConfigZod.shape.weight,
  width: ProductConfigZod.shape.width,
  height: ProductConfigZod.shape.height,
  length: ProductConfigZod.shape.length,
  variations: ProductConfigZod.shape.variations,
});
export class CreateProductConfigDto extends createZodDto(extendApi(CreateProductConfigZod)) {}

export const CreateProductConfigResZod = ResZod.extend({ data: ProductConfigZod });
export class CreateProductConfigResDto extends createZodDto(extendApi(CreateProductConfigResZod)) {}

//
export const UpdateProductConfigZod = z.object({
  fullName: ProductConfigZod.shape.fullName.optional(),
  shortName: ProductConfigZod.shape.shortName.optional(),
  sku: ProductConfigZod.shape.sku,
  slug: ProductConfigZod.shape.slug,
  status: ProductConfigZod.shape.status.optional(),
  machineNumber: ProductConfigZod.shape.machineNumber,
  machineTypeId: ProductConfigZod.shape.machineTypeId.optional(),
  factoryId: ProductConfigZod.shape.factoryId.optional(),
  fabricType: ProductConfigZod.shape.fabricType,
  toolResult: ProductConfigZod.shape.toolResult,
  mockup: ProductConfigZod.shape.mockup,
  images: ProductConfigZod.shape.images,
  collectionIds: ProductConfigZod.shape.collectionIds,
  level: ProductConfigZod.shape.level,
  guide: ProductConfigZod.shape.guide,
  productCategoryId: ProductConfigZod.shape.productCategoryId,
  printMethod: ProductConfigZod.shape.printMethod,
  printArea: ProductConfigZod.shape.printArea,
  sizeChartUrl: ProductConfigZod.shape.sizeChartUrl,
  description: ProductConfigZod.shape.description,
  shortDescription: ProductConfigZod.shape.shortDescription,
  templateDescription: ProductConfigZod.shape.templateDescription,
  maxProductionTime: ProductConfigZod.shape.maxProductionTime,
  maxShippingTime: ProductConfigZod.shape.maxShippingTime,
  hideForSeller: ProductConfigZod.shape.hideForSeller,
  enableDesignCheck: ProductConfigZod.shape.enableDesignCheck,
  enableAffiliate: ProductConfigZod.shape.enableAffiliate,
  itemSpecifics: ProductConfigZod.shape.itemSpecifics,
  weight: ProductConfigZod.shape.weight,
  width: ProductConfigZod.shape.width,
  height: ProductConfigZod.shape.height,
  length: ProductConfigZod.shape.length,
  variations: ProductConfigZod.shape.variations,
});
export class UpdateProductConfigDto extends createZodDto(extendApi(UpdateProductConfigZod)) {}

export const UpdateProductConfigResZod = ResZod.extend({ data: ProductConfigZod });
export class UpdateProductConfigResDto extends createZodDto(extendApi(UpdateProductConfigResZod)) {}

//
export const ImportProductConfigRowZod = z.object({
  fullName: z.string().min(1),
  shortName: z.string().min(1),
  /** Machine number ("94", "27"). Empty → product has no tool. */
  machineNumber: z.string().optional(),
  /** Factory name ("MÊ LINH", "MÊ LINH"…) — matched server-side, "Xưởng " prefix tolerant. */
  factoryLabel: z.string().min(1),
  /** Vietnamese label ("POLY 2 DA", "MÈ 64"…) — resolved server-side via workshop_config. */
  fabricLabel: z.string().optional(),
  /** Vietnamese label ("Có Tool" / "Không có Tool"). Empty → defaults derived from machineNumber. */
  toolResultLabel: z.string().optional(),
  /** Department / printer type ("IN và CẮT LASER") — matched against MachineType.name. */
  departmentLabel: z.string().min(1),
});
export type ImportProductConfigRow = z.infer<typeof ImportProductConfigRowZod>;

export const ImportProductConfigZod = z.object({
  rows: ImportProductConfigRowZod.array().min(1),
});
export class ImportProductConfigDto extends createZodDto(extendApi(ImportProductConfigZod)) {}

export const ImportProductConfigResZod = ResZod.extend({
  data: z.object({
    imported: z.number(),
    updated: z.number(),
    skipped: z.array(z.object({ row: z.number(), reason: z.string() })),
  }),
});
export class ImportProductConfigResDto extends createZodDto(extendApi(ImportProductConfigResZod)) {}

//
/**
 * Upload ảnh mockup/bảng size — lưu **local disk** trên server API (KHÔNG qua
 * S3/Backblaze, khác hẳn `/v1/upload/image`). Lý do tách riêng: pipeline S3
 * hiện có (`apps/api/src/modules/upload/`) cần `AWS_S3_*`/`BACKBLAZE_*`
 * credentials — môi trường dev/1 số môi trường chưa cấu hình gây 500. Ảnh
 * sản phẩm dùng nội bộ nên chấp nhận lưu đĩa server, phục vụ qua
 * `ServeStaticModule` sẵn có (`rootPath: ./src/assets`).
 */
export const UploadProductImageZod = z.object({
  type: z.enum(['mockup', 'size-chart']),
});
export class UploadProductImageDto extends createZodDto(extendApi(UploadProductImageZod)) {}

export const UploadProductImageResZod = ResZod.extend({ data: z.object({ url: z.string() }) });
export class UploadProductImageResDto extends createZodDto(extendApi(UploadProductImageResZod)) {}

// ─── Kanban Settings — sync sản phẩm chưa có config từ đơn gần đây ───

/** Quét đơn `days` ngày gần nhất (mặc định 14) tìm `type` chưa có trong Product Config. */
export const GetUnmatchedOrderTypesZod = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
});
export class GetUnmatchedOrderTypesDto extends createZodDto(extendApi(GetUnmatchedOrderTypesZod)) {}

/** 1 loại sản phẩm xuất hiện trên đơn nhưng CHƯA có Product Config — kèm số đơn trong khoảng quét. */
export const UnmatchedOrderTypeZod = z.object({
  type: z.string(),
  orderCount: z.number(),
});
export type UnmatchedOrderType = z.infer<typeof UnmatchedOrderTypeZod>;

export const GetUnmatchedOrderTypesResZod = ResZod.extend({ data: UnmatchedOrderTypeZod.array() });
export class GetUnmatchedOrderTypesResDto extends createZodDto(extendApi(GetUnmatchedOrderTypesResZod)) {}

// ─── Crawl ảnh mockup từ onospod.com cho sản phẩm chưa có ảnh ───

/**
 * Xử lý theo lô (FE gọi lặp): mỗi call quét tối đa `limit` sản phẩm thiếu
 * mockup có `_id > cursor` (sort `_id` tăng dần). Cursor tiến đơn điệu nên
 * sản phẩm đã thử-nhưng-không-khớp KHÔNG bị quét lại vòng sau — tránh loop
 * vô hạn. FE truyền lại `nextCursor` từ response đến khi `done=true`.
 */
export const CrawlProductMockupsZod = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: IDZod.optional(),
});
export class CrawlProductMockupsDto extends createZodDto(extendApi(CrawlProductMockupsZod)) {}

/**
 * Kết quả crawl CHI TIẾT từng sản phẩm trong lô:
 * - `created`  — sản phẩm chưa có ảnh, đã tìm được và gán mới.
 * - `updated`  — sản phẩm đã có ảnh, bị ghi đè (hiện crawl chỉ quét sản phẩm thiếu ảnh nên hiếm gặp).
 * - `no-match` — search CÓ kết quả nhưng không cái nào trùng tên (xem `foundTitles` để biết site trả gì).
 * - `no-results` — search không trả kết quả nào (sản phẩm không tồn tại trên onospod).
 * - `error`    — request lỗi/timeout (xem `message`).
 */
export const CrawlMockupResultItemZod = z.object({
  productConfigId: IDZod,
  fullName: z.string(),
  status: z.enum(['created', 'updated', 'no-match', 'no-results', 'error']),
  imageUrl: z.string().optional(),
  /** Tên sản phẩm trên onospod đã khớp (có thể khớp sau khi bỏ mã `[...]`/tiền tố — xem `note`). */
  matchedTitle: z.string().optional(),
  /** Tối đa 3 tên gần nhất site trả về khi `no-match` — để người dùng biết vì sao không khớp. */
  foundTitles: z.string().array().optional(),
  /** Ghi chú thêm (vd "khớp sau khi bỏ mã [PANT]") hoặc thông điệp lỗi. */
  note: z.string().optional(),
});
export type CrawlMockupResultItem = z.infer<typeof CrawlMockupResultItemZod>;

export const CrawlProductMockupsResZod = ResZod.extend({
  data: z.object({
    /** Số sản phẩm đã quét trong lô này. */
    processed: z.number(),
    /** Số sản phẩm tìm được ảnh trùng tên và đã gán mockup. */
    updated: z.number(),
    /** Số sản phẩm thiếu mockup còn lại SAU cursor (chưa quét). */
    remaining: z.number(),
    nextCursor: IDZod.optional(),
    done: z.boolean(),
    /** Chi tiết từng sản phẩm trong lô — lấy được hay không, vì sao. */
    results: CrawlMockupResultItemZod.array(),
  }),
});
export class CrawlProductMockupsResDto extends createZodDto(extendApi(CrawlProductMockupsResZod)) {}

// ─── Customer Portal — Catalog (chỉ field an toàn cho khách hàng) ───
// KHÔNG bao giờ trả `cost` / `nonShipCost` (giá vốn nội bộ) ra Customer Portal.

export const CustomerCatalogVariationZod = z.object({
  sku: ProductVariationZod.shape.sku,
  attributes: ProductVariationZod.shape.attributes,
  retailPrice: ProductVariationZod.shape.retailPrice,
  /** Giá sau khi áp chương trình giảm giá tốt nhất theo tier của khách (nếu có). */
  discountedPrice: PriceZod.optional(),
  appliedPromotionName: z.string().optional(),
});
export type CustomerCatalogVariation = z.infer<typeof CustomerCatalogVariationZod>;

/** Vị trí in đã resolve nhãn hiển thị — trả cho API khách hàng thay vì bare key. */
export const CustomerCatalogPrintAreaZod = z.object({
  key: ProductPrintAreaKeyZod,
  label: z.string(),
});
export type CustomerCatalogPrintArea = z.infer<typeof CustomerCatalogPrintAreaZod>;

export const CustomerCatalogItemZod = z.object({
  _id: IDZod,
  fullName: z.string(),
  shortName: z.string(),
  /** Tên danh mục đã resolve từ `productCategoryId` (ProductCategory module) — KHÔNG phải id. */
  productCategory: z.string().optional(),
  printMethod: z.string().optional(),
  printArea: CustomerCatalogPrintAreaZod.array().optional(),
  /** URL mockup ĐÚNG như đang lưu — với ảnh crawl từ onospod là bản thumbnail `-100x100`. Bậc dự phòng của `mockupLarge`. */
  mockup: z.string().optional(),
  /**
   * URL ảnh mockup full-size dẫn xuất từ `mockup` bằng `toFullSizeImageUrl()`
   * — ô ảnh catalog rộng ~300px nên bản `-100x100` bị phóng lên nhòe.
   *
   * KHÔNG đảm bảo ảnh tồn tại: ảnh gốc có thể đã bị xóa khỏi onospod trong khi
   * thumbnail vẫn còn. Nơi hiển thị PHẢI dự phòng `mockupLarge` → `mockup` →
   * ảnh mặc định, KHÔNG để ô ảnh vỡ (`Catalog.md` §6).
   */
  mockupLarge: z.string().optional(),
  sizeChartUrl: z.string().optional(),
  description: z.string().optional(),
  itemSpecifics: ProductItemSpecificZod.array().optional(),
  variations: CustomerCatalogVariationZod.array(),
});
export type CustomerCatalogItem = z.infer<typeof CustomerCatalogItemZod>;

export const GetCustomerCatalogZod = PageQueryZod.extend({
  productCategoryId: IDZod.optional(),
});
export class GetCustomerCatalogDto extends createZodDto(extendApi(GetCustomerCatalogZod)) {}

export const GetCustomerCatalogResZod = PageResZod.extend({ data: CustomerCatalogItemZod.array() });
export class GetCustomerCatalogResDto extends createZodDto(extendApi(GetCustomerCatalogResZod)) {}

/** 1 sản phẩm — dùng cho trang chi tiết `/customer/catalog/:id` (gallery + chọn biến thể + "Đặt đơn mới"). */
export const GetCustomerCatalogItemResZod = ResZod.extend({ data: CustomerCatalogItemZod });
export class GetCustomerCatalogItemResDto extends createZodDto(extendApi(GetCustomerCatalogItemResZod)) {}

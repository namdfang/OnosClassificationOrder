import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { PriceZod } from '@shared/constants';
import { Status } from '@shared/enums';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { IDZod } from '../constants/common-zod';
import { getObjectValues } from '../utils/getObjectValues';
import { DesignFieldsZod } from './production-order.dto';

/** Số nhóm option tối đa 1 sản phẩm (Color/Size/... user tự định nghĩa). */
export const PRODUCT_OPTION_GROUP_MAX = 3;
/** Số variants tối đa 1 sản phẩm (chặn tổ hợp nổ cấp số nhân). */
export const PRODUCT_VARIANTS_MAX = 200;

/**
 * Vị trí in của sản phẩm — `key` BẮT BUỘC thuộc 18 khóa `DesignFields`
 * (`front`, `back`, `chestLeft`...) vì đây chính là cột `design_<key>` khách
 * điền khi lên đơn CSV/API (cùng convention import OnosPod, xem Orders.md §3.6).
 */
export const ProductPrintAreaZod = z.object({
  key: DesignFieldsZod.keyof(),
  /** Tên hiển thị (VD: "Mặt trước"). */
  name: z.string().min(1).max(120),
  /** Link PSD/template design cho vị trí này. */
  templateUrl: z.string().max(1000).optional(),
  widthPx: z.coerce.number().min(0).optional(),
  heightPx: z.coerce.number().min(0).optional(),
  /** Khách BẮT BUỘC nộp design vị trí này khi lên đơn. */
  isRequired: z.boolean().default(false),
  /** Vùng thêu — yêu cầu file .png khi xử lý. */
  isEmbroidery: z.boolean().default(false),
});
export type ProductPrintArea = z.infer<typeof ProductPrintAreaZod>;

/** 1 dòng "item specifics" — thuộc tính tự do (VD: "Chất liệu" / "Cotton 100%"). */
export const ProductItemSpecificZod = z.object({
  label: z.string().min(1).max(120),
  value: z.string().min(1).max(500),
});
export type ProductItemSpecific = z.infer<typeof ProductItemSpecificZod>;

/**
 * Biến thể sản phẩm (màu/size cụ thể) — SKU riêng, giá vốn (cost/nonShipCost)
 * dùng nội bộ, `retailPrice` là giá niêm yết hiển thị cho khách (chưa áp
 * discount). `weight/width/height/length` override đóng gói mặc định của sản
 * phẩm khi biến thể này có kích thước/khối lượng khác.
 */
export const ProductVariationZod = z.object({
  sku: z.string().min(1).max(100).trim().toUpperCase(),
  /**
   * Giá trị option của variant — align theo INDEX với `ProductConfig.optionNames`
   * (VD optionNames=['Color','Size'] → options=['Black','M']). Độ dài PHẢI bằng
   * `optionNames.length` (BE validate). Tổ hợp không được trùng giữa các variant.
   */
  options: z.string().trim().min(1).max(100).array().max(PRODUCT_OPTION_GROUP_MAX).optional(),
  /** @deprecated legacy — đã migrate sang `options`. Chỉ còn trên data cũ. */
  color: z.string().max(100).optional(),
  /** @deprecated legacy — đã migrate sang `options`. Chỉ còn trên data cũ. */
  size: z.string().max(100).optional(),
  /** Giá vốn sản xuất — cột "Cost" (hệ cũ: base_price). */
  cost: PriceZod.optional(),
  /** Giá vốn KHÔNG gồm ship — cột "Non-Ship" (hệ cũ: nonship_price). */
  nonShipCost: PriceZod.optional(),
  /** Giá sỉ — cột "Wholesale" (hệ cũ: wholesale_price). */
  wholesalePrice: PriceZod.optional(),
  /** Giá bán kèm ship Express US — cột "EXP US $" (hệ cũ: sale_price). Cũng là giá niêm yết catalog khách. */
  retailPrice: PriceZod.optional(),
  /** Giá bán TikTok US — cột "TT US $" (hệ cũ: tiktok_final_price). */
  tiktokPrice: PriceZod.optional(),
  /** Phí ship Express US — cột "EXP US/TIKTOK US" vế trái (hệ cũ auto từ onosexpress, giờ nhập tay). */
  expUsShipCost: PriceZod.optional(),
  /** Phí ship TikTok (SBTT) — cột "EXP US/TIKTOK US" vế phải. */
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
  /** Slug SEO/URL (hệ cũ: slug) — không bắt buộc, không enforce unique (chưa có route dùng). */
  slug: z.string().max(300).optional(),
  /** SKU sản phẩm (hệ cũ: sku, VD "THHW-SHIRT") — làm PREFIX sinh SKU biến thể, fallback shortName. */
  sku: z.string().max(100).trim().toUpperCase().optional(),
  /** Machine number/identifier (e.g. "94", "27"). Empty → product has no tool. */
  machineNumber: z.string().max(60).optional(),
  machineTypeId: IDZod,
  factoryId: IDZod,
  /** workshop_config code (category=fabric_type). Default fabric used at import. */
  fabricType: z.string().max(60).optional(),
  /** workshop_config code (category=tool_result). Default tool status at import. */
  toolResult: z.string().max(60).optional(),
  /** Ảnh/URL mockup CHÍNH của sản phẩm — hiển thị cột đầu bảng config + thumbnail mọi nơi. */
  mockup: z.string().max(1000).optional(),
  /** Gallery ảnh PHỤ (không gồm `mockup`) — upload hoặc dán link, tối đa 20. */
  images: z.string().max(1000).array().max(20).optional(),
  /** Cấp độ sản phẩm 1..10 (PRODUCT_LEVELS) — hiển thị badge màu. */
  level: z.number().int().min(1).max(10).optional(),
  /** Hướng dẫn / ghi chú sản phẩm — HTML từ rich text editor (react-quill). */
  guide: z.string().max(20000).optional(),

  // ─── Thông tin chi tiết sản phẩm (catalog cho khách hàng) ───────
  /** ref ProductCategoryEntity — module riêng, xem `product-category.dto.ts`. */
  productCategoryId: IDZod.optional(),
  /** ref CollectionEntity (nhiều-nhiều) — bộ sưu tập khách duyệt khi lên đơn, xem `collection.dto.ts`. */
  collectionIds: IDZod.array().max(20).optional(),
  /** workshop_config code (category=print_method). */
  printMethod: z.string().max(60).optional(),
  /** Vị trí in (free-text, VD: "Mặt trước 30x40cm, mặt sau 20x25cm"). */
  printArea: z.string().max(2000).optional(),
  /** Ảnh/URL bảng size. */
  sizeChartUrl: z.string().max(1000).optional(),
  /** Mô tả sản phẩm ("Item description") — HTML từ rich text editor, hiển thị cho khách hàng ở Customer Portal. */
  description: z.string().max(20000).optional(),
  /** Mô tả ngắn ("Short description") — HTML, bullet tóm tắt. */
  shortDescription: z.string().max(20000).optional(),
  /** "Template description" — HTML hướng dẫn file in/template cho khách. */
  templateDescription: z.string().max(20000).optional(),
  /** Thời gian SẢN XUẤT tối đa (ngày) — hệ cũ "Max Production time". */
  maxProductionTime: z.coerce.number().min(0).optional(),
  /** Thời gian SHIP tối đa (ngày) — hệ cũ "Max shipping time". */
  maxShippingTime: z.coerce.number().min(0).optional(),
  /** Ẩn sản phẩm khỏi catalog khách — hệ cũ "Hide product for seller" (visible=false). */
  hideForSeller: z.boolean().optional(),
  /** Bật soát design — hệ cũ "Enable design check" (skip_design_check=false). */
  enableDesignCheck: z.boolean().optional(),
  /** Bật hoa hồng affiliate — hệ cũ "Enable affiliate commission" (skip_affiliate=false). */
  enableAffiliate: z.boolean().optional(),
  /** Thông số kỹ thuật dạng key-value tự do (chất liệu, kiểu dáng...). */
  itemSpecifics: ProductItemSpecificZod.array().max(50).optional(),
  /** Đóng gói mặc định (áp dụng khi biến thể không override). */
  weight: z.coerce.number().min(0).optional(),
  width: z.coerce.number().min(0).optional(),
  height: z.coerce.number().min(0).optional(),
  length: z.coerce.number().min(0).optional(),
  /**
   * Tên các nhóm option user tự định nghĩa (VD: ['Color','Size'] hay
   * ['Ship By Label']) — tối đa PRODUCT_OPTION_GROUP_MAX nhóm, không trùng tên
   * (case-insensitive). Variants sinh từ tổ hợp option của các nhóm này.
   */
  optionNames: z.string().trim().min(1).max(60).array().max(PRODUCT_OPTION_GROUP_MAX).optional(),
  /** Danh sách biến thể (tổ hợp option) — SKU riêng từng biến thể. */
  variations: ProductVariationZod.array().max(PRODUCT_VARIANTS_MAX).optional(),
  /** Vị trí in structured — nền cho khách lên đơn CSV (validate cột design_*). */
  printAreas: ProductPrintAreaZod.array().max(18).optional(),
});
export type ProductConfig = z.infer<typeof ProductConfigZod>;

//
export const GetProductConfigsZod = PageQueryZod.extend({
  factoryId: IDZod.optional(),
  machineTypeId: IDZod.optional(),
});
export class GetProductConfigsDto extends createZodDto(extendApi(GetProductConfigsZod)) {}

export const GetProductConfigsResZod = PageResZod.extend({ data: ProductConfigZod.array() });
export class GetProductConfigsResDto extends createZodDto(extendApi(GetProductConfigsResZod)) {}

export const GetProductConfigResZod = ResZod.extend({ data: ProductConfigZod });
export class GetProductConfigResDto extends createZodDto(extendApi(GetProductConfigResZod)) {}

//
export const CreateProductConfigZod = z.object({
  fullName: ProductConfigZod.shape.fullName,
  shortName: ProductConfigZod.shape.shortName,
  machineNumber: ProductConfigZod.shape.machineNumber,
  machineTypeId: ProductConfigZod.shape.machineTypeId,
  factoryId: ProductConfigZod.shape.factoryId,
  fabricType: ProductConfigZod.shape.fabricType,
  toolResult: ProductConfigZod.shape.toolResult,
  mockup: ProductConfigZod.shape.mockup,
  images: ProductConfigZod.shape.images,
  level: ProductConfigZod.shape.level,
  guide: ProductConfigZod.shape.guide,
  slug: ProductConfigZod.shape.slug,
  sku: ProductConfigZod.shape.sku,
  productCategoryId: ProductConfigZod.shape.productCategoryId,
  collectionIds: ProductConfigZod.shape.collectionIds,
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
  optionNames: ProductConfigZod.shape.optionNames,
  variations: ProductConfigZod.shape.variations,
  printAreas: ProductConfigZod.shape.printAreas,
});
export class CreateProductConfigDto extends createZodDto(extendApi(CreateProductConfigZod)) {}

export const CreateProductConfigResZod = ResZod.extend({ data: ProductConfigZod });
export class CreateProductConfigResDto extends createZodDto(extendApi(CreateProductConfigResZod)) {}

//
export const UpdateProductConfigZod = z.object({
  fullName: ProductConfigZod.shape.fullName.optional(),
  shortName: ProductConfigZod.shape.shortName.optional(),
  machineNumber: ProductConfigZod.shape.machineNumber,
  machineTypeId: ProductConfigZod.shape.machineTypeId.optional(),
  factoryId: ProductConfigZod.shape.factoryId.optional(),
  fabricType: ProductConfigZod.shape.fabricType,
  toolResult: ProductConfigZod.shape.toolResult,
  mockup: ProductConfigZod.shape.mockup,
  images: ProductConfigZod.shape.images,
  level: ProductConfigZod.shape.level,
  guide: ProductConfigZod.shape.guide,
  slug: ProductConfigZod.shape.slug,
  sku: ProductConfigZod.shape.sku,
  productCategoryId: ProductConfigZod.shape.productCategoryId,
  collectionIds: ProductConfigZod.shape.collectionIds,
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
  optionNames: ProductConfigZod.shape.optionNames,
  variations: ProductConfigZod.shape.variations,
  printAreas: ProductConfigZod.shape.printAreas,
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

// ─── Customer Portal — Catalog (chỉ field an toàn cho khách hàng) ───
// KHÔNG bao giờ trả `cost` / `nonShipCost` (giá vốn nội bộ) ra Customer Portal.

export const CustomerCatalogVariationZod = z.object({
  sku: ProductVariationZod.shape.sku,
  /** Giá trị option align theo index với `optionNames` của item. */
  options: z.string().array().optional(),
  color: ProductVariationZod.shape.color,
  size: ProductVariationZod.shape.size,
  retailPrice: ProductVariationZod.shape.retailPrice,
  /** Giá sau khi áp chương trình giảm giá tốt nhất theo tier của khách (nếu có). */
  discountedPrice: PriceZod.optional(),
  appliedPromotionName: z.string().optional(),
});
export type CustomerCatalogVariation = z.infer<typeof CustomerCatalogVariationZod>;

export const CustomerCatalogItemZod = z.object({
  _id: IDZod,
  fullName: z.string(),
  shortName: z.string(),
  /** Tên danh mục đã resolve từ `productCategoryId` (ProductCategory module) — KHÔNG phải id. */
  productCategory: z.string().optional(),
  printMethod: z.string().optional(),
  printArea: z.string().optional(),
  mockup: z.string().optional(),
  sizeChartUrl: z.string().optional(),
  description: z.string().optional(),
  itemSpecifics: ProductItemSpecificZod.array().optional(),
  /** Tên các nhóm option — variants[].options align theo index với mảng này. */
  optionNames: z.string().array().optional(),
  variations: CustomerCatalogVariationZod.array(),
});
export type CustomerCatalogItem = z.infer<typeof CustomerCatalogItemZod>;

export const GetCustomerCatalogZod = PageQueryZod.extend({
  productCategoryId: IDZod.optional(),
  collectionId: IDZod.optional(),
});
export class GetCustomerCatalogDto extends createZodDto(extendApi(GetCustomerCatalogZod)) {}

export const GetCustomerCatalogResZod = PageResZod.extend({ data: CustomerCatalogItemZod.array() });
export class GetCustomerCatalogResDto extends createZodDto(extendApi(GetCustomerCatalogResZod)) {}

import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { PriceZod } from '@shared/constants';
import { Status } from '@shared/enums';
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
 * Biến thể sản phẩm (màu/size cụ thể) — SKU riêng, giá vốn (cost/nonShipCost)
 * dùng nội bộ, `retailPrice` là giá niêm yết hiển thị cho khách (chưa áp
 * discount). `weight/width/height/length` override đóng gói mặc định của sản
 * phẩm khi biến thể này có kích thước/khối lượng khác.
 */
export const ProductVariationZod = z.object({
  sku: z.string().min(1).max(100).trim().toUpperCase(),
  color: z.string().max(100).optional(),
  size: z.string().max(100).optional(),
  /** Giá vốn sản xuất. */
  cost: PriceZod.optional(),
  /** Giá vốn KHÔNG gồm phí ship. */
  nonShipCost: PriceZod.optional(),
  /** Giá bán niêm yết cho khách (trước khi áp chương trình giảm giá). */
  retailPrice: PriceZod.optional(),
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
  /** Machine number/identifier (e.g. "94", "27"). Empty → product has no tool. */
  machineNumber: z.string().max(60).optional(),
  machineTypeId: IDZod,
  factoryId: IDZod,
  /** workshop_config code (category=fabric_type). Default fabric used at import. */
  fabricType: z.string().max(60).optional(),
  /** workshop_config code (category=tool_result). Default tool status at import. */
  toolResult: z.string().max(60).optional(),
  /** Ảnh/URL mockup sản phẩm — hiển thị cột đầu bảng config. */
  mockup: z.string().max(1000).optional(),
  /** Cấp độ sản phẩm 1..10 (PRODUCT_LEVELS) — hiển thị badge màu. */
  level: z.number().int().min(1).max(10).optional(),
  /** Hướng dẫn / ghi chú sản phẩm (free-text, nhập ở textarea). */
  guide: z.string().max(5000).optional(),

  // ─── Thông tin chi tiết sản phẩm (catalog cho khách hàng) ───────
  /** ref ProductCategoryEntity — module riêng, xem `product-category.dto.ts`. */
  productCategoryId: IDZod.optional(),
  /** workshop_config code (category=print_method). */
  printMethod: z.string().max(60).optional(),
  /** Vị trí in (free-text, VD: "Mặt trước 30x40cm, mặt sau 20x25cm"). */
  printArea: z.string().max(2000).optional(),
  /** Ảnh/URL bảng size. */
  sizeChartUrl: z.string().max(1000).optional(),
  /** Mô tả sản phẩm — hiển thị cho khách hàng ở Customer Portal. */
  description: z.string().max(5000).optional(),
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
});
export class GetProductConfigsDto extends createZodDto(extendApi(GetProductConfigsZod)) {}

export const GetProductConfigsResZod = PageResZod.extend({ data: ProductConfigZod.array() });
export class GetProductConfigsResDto extends createZodDto(extendApi(GetProductConfigsResZod)) {}

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
  level: ProductConfigZod.shape.level,
  guide: ProductConfigZod.shape.guide,
  productCategoryId: ProductConfigZod.shape.productCategoryId,
  printMethod: ProductConfigZod.shape.printMethod,
  printArea: ProductConfigZod.shape.printArea,
  sizeChartUrl: ProductConfigZod.shape.sizeChartUrl,
  description: ProductConfigZod.shape.description,
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
  machineNumber: ProductConfigZod.shape.machineNumber,
  machineTypeId: ProductConfigZod.shape.machineTypeId.optional(),
  factoryId: ProductConfigZod.shape.factoryId.optional(),
  fabricType: ProductConfigZod.shape.fabricType,
  toolResult: ProductConfigZod.shape.toolResult,
  mockup: ProductConfigZod.shape.mockup,
  level: ProductConfigZod.shape.level,
  guide: ProductConfigZod.shape.guide,
  productCategoryId: ProductConfigZod.shape.productCategoryId,
  printMethod: ProductConfigZod.shape.printMethod,
  printArea: ProductConfigZod.shape.printArea,
  sizeChartUrl: ProductConfigZod.shape.sizeChartUrl,
  description: ProductConfigZod.shape.description,
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

// ─── Customer Portal — Catalog (chỉ field an toàn cho khách hàng) ───
// KHÔNG bao giờ trả `cost` / `nonShipCost` (giá vốn nội bộ) ra Customer Portal.

export const CustomerCatalogVariationZod = z.object({
  sku: ProductVariationZod.shape.sku,
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
  variations: CustomerCatalogVariationZod.array(),
});
export type CustomerCatalogItem = z.infer<typeof CustomerCatalogItemZod>;

export const GetCustomerCatalogZod = PageQueryZod.extend({
  productCategoryId: IDZod.optional(),
});
export class GetCustomerCatalogDto extends createZodDto(extendApi(GetCustomerCatalogZod)) {}

export const GetCustomerCatalogResZod = PageResZod.extend({ data: CustomerCatalogItemZod.array() });
export class GetCustomerCatalogResDto extends createZodDto(extendApi(GetCustomerCatalogResZod)) {}

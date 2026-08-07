import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CustomerCatalogFacet,
  CustomerCatalogItem,
  CustomerCatalogPrintArea,
  CustomerCatalogVariation,
  GetCustomerCatalogDto,
  GetCustomerCatalogFacetsResDto,
  GetCustomerCatalogItemResDto,
  GetCustomerCatalogResDto,
  ProductPrintAreaItem,
} from 'shared';
import { PRODUCT_PRINT_AREA_LABEL_MAP, ProductConfigStatus } from 'shared';

import { CollectionEntity } from '@/modules/collection/collection.entity';
import type { CustomerDocument } from '@/modules/customer/customer.entity';
import { ProductCategoryEntity } from '@/modules/product-category/product-category.entity';
import { ProductConfigEntity } from '@/modules/product-config/product-config.entity';
import { applyPromotionDiscount, promotionMatches, PromotionService } from '@/modules/promotion/promotion.service';

const CATALOG_ROW_SELECT =
  'fullName shortName productCategoryId printMethod printArea printDocument printTemplate mockup images usImportTaxPerUnit sizeChartUrl description itemSpecifics variations';

type ActivePromotion = Awaited<ReturnType<PromotionService['getActiveInDateRange']>>[number];

/**
 * Catalog cho Customer Portal — CHỈ tham khảo (xem sản phẩm + giá tham khảo
 * đã áp discount theo tier của khách), KHÔNG dùng để tính tổng tiền đơn hàng.
 * Ẩn tuyệt đối `cost`/`nonShipCost` (giá vốn nội bộ).
 */
@Injectable()
export class CustomerCatalogService {
  constructor(
    @InjectModel(ProductConfigEntity.name) private readonly productConfigModel: Model<ProductConfigEntity>,
    @InjectModel(ProductCategoryEntity.name) private readonly productCategoryModel: Model<ProductCategoryEntity>,
    @InjectModel(CollectionEntity.name) private readonly collectionModel: Model<CollectionEntity>,
    private readonly promotionService: PromotionService,
  ) {}

  /** Chỉ Active mới hiện catalog khách hàng — `null` để tương thích ngược data cũ chưa có field `status`. */
  private static readonly VISIBLE_FILTER = { status: { $in: [ProductConfigStatus.Active, null] } };

  /** Map 1 dòng `ProductConfig` (đã `.lean()` + populate `productCategory`) → `CustomerCatalogItem`, áp discount theo tier. */
  private mapRow(
    row: Record<string, unknown> & { _id: unknown; productCategory?: { name?: string } },
    activePromotions: ActivePromotion[],
    tier: number | null,
  ): CustomerCatalogItem {
    const productConfigId = String(row._id);
    const productCategoryId = row.productCategoryId as string | undefined;
    const rowVariations = (row.variations || []) as Array<{
      sku: string;
      attributes?: CustomerCatalogVariation['attributes'];
      status?: string;
      retailPrice?: number;
      nonShipCost?: number;
      tiktokPrice?: number;
      weight?: number;
      width?: number;
      height?: number;
      length?: number;
      packageGram?: number;
    }>;

    const variations: CustomerCatalogVariation[] = rowVariations
      .filter((v) => v.status !== '0')
      .map((v) => {
        const matched = activePromotions
          .filter((p) => promotionMatches(p, { productConfigId, productCategoryId, tier, quantity: 1 }))
          .map((p) => ({
            promotion: p,
            price: v.retailPrice != null ? applyPromotionDiscount(v.retailPrice, p) : undefined,
          }))
          .filter((x): x is { promotion: ActivePromotion; price: number } => x.price != null)
          .sort((a, b) => a.price - b.price);
        const best = matched[0];
        return {
          sku: v.sku,
          attributes: v.attributes,
          retailPrice: v.retailPrice,
          discountedPrice: best?.price,
          appliedPromotionName: best?.promotion.name,
          // `nonShipCost` = GIÁ BÁN nonship hệ cũ (cột "SHIP COD" public trang cũ) — xem CustomerCatalogVariationZod.
          shipCodPrice: v.nonShipCost,
          tiktokPrice: v.tiktokPrice,
          weight: v.weight,
          width: v.width,
          height: v.height,
          length: v.length,
          packageGram: v.packageGram,
        };
      });

    // Chịu được cả 2 dạng data: object giàu (mới) lẫn bare string key (cũ,
    // trước khi backfill onModuleInit chạy) — KHÔNG trả additionPrice/isEmbroidery.
    const printArea: CustomerCatalogPrintArea[] = ((row.printArea || []) as Array<ProductPrintAreaItem | string>).map(
      (p) => {
        const item: ProductPrintAreaItem = typeof p === 'string' ? { key: p as ProductPrintAreaItem['key'] } : p;
        return {
          key: item.key,
          label: PRODUCT_PRINT_AREA_LABEL_MAP[item.key],
          templateUrl: item.templateUrl,
          widthPx: item.widthPx,
          heightPx: item.heightPx,
          isRequired: item.isRequired,
        };
      },
    );

    return {
      _id: productConfigId,
      fullName: row.fullName as string,
      shortName: row.shortName as string,
      productCategory: row.productCategory?.name,
      printMethod: row.printMethod as string | undefined,
      printArea,
      printDocument: row.printDocument as string | undefined,
      printTemplate: row.printTemplate as string | undefined,
      mockup: row.mockup as string | undefined,
      images: row.images as string[] | undefined,
      usImportTaxPerUnit: row.usImportTaxPerUnit as number | undefined,
      sizeChartUrl: row.sizeChartUrl as string | undefined,
      description: row.description as string | undefined,
      shortDescription: row.shortDescription as string | undefined,
      templateDescription: row.templateDescription as string | undefined,
      itemSpecifics: row.itemSpecifics as CustomerCatalogItem['itemSpecifics'],
      variations,
    };
  }

  /** Filter gốc "sản phẩm khách thấy được" — mọi query catalog (list/detail/facets) đều xuất phát từ đây. */
  private static baseVisibleFilter(): Record<string, unknown> {
    return { variations: { $exists: true, $ne: [] }, ...CustomerCatalogService.VISIBLE_FILTER };
  }

  async getCatalog(customer: CustomerDocument, dto: GetCustomerCatalogDto): Promise<GetCustomerCatalogResDto> {
    const { page, limit, search, productCategoryId, collectionId } = dto;
    const filter = CustomerCatalogService.baseVisibleFilter();
    if (search) filter.fullName = { $regex: search, $options: 'i' };
    if (productCategoryId) filter.productCategoryId = productCategoryId;
    if (collectionId) filter.collectionIds = collectionId;

    const [rows, total, activePromotions] = await Promise.all([
      this.productConfigModel
        .find(filter)
        .select(CATALOG_ROW_SELECT)
        .populate<{ productCategory?: { name: string } }>({ path: 'productCategory', select: 'name' })
        .sort({ fullName: 1 })
        .skip(limit * (page - 1))
        .limit(limit)
        .lean(),
      this.productConfigModel.countDocuments(filter),
      this.promotionService.getActiveInDateRange(),
    ]);

    const tier = customer.tier ?? null;
    const data = rows.map((row) => this.mapRow(row, activePromotions, tier));

    return { success: true, data, total };
  }

  /** 1 sản phẩm cho trang chi tiết `/customer/catalog/:id` — cùng filter Active + có biến thể như danh sách. */
  async getCatalogItem(customer: CustomerDocument, id: string): Promise<GetCustomerCatalogItemResDto> {
    const [row, activePromotions] = await Promise.all([
      this.productConfigModel
        .findOne({ _id: id, ...CustomerCatalogService.baseVisibleFilter() })
        // Field nặng (HTML dài) + collectionIds chỉ trả ở API chi tiết, KHÔNG cho list.
        .select(`${CATALOG_ROW_SELECT} collectionIds shortDescription templateDescription`)
        .populate<{ productCategory?: { name: string } }>({ path: 'productCategory', select: 'name' })
        .lean(),
      this.promotionService.getActiveInDateRange(),
    ]);
    if (!row) throw new NotFoundException('Không tìm thấy sản phẩm này.');

    const collectionIds = row.collectionIds || [];
    const collections =
      collectionIds.length > 0
        ? await this.collectionModel
            .find({ _id: { $in: collectionIds }, isActive: true })
            .select('name sortOrder')
            .sort({ sortOrder: 1, name: 1 })
            .lean()
        : [];

    const tier = customer.tier ?? null;
    const data = this.mapRow(row, activePromotions, tier);
    data.collections = collections.map((c) => c.name);
    return { success: true, data };
  }

  /**
   * Bộ lọc duyệt catalog: danh mục + collection đang active kèm số sản phẩm
   * khách thấy được (cùng filter Active + có biến thể) — chỉ trả mục count > 0.
   */
  async getFacets(): Promise<GetCustomerCatalogFacetsResDto> {
    const visible = CustomerCatalogService.baseVisibleFilter();
    const [categoryCounts, collectionCounts] = await Promise.all([
      this.productConfigModel.aggregate<{ _id: string; count: number }>([
        { $match: { ...visible, productCategoryId: { $exists: true, $nin: [null, ''] } } },
        { $group: { _id: '$productCategoryId', count: { $sum: 1 } } },
      ]),
      this.productConfigModel.aggregate<{ _id: string; count: number }>([
        { $match: visible },
        { $unwind: '$collectionIds' },
        { $group: { _id: '$collectionIds', count: { $sum: 1 } } },
      ]),
    ]);

    const categoryCountMap = new Map(categoryCounts.map((c) => [String(c._id), c.count]));
    const collectionCountMap = new Map(collectionCounts.map((c) => [String(c._id), c.count]));

    const [categories, collections] = await Promise.all([
      categoryCountMap.size > 0
        ? this.productCategoryModel
            .find({ _id: { $in: [...categoryCountMap.keys()] }, isActive: true })
            .select('name')
            .sort({ name: 1 })
            .lean()
        : Promise.resolve([]),
      collectionCountMap.size > 0
        ? this.collectionModel
            .find({ _id: { $in: [...collectionCountMap.keys()] }, isActive: true })
            .select('name image sortOrder')
            .sort({ sortOrder: 1, name: 1 })
            .lean()
        : Promise.resolve([]),
    ]);

    const toFacet = (row: { _id: unknown; name: string; image?: string }, count: number): CustomerCatalogFacet => ({
      _id: String(row._id),
      name: row.name,
      image: row.image,
      count,
    });

    return {
      success: true,
      data: {
        categories: categories.map((c) => toFacet(c, categoryCountMap.get(String(c._id)) ?? 0)),
        collections: collections.map((c) => toFacet(c, collectionCountMap.get(String(c._id)) ?? 0)),
      },
    };
  }
}

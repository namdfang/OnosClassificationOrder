import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CustomerCatalogItem,
  CustomerCatalogPrintArea,
  CustomerCatalogVariation,
  GetCustomerCatalogDto,
  GetCustomerCatalogItemResDto,
  GetCustomerCatalogResDto,
} from 'shared';
import { PRODUCT_PRINT_AREA_LABEL_MAP, ProductConfigStatus } from 'shared';

import type { CustomerDocument } from '@/modules/customer/customer.entity';
import { ProductConfigEntity } from '@/modules/product-config/product-config.entity';
import { applyPromotionDiscount, promotionMatches, PromotionService } from '@/modules/promotion/promotion.service';

const CATALOG_ROW_SELECT =
  'fullName shortName productCategoryId printMethod printArea mockup sizeChartUrl description itemSpecifics variations';

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
    }>;

    const variations: CustomerCatalogVariation[] = rowVariations
      .filter((v) => v.status !== '0')
      .map((v) => {
        const matched = activePromotions
          .filter((p) => promotionMatches(p, { productConfigId, productCategoryId, tier, quantity: 1 }))
          .map((p) => ({ promotion: p, price: v.retailPrice != null ? applyPromotionDiscount(v.retailPrice, p) : undefined }))
          .filter((x): x is { promotion: ActivePromotion; price: number } => x.price != null)
          .sort((a, b) => a.price - b.price);
        const best = matched[0];
        return {
          sku: v.sku,
          attributes: v.attributes,
          retailPrice: v.retailPrice,
          discountedPrice: best?.price,
          appliedPromotionName: best?.promotion.name,
        };
      });

    const printArea: CustomerCatalogPrintArea[] = ((row.printArea || []) as CustomerCatalogPrintArea['key'][]).map((key) => ({
      key,
      label: PRODUCT_PRINT_AREA_LABEL_MAP[key],
    }));

    return {
      _id: productConfigId,
      fullName: row.fullName as string,
      shortName: row.shortName as string,
      productCategory: row.productCategory?.name,
      printMethod: row.printMethod as string | undefined,
      printArea,
      mockup: row.mockup as string | undefined,
      sizeChartUrl: row.sizeChartUrl as string | undefined,
      description: row.description as string | undefined,
      itemSpecifics: row.itemSpecifics as CustomerCatalogItem['itemSpecifics'],
      variations,
    };
  }

  async getCatalog(customer: CustomerDocument, dto: GetCustomerCatalogDto): Promise<GetCustomerCatalogResDto> {
    const { page, limit, search, productCategoryId } = dto;
    const filter: Record<string, unknown> = {
      variations: { $exists: true, $ne: [] },
      ...CustomerCatalogService.VISIBLE_FILTER,
    };
    if (search) filter.fullName = { $regex: search, $options: 'i' };
    if (productCategoryId) filter.productCategoryId = productCategoryId;

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
        .findOne({ _id: id, variations: { $exists: true, $ne: [] }, ...CustomerCatalogService.VISIBLE_FILTER })
        .select(CATALOG_ROW_SELECT)
        .populate<{ productCategory?: { name: string } }>({ path: 'productCategory', select: 'name' })
        .lean(),
      this.promotionService.getActiveInDateRange(),
    ]);
    if (!row) throw new NotFoundException('Không tìm thấy sản phẩm này.');

    const tier = customer.tier ?? null;
    return { success: true, data: this.mapRow(row, activePromotions, tier) };
  }
}

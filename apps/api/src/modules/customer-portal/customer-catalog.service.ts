import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { CustomerCatalogItem, CustomerCatalogVariation, GetCustomerCatalogDto, GetCustomerCatalogResDto } from 'shared';

import type { CustomerDocument } from '@/modules/customer/customer.entity';
import { ProductConfigEntity } from '@/modules/product-config/product-config.entity';
import { applyPromotionDiscount, promotionMatches, PromotionService } from '@/modules/promotion/promotion.service';

/**
 * Catalog cho Customer Portal — CHỈ tham khảo (xem sản phẩm + giá tham khảo
 * đã áp discount theo tier của khách), KHÔNG dùng để tính tổng tiền đơn hàng
 * (form đặt đơn `/customer/orders/new` vẫn giữ nguyên, không đổi). Ẩn tuyệt
 * đối `cost`/`nonShipCost` (giá vốn nội bộ).
 */
@Injectable()
export class CustomerCatalogService {
  constructor(
    @InjectModel(ProductConfigEntity.name) private readonly productConfigModel: Model<ProductConfigEntity>,
    private readonly promotionService: PromotionService,
  ) {}

  async getCatalog(customer: CustomerDocument, dto: GetCustomerCatalogDto): Promise<GetCustomerCatalogResDto> {
    const { page, limit, search, productCategoryId } = dto;
    const filter: Record<string, unknown> = { variations: { $exists: true, $ne: [] } };
    if (search) filter.fullName = { $regex: search, $options: 'i' };
    if (productCategoryId) filter.productCategoryId = productCategoryId;

    const [rows, total, activePromotions] = await Promise.all([
      this.productConfigModel
        .find(filter)
        .select(
          'fullName shortName productCategoryId printMethod printArea mockup sizeChartUrl description itemSpecifics variations',
        )
        .populate<{ productCategory?: { name: string } }>({ path: 'productCategory', select: 'name' })
        .sort({ fullName: 1 })
        .skip(limit * (page - 1))
        .limit(limit)
        .lean(),
      this.productConfigModel.countDocuments(filter),
      this.promotionService.getActiveInDateRange(),
    ]);

    const tier = customer.tier ?? null;

    const data: CustomerCatalogItem[] = rows.map((row) => {
      const variations: CustomerCatalogVariation[] = (row.variations || [])
        .filter((v) => v.status !== '0')
        .map((v) => {
          const matched = activePromotions
            .filter((p) =>
              promotionMatches(p, {
                productConfigId: String(row._id),
                productCategoryId: row.productCategoryId,
                tier,
                quantity: 1,
              }),
            )
            .map((p) => ({ promotion: p, price: v.retailPrice != null ? applyPromotionDiscount(v.retailPrice, p) : undefined }))
            .filter((x): x is { promotion: (typeof activePromotions)[number]; price: number } => x.price != null)
            .sort((a, b) => a.price - b.price);
          const best = matched[0];
          return {
            sku: v.sku,
            color: v.color,
            size: v.size,
            retailPrice: v.retailPrice,
            discountedPrice: best?.price,
            appliedPromotionName: best?.promotion.name,
          };
        });

      return {
        _id: String(row._id),
        fullName: row.fullName,
        shortName: row.shortName,
        productCategory: row.productCategory?.name,
        printMethod: row.printMethod,
        printArea: row.printArea,
        mockup: row.mockup,
        sizeChartUrl: row.sizeChartUrl,
        description: row.description,
        itemSpecifics: row.itemSpecifics,
        variations,
      };
    });

    return { success: true, data, total };
  }
}

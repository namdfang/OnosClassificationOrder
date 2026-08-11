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

  /**
   * Cổng hiển thị catalog khách hàng: **chỉ dựa vào `status`** — Active, hoặc
   * `null`/thiếu field để tương thích ngược data cũ (`$in: [x, null]` của
   * MongoDB khớp cả document không có field).
   *
   * KHÔNG lọc theo `variations` nữa. Trước đây filter có thêm
   * `variations: { $exists: true, $ne: [] }` để ngầm hiểu "phải có biến thể mới
   * có giá mà hiện" — thực tế dữ liệu gần như không sản phẩm nào nhập biến thể
   * (2/151 doc có field, cả 2 đều là mảng rỗng) nên catalog LUÔN trống. Biến thể
   * chỉ là dữ liệu giá/SKU tùy chọn: sản phẩm chưa có biến thể vẫn xem được
   * (giá hiển thị "—") và vẫn đặt đơn được — `PlaceCustomerOrderItemZod` chỉ bắt
   * buộc `type`, còn `color`/`size` là optional.
   */
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
    return this.listCatalog(dto, customer.tier ?? null);
  }

  /**
   * Catalog cho trang public `/catalog` (KHÔNG đăng nhập) — xem `PublicCatalogController`.
   *
   * Dùng chung đúng truy vấn/mapping với catalog khách đã đăng nhập, chỉ khác 2 điểm:
   * `tier = null` và KHÔNG áp promotion → chỉ ra `retailPrice` (giá niêm yết),
   * `discountedPrice`/`appliedPromotionName` để trống. Giá theo tier là quyền lợi
   * riêng của khách đã có tài khoản, không lộ ra ngoài.
   */
  async getPublicCatalog(dto: GetCustomerCatalogDto): Promise<GetCustomerCatalogResDto> {
    return this.listCatalog(dto, null, { applyPromotions: false });
  }

  /** 1 sản phẩm cho trang chi tiết public `/catalog/:id` — cùng quy tắc giá với `getPublicCatalog()`. */
  async getPublicCatalogItem(id: string): Promise<GetCustomerCatalogItemResDto> {
    return this.findCatalogItem(id, null, { applyPromotions: false });
  }

  private async listCatalog(
    dto: GetCustomerCatalogDto,
    tier: number | null,
    { applyPromotions = true }: { applyPromotions?: boolean } = {},
  ): Promise<GetCustomerCatalogResDto> {
    const { page, limit, search, productCategoryId } = dto;
    const filter: Record<string, unknown> = { ...CustomerCatalogService.VISIBLE_FILTER };
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
      applyPromotions ? this.promotionService.getActiveInDateRange() : Promise.resolve([]),
    ]);

    const data = rows.map((row) => this.mapRow(row, activePromotions, tier));

    return { success: true, data, total };
  }

  /** 1 sản phẩm cho trang chi tiết `/customer/catalog/:id` — cùng cổng hiển thị `status` như danh sách. */
  async getCatalogItem(customer: CustomerDocument, id: string): Promise<GetCustomerCatalogItemResDto> {
    return this.findCatalogItem(id, customer.tier ?? null);
  }

  private async findCatalogItem(
    id: string,
    tier: number | null,
    { applyPromotions = true }: { applyPromotions?: boolean } = {},
  ): Promise<GetCustomerCatalogItemResDto> {
    const [row, activePromotions] = await Promise.all([
      this.productConfigModel
        .findOne({ _id: id, ...CustomerCatalogService.VISIBLE_FILTER })
        .select(CATALOG_ROW_SELECT)
        .populate<{ productCategory?: { name: string } }>({ path: 'productCategory', select: 'name' })
        .lean(),
      applyPromotions ? this.promotionService.getActiveInDateRange() : Promise.resolve([]),
    ]);
    if (!row) throw new NotFoundException('Không tìm thấy sản phẩm này.');

    return { success: true, data: this.mapRow(row, activePromotions, tier) };
  }
}

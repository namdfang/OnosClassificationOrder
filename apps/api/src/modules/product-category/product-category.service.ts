import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { CreateProductCategoryDto, GetProductCategoriesDto, GetProductCategoriesResDto, ProductCategory, UpdateProductCategoryDto } from 'shared';

import { ProductCategoryRepository } from './product-category.repository';

const DEFAULT_PRODUCT_CATEGORIES: Array<Pick<ProductCategory, 'name' | 'shortName' | 'isActive'>> = [
  { name: 'Áo/Quần', shortName: 'APPAREL', isActive: true },
  { name: 'Ly/Cốc', shortName: 'MUG', isActive: true },
  { name: 'Trang trí nhà', shortName: 'HOME-DECOR', isActive: true },
  { name: 'Phụ kiện', shortName: 'ACCESSORY', isActive: true },
];

@Injectable()
export class ProductCategoryService implements OnModuleInit {
  constructor(private readonly productCategoryRepository: ProductCategoryRepository) {}

  async onModuleInit() {
    for (const c of DEFAULT_PRODUCT_CATEGORIES) {
      const existing = await this.productCategoryRepository.findOne({ shortName: c.shortName });
      if (!existing) {
        await this.productCategoryRepository.create(c);
      }
    }
  }

  async getProductCategories(dto: GetProductCategoriesDto): Promise<GetProductCategoriesResDto> {
    const { page, limit, sort, order, search, isActive } = dto;
    const filter: Record<string, unknown> = {};
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { shortName: { $regex: search, $options: 'i' } }];
    if (typeof isActive === 'boolean') filter.isActive = isActive;

    const { data, total } = await this.productCategoryRepository.findAllAndCount(filter, {
      paging: { skip: limit * (page - 1), limit },
      sort: { [sort || 'createdAt']: order === 'asc' ? 1 : -1 },
    });

    return { success: true, data, total };
  }

  async getProductCategory(id: string) {
    const category = await this.productCategoryRepository.findOneById(id);
    if (!category) throw new NotFoundException('ProductCategory not found');
    return category;
  }

  async createProductCategory(dto: CreateProductCategoryDto) {
    const existing = await this.productCategoryRepository.findOne({ shortName: dto.shortName.toUpperCase() });
    if (existing) throw new BadRequestException('ProductCategory shortName already exists');
    if (dto.parentId) await this.getProductCategory(dto.parentId);
    return this.productCategoryRepository.create({
      ...dto,
      shortName: dto.shortName.toUpperCase(),
      isActive: dto.isActive ?? true,
    });
  }

  async updateProductCategory(id: string, dto: UpdateProductCategoryDto) {
    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('Danh mục không thể là cha của chính nó');
      await this.getProductCategory(dto.parentId);
      await this.assertNoCycle(id, dto.parentId);
    }
    const category = await this.productCategoryRepository.findOneAndUpdate(
      { _id: id },
      { ...dto, ...(dto.shortName ? { shortName: dto.shortName.toUpperCase() } : {}) },
    );
    if (!category) throw new NotFoundException('ProductCategory not found');
    return category;
  }

  /**
   * Chặn set `parentId` tạo vòng lặp (VD: A → B → A) — đi ngược chuỗi cha của
   * `newParentId`, nếu gặp lại `id` (chính node đang sửa) thì `newParentId`
   * thực ra là hậu duệ của `id` ⇒ 400. Giới hạn 100 bước đề phòng dữ liệu lỗi
   * sẵn có tạo vòng lặp vô hạn.
   */
  private async assertNoCycle(id: string, newParentId: string): Promise<void> {
    let currentId: string | undefined = newParentId;
    for (let i = 0; i < 100 && currentId; i++) {
      if (currentId === id) {
        throw new BadRequestException('Không thể chọn danh mục con của chính nó làm danh mục cha');
      }
      const current: { parentId?: string } | null = await this.productCategoryRepository.findOneById(currentId);
      currentId = current?.parentId;
    }
  }
}

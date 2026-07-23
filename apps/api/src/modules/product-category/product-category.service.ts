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
    return this.productCategoryRepository.create({
      ...dto,
      shortName: dto.shortName.toUpperCase(),
      isActive: dto.isActive ?? true,
    });
  }

  async updateProductCategory(id: string, dto: UpdateProductCategoryDto) {
    const category = await this.productCategoryRepository.findOneAndUpdate(
      { _id: id },
      { ...dto, ...(dto.shortName ? { shortName: dto.shortName.toUpperCase() } : {}) },
    );
    if (!category) throw new NotFoundException('ProductCategory not found');
    return category;
  }
}

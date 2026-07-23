import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateProductCategoryDto,
  CreateProductCategoryResDto,
  GetProductCategoriesDto,
  GetProductCategoriesResDto,
  RoleType,
  UpdateProductCategoryDto,
  UpdateProductCategoryResDto,
} from 'shared';

import { Auth } from '@/decorators';

import { ProductCategoryService } from './product-category.service';

@Controller('product-categories')
@ApiTags('product-categories')
export class ProductCategoryController {
  constructor(private readonly productCategoryService: ProductCategoryService) {}

  @Get()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Get product categories' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetProductCategoriesResDto })
  async getProductCategories(@Query() dto: GetProductCategoriesDto): Promise<GetProductCategoriesResDto> {
    return this.productCategoryService.getProductCategories(dto);
  }

  @Post()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Create product category' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateProductCategoryResDto })
  async createProductCategory(@Body() dto: CreateProductCategoryDto): Promise<CreateProductCategoryResDto> {
    return { success: true, data: await this.productCategoryService.createProductCategory(dto) };
  }

  @Patch(':id')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Update product category' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateProductCategoryResDto })
  async updateProductCategory(
    @Param('id') id: string,
    @Body() dto: UpdateProductCategoryDto,
  ): Promise<UpdateProductCategoryResDto> {
    return { success: true, data: await this.productCategoryService.updateProductCategory(id, dto) };
  }
}

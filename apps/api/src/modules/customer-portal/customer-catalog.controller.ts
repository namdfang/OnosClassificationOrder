import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Controller, Get, HttpCode, HttpStatus, Param, Query, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  GetCustomerCatalogDto,
  GetCustomerCatalogFacetsResDto,
  GetCustomerCatalogItemResDto,
  GetCustomerCatalogResDto,
  RoleType,
} from 'shared';

import { Auth } from '@/decorators';
import type { CustomerDocument } from '@/modules/customer/customer.entity';

import { CustomerCatalogService } from './customer-catalog.service';

@Controller('customer/catalog')
@ApiTags('customer-catalog')
@UsePipes(ZodValidationPipe)
export class CustomerCatalogController {
  constructor(private readonly customerCatalogService: CustomerCatalogService) {}

  @Get()
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Danh sách sản phẩm + giá tham khảo (đã áp discount theo tier) cho khách hàng' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerCatalogResDto })
  async getCatalog(
    @Query() dto: GetCustomerCatalogDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<GetCustomerCatalogResDto> {
    return this.customerCatalogService.getCatalog(customer, dto);
  }

  // Khai báo TRƯỚC `@Get(':id')` — route param 1 segment sẽ nuốt path này nếu đứng sau.
  @Get('facets')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Bộ lọc duyệt catalog: danh mục + collection active kèm số sản phẩm khách thấy được' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerCatalogFacetsResDto })
  async getFacets(): Promise<GetCustomerCatalogFacetsResDto> {
    return this.customerCatalogService.getFacets();
  }

  @Get(':id')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: '1 sản phẩm — trang chi tiết trước khi "Đặt đơn mới"' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerCatalogItemResDto })
  async getCatalogItem(
    @Param('id') id: string,
    @AuthUser() customer: CustomerDocument,
  ): Promise<GetCustomerCatalogItemResDto> {
    return this.customerCatalogService.getCatalogItem(customer, id);
  }
}

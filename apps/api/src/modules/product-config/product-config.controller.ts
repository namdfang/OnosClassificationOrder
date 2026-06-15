import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateProductConfigDto,
  CreateProductConfigResDto,
  GetProductConfigsDto,
  GetProductConfigsResDto,
  ImportProductConfigDto,
  ImportProductConfigResDto,
  ResDto,
  RoleType,
  UpdateProductConfigDto,
  UpdateProductConfigResDto,
} from 'shared';

import { Auth } from '@/decorators';

import { ProductConfigService } from './product-config.service';

@Controller('product-configs')
@ApiTags('product-configs')
export class ProductConfigController {
  constructor(private readonly productConfigService: ProductConfigService) {}

  @Get()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'List product configs' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetProductConfigsResDto })
  async getProductConfigs(@Query() dto: GetProductConfigsDto): Promise<GetProductConfigsResDto> {
    return this.productConfigService.getProductConfigs(dto);
  }

  @Post()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Create product config' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateProductConfigResDto })
  async createProductConfig(@Body() dto: CreateProductConfigDto): Promise<CreateProductConfigResDto> {
    return { success: true, data: await this.productConfigService.createProductConfig(dto) };
  }

  @Patch(':id')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Update product config' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateProductConfigResDto })
  async updateProductConfig(
    @Param('id') id: string,
    @Body() dto: UpdateProductConfigDto,
  ): Promise<UpdateProductConfigResDto> {
    return { success: true, data: await this.productConfigService.updateProductConfig(id, dto) };
  }

  @Delete(':id')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Delete product config' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async deleteProductConfig(@Param('id') id: string): Promise<ResDto> {
    await this.productConfigService.deleteProductConfig(id);
    return { success: true };
  }

  @Post('import')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Bulk import product configs from parsed Excel rows' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ImportProductConfigResDto })
  async importProductConfigs(@Body() dto: ImportProductConfigDto): Promise<ImportProductConfigResDto> {
    return this.productConfigService.importProductConfigs(dto);
  }
}

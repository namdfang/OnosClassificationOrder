import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  GetSellerShipPriceTableResDto,
  ImportSellerShipPriceTableDto,
  ImportSellerShipPriceTableResDto,
  ResDto,
  RoleType,
  ToggleSellerShipDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';
import type { UserDocument } from '@/modules/user/user.entity';

import { SellerShippingService } from './seller-shipping.service';

/**
 * Quản trị bảng giá label bán cho seller (hub — SellerPortal.md §9): import
 * CSV `WEIGHT,PRICE` (FE parse bằng `parseSellerShipPriceCsv` shared) + công
 * tắc tổng. Mỗi lượt mua SNAPSHOT giá vào `shipments.sellerPrice` — đổi bảng
 * không làm sai lịch sử. Prefix `admin/...` → RolesGuard chặn token khách.
 */
@Controller('admin/seller-shipping')
@ApiTags('seller-shipping-admin')
@UsePipes(ZodValidationPipe)
export class SellerShippingAdminController {
  constructor(
    private readonly sellerShippingService: SellerShippingService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get('price-table')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Bảng giá hiện hành (kèm enabled + updatedAt)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetSellerShipPriceTableResDto })
  async getPriceTable(): Promise<GetSellerShipPriceTableResDto> {
    return { success: true, data: await this.sellerShippingService.getPriceTable() };
  }

  @Post('price-table/import')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Thay bảng giá bằng bộ mốc mới (mốc tăng dần, USD)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ImportSellerShipPriceTableResDto })
  async importPriceTable(
    @Body() dto: ImportSellerShipPriceTableDto,
    @AuthUser() user: UserDocument,
  ): Promise<ImportSellerShipPriceTableResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/admin/seller-shipping/price-table/import', userId: user._id }),
    });
    return { success: true, data: await this.sellerShippingService.importPriceTable(dto.rows) };
  }

  @Post('toggle')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Bật/tắt seller tự mua label (giữ nguyên bảng giá)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async toggle(@Body() dto: ToggleSellerShipDto, @AuthUser() user: UserDocument): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'POST',
        url: '/admin/seller-shipping/toggle',
        userId: user._id,
        enabled: dto.enabled,
      }),
    });
    await this.sellerShippingService.toggle(dto.enabled);
    return { success: true };
  }
}

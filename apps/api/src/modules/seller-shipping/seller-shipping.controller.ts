import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  BuySellerLabelDto,
  BuySellerLabelResDto,
  GetSellerShipPriceTableResDto,
  GetSellerShipQuoteDto,
  GetSellerShipQuoteResDto,
  RoleType,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';
import type { CustomerDocument } from '@/modules/customer/customer.entity';

import { SellerShippingService } from './seller-shipping.service';

/**
 * Seller tự mua label VNP — prefix `customer/` bắt buộc (RolesGuard chỉ cho
 * vai Customer vào đây). Lỗi buy ném message = mã trong
 * `SELLER_SHIP_ERROR_CODES`, FE map i18n; KHÔNG BAO GIỜ trả chi tiết VNP.
 */
@Controller('customer/shipping')
@ApiTags('customer-shipping')
@UsePipes(ZodValidationPipe)
export class SellerShippingController {
  constructor(
    private readonly sellerShippingService: SellerShippingService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get('price-table')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Bảng giá label công khai cho seller (USD theo mốc gram)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetSellerShipPriceTableResDto })
  async getPriceTable(): Promise<GetSellerShipPriceTableResDto> {
    const table = await this.sellerShippingService.getPriceTable();
    // enabled là chuyện nội bộ — seller chỉ cần bảng mốc giá; công tắc TẮT thì
    // trả null như chưa có bảng (nhất quán với quote/buy đang chặn service_unavailable).
    const visible = table && table.enabled !== false;
    return { success: true, data: visible ? { rows: table.rows, updatedAt: table.updatedAt } : null };
  }

  @Get('orders/:stagingId/quote')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Báo giá label cho 1 đơn — cân prefill + quy đổi + mốc + giá, chưa trừ tiền' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetSellerShipQuoteResDto })
  async quote(
    @Param('stagingId') stagingId: string,
    @Query() dto: GetSellerShipQuoteDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<GetSellerShipQuoteResDto> {
    return {
      success: true,
      data: await this.sellerShippingService.quote(customer, stagingId, dto.weightGram),
    };
  }

  @Post('orders/:stagingId/label')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Mua label — trừ ví TRƯỚC, VNP lỗi thì hoàn tự động; idempotent theo requestId' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: BuySellerLabelResDto })
  async buy(
    @Param('stagingId') stagingId: string,
    @Body() dto: BuySellerLabelDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<BuySellerLabelResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'POST',
        url: `/customer/shipping/orders/${stagingId}/label`,
        customerId: customer._id,
        requestId: dto.requestId,
      }),
    });
    return { success: true, data: await this.sellerShippingService.buy(customer, stagingId, dto) };
  }
}

import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Controller, Get, HttpCode, HttpStatus, Inject, Query, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  GetCustomerWalletResDto,
  GetCustomerWalletTxnsDto,
  GetCustomerWalletTxnsResDto,
  RoleType,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';
import type { CustomerDocument } from '@/modules/customer/customer.entity';

import { CustomerWalletService } from './customer-wallet.service';

/**
 * Ví seller — phía SELLER chỉ ĐỌC (số dư + sổ cái before/after). Nạp/điều
 * chỉnh là việc của admin (`customer-wallet-admin.controller.ts`); trừ tiền
 * mua label đi qua `seller-shipping`. Prefix `customer/` bắt buộc (RolesGuard).
 */
@Controller('customer/wallet')
@ApiTags('customer-wallet')
@UsePipes(ZodValidationPipe)
export class CustomerWalletController {
  constructor(
    private readonly walletService: CustomerWalletService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Số dư ví + hạn mức nợ của seller đang đăng nhập' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerWalletResDto })
  async getWallet(@AuthUser() customer: CustomerDocument): Promise<GetCustomerWalletResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/customer/wallet', customerId: customer._id }),
    });
    return { success: true, data: await this.walletService.getWallet(String(customer._id)) };
  }

  @Get('transactions')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Sổ cái ví của seller — mỗi record có balanceBefore → balanceAfter' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerWalletTxnsResDto })
  async listTransactions(
    @Query() dto: GetCustomerWalletTxnsDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<GetCustomerWalletTxnsResDto> {
    return { success: true, ...(await this.walletService.listTransactions(String(customer._id), dto)) };
  }
}

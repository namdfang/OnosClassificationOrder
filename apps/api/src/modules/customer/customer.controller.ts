import { AuthUser } from 'core';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Logger } from 'winston';
import {
  CreateCustomerDto,
  CreateCustomerResDto,
  GetCustomersDto,
  GetCustomersResDto,
  RoleType,
  SyncCustomersResDto,
} from 'shared';

import { Auth } from '@/decorators';
import { UserDocument } from '../user/user.entity';
import { CustomerService } from './customer.service';

@Controller('customers')
@ApiTags('customers')
@UsePipes(ZodValidationPipe)
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Danh sách khách hàng (để chọn gán xưởng)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomersResDto })
  async list(@Query() dto: GetCustomersDto, @AuthUser() user: UserDocument): Promise<GetCustomersResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'GET', url: '/customers', userId: user?._id }) });
    return this.customerService.list(dto);
  }

  @Post()
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Thêm khách hàng thủ công (userSku + userEmail)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateCustomerResDto })
  async create(@Body() dto: CreateCustomerDto, @AuthUser() user: UserDocument): Promise<CreateCustomerResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'POST', url: '/customers', userId: user?._id }) });
    return { success: true, data: await this.customerService.create(dto) };
  }

  @Post('sync')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Sync khách hàng từ orders (distinct userSku + userEmail)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SyncCustomersResDto })
  async sync(@AuthUser() user: UserDocument): Promise<SyncCustomersResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'POST', url: '/customers/sync', userId: user?._id }) });
    return this.customerService.sync();
  }
}

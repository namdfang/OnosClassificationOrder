import { ZodValidationPipe } from '@anatine/zod-nestjs';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CreateCustomerDto,
  CreateCustomerResDto,
  DeleteCustomerResDto,
  GetCustomersDto,
  GetCustomersResDto,
  ImportCustomerTiersDto,
  ImportCustomerTiersResDto,
  ResetCustomerPasswordDto,
  ResetCustomerPasswordResDto,
  RestoreCustomerResDto,
  RoleType,
  SyncCustomersResDto,
  UpdateCustomerDto,
  UpdateCustomerResDto,
  UpdateCustomerStatusDto,
  UpdateCustomerStatusResDto,
  UpdateCustomerTierDto,
  UpdateCustomerTierResDto,
} from 'shared';
import { Logger } from 'winston';

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

  @Patch(':id/tier')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Sửa tier 1 khách hàng (VIP 0..5, null = khách lẻ)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateCustomerTierResDto })
  async updateTier(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerTierDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateCustomerTierResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'PATCH', url: `/customers/${id}/tier`, userId: user?._id }),
    });
    return { success: true, data: await this.customerService.updateTier(id, dto) };
  }

  @Post('import-tiers')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Import tier hàng loạt (khớp userSku, không tự tạo khách)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ImportCustomerTiersResDto })
  async importTiers(
    @Body() dto: ImportCustomerTiersDto,
    @AuthUser() user: UserDocument,
  ): Promise<ImportCustomerTiersResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/customers/import-tiers', userId: user?._id }),
    });
    return this.customerService.importTiers(dto);
  }

  @Patch(':id')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Sửa thông tin khách (fullName/phone/tier — userSku/userEmail khóa hẳn)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateCustomerResDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateCustomerResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'PATCH', url: `/customers/${id}`, userId: user?._id }) });
    return { success: true, data: await this.customerService.update(id, dto) };
  }

  @Post(':id/reset-password')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Reset mật khẩu khách — Admin tự đặt hoặc generate random (trả plain 1 lần)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResetCustomerPasswordResDto })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetCustomerPasswordDto,
    @AuthUser() user: UserDocument,
  ): Promise<ResetCustomerPasswordResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: `/customers/${id}/reset-password`, userId: user?._id }),
    });
    return { success: true, data: await this.customerService.resetPassword(id, dto) };
  }

  @Patch(':id/status')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Khóa / mở tài khoản khách (Inactive chặn đăng nhập ngay)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateCustomerStatusResDto })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerStatusDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateCustomerStatusResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'PATCH', url: `/customers/${id}/status`, userId: user?._id }),
    });
    return { success: true, data: await this.customerService.updateStatus(id, dto) };
  }

  @Delete(':id')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Xóa mềm khách — tự gỡ khỏi config gán xưởng/ưu tiên/designer' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeleteCustomerResDto })
  async softDelete(@Param('id') id: string, @AuthUser() user: UserDocument): Promise<DeleteCustomerResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'DELETE', url: `/customers/${id}`, userId: user?._id }) });
    return { success: true, data: await this.customerService.softDelete(id) };
  }

  @Post(':id/restore')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Khôi phục khách đã xóa mềm (config không tự gán lại)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RestoreCustomerResDto })
  async restore(@Param('id') id: string, @AuthUser() user: UserDocument): Promise<RestoreCustomerResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: `/customers/${id}/restore`, userId: user?._id }),
    });
    return { success: true, data: await this.customerService.restore(id) };
  }
}

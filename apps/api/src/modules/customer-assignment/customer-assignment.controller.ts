import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Put, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  GetCustomerAssignmentConfigResDto,
  GetCustomerPriorityConfigResDto,
  RoleType,
  SaveCustomerAssignmentConfigDto,
  SaveCustomerAssignmentConfigResDto,
  SaveCustomerPriorityConfigDto,
  SaveCustomerPriorityConfigResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { CustomerAssignmentService } from './customer-assignment.service';

@Controller('customer-assignment')
@ApiTags('customer-assignment')
@UsePipes(ZodValidationPipe)
export class CustomerAssignmentController {
  constructor(
    private readonly customerAssignmentService: CustomerAssignmentService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get('config')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Lấy cấu hình ưu tiên gán xưởng theo khách hàng' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerAssignmentConfigResDto })
  async getConfig(@AuthUser() user: UserDocument): Promise<GetCustomerAssignmentConfigResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/customer-assignment/config', userId: user?._id }),
    });
    return { success: true, data: await this.customerAssignmentService.getConfig() };
  }

  @Put('config')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Lưu cấu hình ưu tiên gán xưởng theo khách hàng' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SaveCustomerAssignmentConfigResDto })
  async saveConfig(
    @Body() dto: SaveCustomerAssignmentConfigDto,
    @AuthUser() user: UserDocument,
  ): Promise<SaveCustomerAssignmentConfigResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'PUT', url: '/customer-assignment/config', userId: user?._id }),
    });
    return { success: true, data: await this.customerAssignmentService.saveConfig(dto) };
  }

  @Get('priority-config')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Lấy cấu hình ưu tiên đơn theo khách hàng' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerPriorityConfigResDto })
  async getPriorityConfig(@AuthUser() user: UserDocument): Promise<GetCustomerPriorityConfigResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/customer-assignment/priority-config', userId: user?._id }),
    });
    return { success: true, data: await this.customerAssignmentService.getPriorityConfig() };
  }

  @Put('priority-config')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Lưu cấu hình ưu tiên đơn theo khách hàng' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SaveCustomerPriorityConfigResDto })
  async savePriorityConfig(
    @Body() dto: SaveCustomerPriorityConfigDto,
    @AuthUser() user: UserDocument,
  ): Promise<SaveCustomerPriorityConfigResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'PUT', url: '/customer-assignment/priority-config', userId: user?._id }),
    });
    return { success: true, data: await this.customerAssignmentService.savePriorityConfig(dto) };
  }
}

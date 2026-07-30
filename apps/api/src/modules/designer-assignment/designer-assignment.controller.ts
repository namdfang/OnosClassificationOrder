import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Put, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  GetDesignerAssignmentConfigResDto,
  RememberProductAssignmentDto,
  RoleType,
  SaveDesignerAssignmentConfigDto,
  SaveDesignerAssignmentConfigResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { DesignerAssignmentService } from './designer-assignment.service';

@Controller('designer-assignment')
@ApiTags('designer-assignment')
@UsePipes(ZodValidationPipe)
export class DesignerAssignmentController {
  constructor(
    private readonly designerAssignmentService: DesignerAssignmentService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get('config')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Lấy cấu hình auto-gán designer theo xưởng' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetDesignerAssignmentConfigResDto })
  async getConfig(@AuthUser() user: UserDocument): Promise<GetDesignerAssignmentConfigResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/designer-assignment/config', userId: user?._id }),
    });
    return { success: true, data: await this.designerAssignmentService.getConfig() };
  }

  @Put('config')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Lưu cấu hình auto-gán designer theo xưởng' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SaveDesignerAssignmentConfigResDto })
  async saveConfig(
    @Body() dto: SaveDesignerAssignmentConfigDto,
    @AuthUser() user: UserDocument,
  ): Promise<SaveDesignerAssignmentConfigResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'PUT', url: '/designer-assignment/config', userId: user?._id }),
    });
    return { success: true, data: await this.designerAssignmentService.saveConfig(dto) };
  }

  @Post('remember-products')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Ghi nhớ sản phẩm → designer (Ưu tiên 2) kèm hạn hiệu lực, từ bảng "Cần gán designer"' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SaveDesignerAssignmentConfigResDto })
  async rememberProducts(
    @Body() dto: RememberProductAssignmentDto,
    @AuthUser() user: UserDocument,
  ): Promise<SaveDesignerAssignmentConfigResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/designer-assignment/remember-products', userId: user?._id }),
    });
    return { success: true, data: await this.designerAssignmentService.rememberProducts(dto) };
  }
}

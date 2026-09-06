import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateFactoryDto,
  CreateFactoryResDto,
  GetFactoriesDto,
  GetFactoriesResDto,
  GetFactoryOptionsResDto,
  RoleType,
  UpdateFactoryDto,
  UpdateFactoryResDto,
} from 'shared';

import { Auth } from '@/decorators';

import { FactoryService } from './factory.service';

@Controller('factories')
@ApiTags('factories')
export class FactoryController {
  constructor(private readonly factoryService: FactoryService) {}

  @Get()
  // AUTH-6 - Support DOC duoc (trang /adm/products). Route GHI ben duoi GIU NGUYEN
  // Admin+Manager: chan o lop API, khong phu thuoc viec giao dien co an nut hay khong.
  @Auth([RoleType.Admin, RoleType.Manager, RoleType.Support])
  @ApiOperation({ summary: 'Get factories' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetFactoriesResDto })
  async getFactories(@Query() dto: GetFactoriesDto): Promise<GetFactoriesResDto> {
    return this.factoryService.getFactories(dto);
  }

  /**
   * Danh sách xưởng rút gọn cho sidebar "cụm menu theo xưởng" + các select
   * xưởng ở trang mà Fulfillment/Designer cũng vào được. `@Auth([])` = mọi
   * tài khoản nhân viên đã đăng nhập (RolesGuard vẫn chặn role Customer).
   * KHÔNG nới quyền của `GET /factories` bên trên — route đó là CRUD.
   */
  @Get('options')
  @Auth([])
  @ApiOperation({ summary: 'Get factory options (all staff)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetFactoryOptionsResDto })
  async getFactoryOptions(): Promise<GetFactoryOptionsResDto> {
    return this.factoryService.getFactoryOptions();
  }

  @Post()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Create factory' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateFactoryResDto })
  async createFactory(@Body() dto: CreateFactoryDto): Promise<CreateFactoryResDto> {
    return { success: true, data: await this.factoryService.createFactory(dto) };
  }

  @Patch(':id')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Update factory' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateFactoryResDto })
  async updateFactory(@Param('id') id: string, @Body() dto: UpdateFactoryDto): Promise<UpdateFactoryResDto> {
    return { success: true, data: await this.factoryService.updateFactory(id, dto) };
  }
}

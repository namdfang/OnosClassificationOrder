import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateFactoryDto,
  CreateFactoryResDto,
  GetFactoriesDto,
  GetFactoriesResDto,
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
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Get factories' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetFactoriesResDto })
  async getFactories(@Query() dto: GetFactoriesDto): Promise<GetFactoriesResDto> {
    return this.factoryService.getFactories(dto);
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

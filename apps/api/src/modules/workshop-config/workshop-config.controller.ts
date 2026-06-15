import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateWorkshopConfigDto,
  CreateWorkshopConfigResDto,
  DeleteWorkshopConfigResDto,
  GetAllWorkshopConfigsResDto,
  GetWorkshopConfigsDto,
  GetWorkshopConfigsResDto,
  ReorderWorkshopConfigDto,
  ReorderWorkshopConfigResDto,
  RoleType,
  UpdateWorkshopConfigDto,
  UpdateWorkshopConfigResDto,
} from 'shared';

import { Auth } from '@/decorators';

import { WorkshopConfigService } from './workshop-config.service';

@Controller('workshop-config')
@ApiTags('workshop-config')
export class WorkshopConfigController {
  constructor(private readonly service: WorkshopConfigService) {}

  @Post('dedupe')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Remove duplicate (category,code) rows, keep oldest' })
  @HttpCode(HttpStatus.OK)
  async dedupe() {
    const data = await this.service.dedupe();
    return { success: true, data };
  }

  @Get('all')
  @Auth()
  @ApiOperation({ summary: 'Get all workshop configs grouped by category' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetAllWorkshopConfigsResDto })
  async getAll(): Promise<GetAllWorkshopConfigsResDto> {
    const data = await this.service.getAll();
    return { success: true, data };
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'List workshop configs' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetWorkshopConfigsResDto })
  async list(@Query() dto: GetWorkshopConfigsDto): Promise<GetWorkshopConfigsResDto> {
    return this.service.list(dto);
  }

  @Post()
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Create workshop config' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateWorkshopConfigResDto })
  async create(@Body() dto: CreateWorkshopConfigDto): Promise<CreateWorkshopConfigResDto> {
    return { success: true, data: await this.service.create(dto) };
  }

  @Patch('reorder')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Reorder workshop configs in a category' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ReorderWorkshopConfigResDto })
  async reorder(@Body() dto: ReorderWorkshopConfigDto): Promise<ReorderWorkshopConfigResDto> {
    return this.service.reorder(dto);
  }

  @Patch(':id')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Update workshop config' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateWorkshopConfigResDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkshopConfigDto,
  ): Promise<UpdateWorkshopConfigResDto> {
    return { success: true, data: await this.service.update(id, dto) };
  }

  @Delete(':id')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Delete workshop config' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeleteWorkshopConfigResDto })
  async remove(@Param('id') id: string): Promise<DeleteWorkshopConfigResDto> {
    return this.service.remove(id);
  }
}

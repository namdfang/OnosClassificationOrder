import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CreateStageErrorDto,
  CreateStageErrorResDto,
  CreateWorkshopConfigDto,
  CreateWorkshopConfigResDto,
  DeleteWorkshopConfigResDto,
  GetAllWorkshopConfigsResDto,
  GetStageErrorsDto,
  GetStageErrorsResDto,
  GetWorkshopConfigsDto,
  GetWorkshopConfigsResDto,
  ReorderWorkshopConfigDto,
  ReorderWorkshopConfigResDto,
  ResDto,
  RoleType,
  UpdateStageErrorDto,
  UpdateStageErrorResDto,
  UpdateWorkshopConfigDto,
  UpdateWorkshopConfigResDto,
  WorkshopConfigCategory,
} from 'shared';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
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

  @Post('reset/:category')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Wipe a category and re-insert from seed' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async resetCategory(@Param('category') category: WorkshopConfigCategory): Promise<ResDto> {
    const data = await this.service.resetCategory(category);
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

  // ─── Stage Error Catalog (danh mục lỗi theo công đoạn — QR) ────────────────

  @Get('stage-errors')
  @Auth()
  @ApiOperation({ summary: 'List stage errors of one fulfillment stage (incl. inactive)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetStageErrorsResDto })
  async listStageErrors(@Query() dto: GetStageErrorsDto): Promise<GetStageErrorsResDto> {
    return { success: true, data: await this.service.listStageErrors(dto.stage) };
  }

  @Post('stage-errors')
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager, RoleType.Fulfillment])
  @ApiOperation({ summary: 'Create stage error (Fulfillment: own stage only, code auto-generated)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateStageErrorResDto })
  async createStageError(
    @Body() dto: CreateStageErrorDto,
    @AuthUser() user: UserDocument,
  ): Promise<CreateStageErrorResDto> {
    const data = await this.service.createStageError(dto, {
      roleName: user.role?.name as RoleType,
      fulfillmentStage: user.fulfillmentStage,
    });
    return { success: true, data };
  }

  @Patch('stage-errors/:id')
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager, RoleType.Fulfillment])
  @ApiOperation({ summary: 'Update stage error (name / reworkTarget / isActive)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateStageErrorResDto })
  async updateStageError(
    @Param('id') id: string,
    @Body() dto: UpdateStageErrorDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateStageErrorResDto> {
    const data = await this.service.updateStageError(id, dto, {
      roleName: user.role?.name as RoleType,
      fulfillmentStage: user.fulfillmentStage,
    });
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

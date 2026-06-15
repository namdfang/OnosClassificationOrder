import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateMachineTypeDto,
  CreateMachineTypeResDto,
  GetMachineTypesDto,
  GetMachineTypesResDto,
  RoleType,
  UpdateMachineTypeDto,
  UpdateMachineTypeResDto,
} from 'shared';

import { Auth } from '@/decorators';

import { MachineTypeService } from './machine-type.service';

@Controller('machine-types')
@ApiTags('machine-types')
export class MachineTypeController {
  constructor(private readonly machineTypeService: MachineTypeService) {}

  @Get()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Get machine types' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetMachineTypesResDto })
  async getMachineTypes(@Query() dto: GetMachineTypesDto): Promise<GetMachineTypesResDto> {
    return this.machineTypeService.getMachineTypes(dto);
  }

  @Post()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Create machine type' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateMachineTypeResDto })
  async createMachineType(@Body() dto: CreateMachineTypeDto): Promise<CreateMachineTypeResDto> {
    return { success: true, data: await this.machineTypeService.createMachineType(dto) };
  }

  @Patch(':id')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Update machine type' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateMachineTypeResDto })
  async updateMachineType(@Param('id') id: string, @Body() dto: UpdateMachineTypeDto): Promise<UpdateMachineTypeResDto> {
    return { success: true, data: await this.machineTypeService.updateMachineType(id, dto) };
  }
}

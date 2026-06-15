import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CreateRoleDto,
  CreateRoleResDto,
  GetRolesDto,
  GetRolesResDto,
  ResDto,
  RoleType,
  UpdateRoleDto,
  UpdateRolePermissionsDto,
  UpdateRolePermissionsResDto,
  UpdateRoleResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { RoleService } from './role.service';

const ADMIN_ROLES = [RoleType.SuperAdmin, RoleType.Admin];

@Controller('roles')
@ApiTags('roles')
export class RoleController {
  constructor(
    private readonly roleService: RoleService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager, RoleType.Accountant])
  @ApiOperation({ summary: 'Get roles' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetRolesResDto })
  async getRoles(@Query() getRolesDto: GetRolesDto, @AuthUser() user: UserDocument): Promise<GetRolesResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'GET', url: '/roles', userId: user._id }) });
    return { success: true, ...(await this.roleService.getRoles(getRolesDto)) };
  }

  @Post()
  @Auth(ADMIN_ROLES)
  @ApiOperation({ summary: 'Create role' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateRoleResDto })
  async createRole(@Body() createRoleDto: CreateRoleDto, @AuthUser() user: UserDocument): Promise<CreateRoleResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'POST', url: '/roles', body: createRoleDto, userId: user._id }) });
    return { success: true, data: await this.roleService.createRole(createRoleDto) };
  }

  @Patch(':roleId/permissions')
  @Auth(ADMIN_ROLES)
  @ApiOperation({ summary: 'Update role permission codes (Phase 5)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateRolePermissionsResDto })
  async updatePermissions(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateRolePermissionsResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'PATCH', url: `/roles/${roleId}/permissions`, body: dto, userId: user._id }) });
    return { success: true, data: await this.roleService.updatePermissions(roleId, dto) };
  }

  @Post(':roleId/reset-permissions')
  @Auth(ADMIN_ROLES)
  @ApiOperation({ summary: 'Reset a system role to its default preset' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateRolePermissionsResDto })
  async resetPermissions(
    @Param('roleId') roleId: string,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateRolePermissionsResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'POST', url: `/roles/${roleId}/reset-permissions`, userId: user._id }) });
    return { success: true, data: await this.roleService.resetPermissions(roleId) };
  }

  @Patch(':roleId')
  @Auth(ADMIN_ROLES)
  @ApiOperation({ summary: 'Update role' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateRoleResDto })
  async updateRole(
    @Param('roleId') roleId: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateRoleResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'PATCH', url: `/roles/${roleId}`, body: updateRoleDto, userId: user._id }) });
    return { success: true, data: await this.roleService.updateRole(roleId, updateRoleDto) };
  }

  @Delete(':roleId')
  @Auth(ADMIN_ROLES)
  @ApiOperation({ summary: 'Soft-delete a non-system role' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async deleteRole(@Param('roleId') roleId: string, @AuthUser() user: UserDocument): Promise<ResDto> {
    this.logger.info({ message: JSON.stringify({ method: 'DELETE', url: `/roles/${roleId}`, userId: user._id }) });
    await this.roleService.deleteRole(roleId);
    return { success: true };
  }
}

import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CreatePermissionDto,
  CreatePermissionResDto,
  GetPermissionsResDto,
  RoleType,
  UpdatePermissionDto,
  UpdatePermissionResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { PermissionService } from './permission.service';

@Controller('permissions')
@ApiTags('permissions')
export class PermissionController {
  constructor(
    @Inject('winston') private readonly logger: Logger,
    private readonly permissionService: PermissionService,
  ) {}

  @Get()
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Get permissions',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: GetPermissionsResDto,
  })
  async getPermissions(@AuthUser() user: UserDocument): Promise<GetPermissionsResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'getPermissions',
        method: 'GET',
        url: '/permissions',
        message: 'Get permissions',
        userId: user._id,
      }),
    });

    return { success: true, data: await this.permissionService.getAllPermissions() };
  }

  @Post()
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Create new permission',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: CreatePermissionResDto,
  })
  async createPermission(
    @Body() createPermissionDto: CreatePermissionDto,
    @AuthUser() user: UserDocument,
  ): Promise<CreatePermissionResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'createPermission',
        method: 'POST',
        url: '/permissions',
        message: 'Create new permission',
        userId: user._id,
        body: createPermissionDto,
      }),
    });

    return {
      success: true,
      data: await this.permissionService.createPermission(createPermissionDto),
    };
  }

  @Patch(':permId')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Update permission',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: UpdatePermissionResDto,
  })
  async updatePermission(
    @Param('permId') permissionId: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdatePermissionResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'updatePermission',
        method: 'PATCH',
        url: `/permissions`,
        message: 'Update permission',
        userId: user._id,
        body: updatePermissionDto,
        params: {
          permissionId,
        },
      }),
    });

    const permission = await this.permissionService.updatePermission(permissionId, updatePermissionDto);

    return {
      success: true,
      data: permission,
    };
  }
}

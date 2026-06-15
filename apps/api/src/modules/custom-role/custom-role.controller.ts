import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CreateCustomRoleDto,
  CreateCustomRoleResDto,
  GetCustomRolesDto,
  GetCustomRolesResDto,
  RoleType,
  UpdateCustomRoleDto,
  UpdateCustomRoleResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { CustomRoleService } from './custom-role.service';

@Controller('customRoles')
@ApiTags('customRoles')
export class CustomRoleController {
  constructor(
    private readonly customRoleService: CustomRoleService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  @Auth([RoleType.Admin, RoleType.Accountant])
  @ApiOperation({
    summary: 'Get customRoles',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: GetCustomRolesResDto,
  })
  async getCustomRoles(
    @Query() getCustomRolesDto: GetCustomRolesDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetCustomRolesResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'getCustomRoles',
        method: 'GET',
        url: '/customRoles',
        message: 'Get customRoles',
        userId: user._id,
      }),
    });

    return {
      success: true,
      ...(await this.customRoleService.getCustomRoles(getCustomRolesDto)),
    };
  }

  @Post()
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Create customRole',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: CreateCustomRoleResDto,
  })
  async createCustomRole(
    @Body() createCustomRoleDto: CreateCustomRoleDto,
    @AuthUser() user: UserDocument,
  ): Promise<CreateCustomRoleResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'createCustomRole',
        method: 'POST',
        url: '/customRoles',
        message: 'Create customRole',
        body: createCustomRoleDto,
        userId: user._id,
      }),
    });

    return { success: true, data: await this.customRoleService.createCustomRole(createCustomRoleDto) };
  }

  @Patch(':customRoleId')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Update customRole',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: UpdateCustomRoleResDto,
  })
  async updateCustomRole(
    @Param('customRoleId') customRoleId: string,
    @Body() updateCustomRoleDto: UpdateCustomRoleDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateCustomRoleResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'updateCustomRole',
        method: 'PATCH',
        url: `/customRoles/${customRoleId}`,
        message: 'Update customRole',
        body: updateCustomRoleDto,
        params: {
          customRoleId,
        },
        userId: user._id,
      }),
    });

    return { success: true, data: await this.customRoleService.updateCustomRole(customRoleId, updateCustomRoleDto) };
  }
}

import { Controller, Get, HttpCode, HttpStatus, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import { GetActionsDto, GetActionsResDto, RoleType } from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { ActionRepository } from './action.repository';
import { ActionService } from './action.service';

@Controller('actions')
@ApiTags('actions')
export class ActionController {
  constructor(
    private readonly actionService: ActionService,
    private readonly actionRepository: ActionRepository,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  @Auth([RoleType.Admin, RoleType.Seller])
  @ApiOperation({
    summary: 'Get actions',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: GetActionsResDto,
  })
  async getActions(
    @Query()
    getActionsDto: GetActionsDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetActionsResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'getActions',
        method: 'GET',
        url: '/actions',
        message: 'Get actions',
        userId: user._id,
        query: getActionsDto,
      }),
    });

    return { success: true, ...(await this.actionService.getActions(getActionsDto, user)) };
  }
}

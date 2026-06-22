import { ZodValidationPipe } from '@anatine/zod-nestjs';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  DesignerBulkTransitionDto,
  DesignerBulkTransitionResDto,
  DesignerTransitionDto,
  DesignerTransitionResDto,
  GetMyStatsDto,
  GetMyStatsResDto,
  GetMyTaskFiltersResDto,
  GetMyTasksDto,
  GetMyTasksResDto,
  RoleType,
} from 'shared';
import { Logger } from 'winston';

import { Auth, ClientIp, UserAgent } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { DesignerTaskService } from './designer-task.service';

@Controller()
@ApiTags('designer')
@UsePipes(ZodValidationPipe)
export class DesignerTaskController {
  constructor(
    private readonly taskService: DesignerTaskService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post('orders/:id/designer-transition')
  @Auth([
    RoleType.SuperAdmin,
    RoleType.Admin,
    RoleType.Manager,
    RoleType.DesignerLeader,
    RoleType.Designer,
  ])
  @ApiOperation({
    summary:
      'Trigger designer state-machine transition. Sub-designer chỉ transition task của mình; Leader/Admin override.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DesignerTransitionResDto })
  async transition(
    @Param('id') id: string,
    @Body() dto: DesignerTransitionDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<DesignerTransitionResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'POST',
        url: `/orders/${id}/designer-transition`,
        userId: user._id,
        action: dto.action,
      }),
    });
    const data = await this.taskService.transition(id, user, dto.action, dto.reason, {
      user,
      ip,
      userAgent,
    });
    return { success: true, data };
  }

  @Get('designer/my-tasks')
  @Auth([RoleType.Designer, RoleType.DesignerLeader, RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Kanban data của sub-designer hiện tại (4 cột + rejected drawer)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetMyTasksResDto })
  async getMyTasks(
    @Query() query: GetMyTasksDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetMyTasksResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/designer/my-tasks', userId: user._id }),
    });
    const data = await this.taskService.getMyTasks(user, query);
    return { success: true, data };
  }

  @Get('designer/my-task-filters')
  @Auth([RoleType.Designer, RoleType.DesignerLeader, RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Faceted filter options cho /my-tasks page' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetMyTaskFiltersResDto })
  async getMyTaskFilters(
    @Query() query: GetMyTasksDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetMyTaskFiltersResDto> {
    const data = await this.taskService.getMyTaskFilters(user, query);
    return { success: true, data };
  }

  @Post('designer/bulk-transition')
  @Auth([RoleType.Designer, RoleType.DesignerLeader, RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({
    summary:
      'Bulk transition N task của sub-designer hiện tại. Skip task không hợp lệ + report.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DesignerBulkTransitionResDto })
  async bulkTransition(
    @Body() dto: DesignerBulkTransitionDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<DesignerBulkTransitionResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'POST',
        url: '/designer/bulk-transition',
        userId: user._id,
        action: dto.action,
        count: dto.ids.length,
      }),
    });
    const data = await this.taskService.bulkTransition(user, dto.ids, dto.action, dto.reason, {
      user,
      ip,
      userAgent,
    });
    return { success: true, data };
  }

  @Get('designer/my-stats')
  @Auth([RoleType.Designer, RoleType.DesignerLeader, RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'KPI cá nhân (today/7d/30d/custom)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetMyStatsResDto })
  async getMyStats(
    @Query() query: GetMyStatsDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetMyStatsResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/designer/my-stats', userId: user._id }),
    });
    const data = await this.taskService.getMyStats(user, query.period, query.from, query.to);
    return { success: true, data };
  }
}

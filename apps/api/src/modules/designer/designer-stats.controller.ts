import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  GetDesignerPerformanceDto,
  GetDesignerPerformanceResDto,
  GetDesignerTimelineDto,
  GetDesignerTimelineResDto,
  GetErrorStatsDto,
  GetErrorStatsResDto,
  GetTeamDailyBreakdownDto,
  GetTeamDailyBreakdownResDto,
  RoleType,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { DesignerStatsService } from './designer-stats.service';

const LEADER_ROLES = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.DesignerLeader,
];

@Controller()
@ApiTags('designer')
@UsePipes(ZodValidationPipe)
export class DesignerStatsController {
  constructor(
    private readonly statsService: DesignerStatsService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get('designer/performance')
  @Auth(LEADER_ROLES)
  @ApiOperation({ summary: 'Leaderboard per-designer trong period (count + avg + errorRate)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetDesignerPerformanceResDto })
  async getPerformance(
    @Query() query: GetDesignerPerformanceDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetDesignerPerformanceResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/designer/performance', userId: user._id }),
    });
    const data = await this.statsService.getPerformance(query.from, query.to, query.userId);
    return { success: true, data };
  }

  @Get('designer/timeline/:userId')
  @Auth(LEADER_ROLES)
  @ApiOperation({ summary: 'Per-day buckets (4 series) cho line chart timeline của 1 designer' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetDesignerTimelineResDto })
  async getTimeline(
    @Param('userId') userId: string,
    @Query() query: GetDesignerTimelineDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetDesignerTimelineResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'GET',
        url: `/designer/timeline/${userId}`,
        userId: user._id,
      }),
    });
    const data = await this.statsService.getTimeline(userId, query.from, query.to);
    return { success: true, data };
  }

  @Get('designer/team-daily-breakdown')
  @Auth(LEADER_ROLES)
  @ApiOperation({
    summary:
      'Ma trận Designer × Ngày (inProductionAt, 7/14/30) — MỌI designer theo trạng thái, focus đơn chưa xong.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetTeamDailyBreakdownResDto })
  async getTeamDailyBreakdown(
    @Query() query: GetTeamDailyBreakdownDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetTeamDailyBreakdownResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'GET',
        url: '/designer/team-daily-breakdown',
        userId: user._id,
        days: query.days,
      }),
    });
    const data = await this.statsService.getTeamDailyBreakdown(
      Number(query.days),
      query.from,
      query.to,
    );
    return { success: true, data };
  }

  @Get('orders/error-stats')
  @Auth(LEADER_ROLES)
  @ApiOperation({
    summary: 'Production error split by errorSource (designer vs factory) + breakdown per code',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetErrorStatsResDto })
  async getErrorStats(
    @Query() query: GetErrorStatsDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetErrorStatsResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/orders/error-stats', userId: user._id }),
    });
    const data = await this.statsService.getErrorStats(query.from, query.to);
    return { success: true, data };
  }
}

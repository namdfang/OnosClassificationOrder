import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  GetDesignerPerformanceDto,
  GetDesignerPerformanceResDto,
  GetDesignerTimelineDto,
  GetDesignerTimelineResDto,
  GetAssignBacklogDto,
  GetAssignBacklogResDto,
  GetBreakdownFiltersResDto,
  GetDailyOverviewDto,
  GetDailyOverviewResDto,
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

// Bao gồm cả Designer (sub) để sub-designer cũng xem được tab Dashboard
// Designer (thống kê toàn team) — gate FE qua perm `page.designer_stats`.
const LEADER_ROLES = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.DesignerLeader,
  RoleType.Designer,
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
      query.type,
      query.customer,
    );
    return { success: true, data };
  }

  @Get('designer/breakdown-filters')
  @Auth(LEADER_ROLES)
  @ApiOperation({
    summary: 'Option list cho 2 dropdown filter (sản phẩm + khách hàng) của tab Designer.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetBreakdownFiltersResDto })
  async getBreakdownFilters(
    @AuthUser() user: UserDocument,
  ): Promise<GetBreakdownFiltersResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/designer/breakdown-filters', userId: user._id }),
    });
    const data = await this.statsService.getBreakdownFilters();
    return { success: true, data };
  }

  @Get('designer/daily-overview')
  @Auth(LEADER_ROLES)
  @ApiOperation({
    summary: 'Bảng tổng quan N ngày: tổng đơn / chưa soát / lỗi (+breakdown note) / tồn (+per-designer).',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetDailyOverviewResDto })
  async getDailyOverview(
    @Query() query: GetDailyOverviewDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetDailyOverviewResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'GET',
        url: '/designer/daily-overview',
        userId: user._id,
        days: query.days,
      }),
    });
    const data = await this.statsService.getDailyOverview(
      Number(query.days),
      query.type,
      query.customer,
      query.from,
      query.to,
    );
    return { success: true, data };
  }

  @Get('designer/assign-backlog')
  @Auth(LEADER_ROLES)
  @ApiOperation({
    summary: 'Đơn cần gán designer (unassigned/rejected/rework-chưa-ôm, note ≠ ok) gom theo sản phẩm.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetAssignBacklogResDto })
  async getAssignBacklog(
    @Query() query: GetAssignBacklogDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetAssignBacklogResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'GET',
        url: '/designer/assign-backlog',
        userId: user._id,
        days: query.days,
      }),
    });
    const data = await this.statsService.getAssignBacklog(
      Number(query.days),
      query.type,
      query.customer,
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

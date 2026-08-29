import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import type {
  GetZaloGroupLinksResDto,
  GetZaloGroupSuggestionsResDto,
  GetZaloSummariesResDto,
  GetZaloSummaryQueueResDto,
  SummarizeZaloGroupResDto,
  SyncZaloGroupsResDto,
  UpdateZaloGroupLinkResDto,
  ZaloGroupCoverageResDto,
} from 'shared';
import {
  GetZaloGroupLinksDto,
  GetZaloSummariesDto,
  RoleType,
  SummarizeZaloGroupDto,
  SyncZaloGroupsDto,
  ToggleZaloSummaryTaskDto,
  UpdateZaloGroupLinkDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators/http.decorator';

import type { UserDocument } from '../user/user.entity';
import { ZaloGroupService } from './zalo-group.service';
import { ZaloSummaryService } from './zalo-summary.service';

/** Xem danh sách nhóm + bảng phủ sóng. */
const ZALO_GROUP_VIEW_ROLES = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.SupportManager,
  RoleType.Support,
];

/** Gắn nhóm ↔ khách. Hẹp hơn xem: gắn sai là quy nhầm doanh thu sang khách khác. */
const ZALO_GROUP_EDIT_ROLES = [RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager];

@ApiTags('zalo-groups')
@Controller('zalo-groups')
export class ZaloGroupController {
  constructor(
    private readonly zaloGroupService: ZaloGroupService,
    private readonly zaloSummaryService: ZaloSummaryService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  @Auth(ZALO_GROUP_VIEW_ROLES)
  @ApiOperation({ summary: 'Danh sách nhóm Zalo đã đồng bộ (lọc theo phân loại / khách / chưa gắn)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetZaloGroupLinksDto })
  async getGroups(
    @Query() dto: GetZaloGroupLinksDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetZaloGroupLinksResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/zalo-groups', userId: user._id, query: dto }),
    });

    return { success: true, ...(await this.zaloGroupService.getGroups(dto)) } as GetZaloGroupLinksResDto;
  }

  @Get('coverage')
  @Auth(ZALO_GROUP_VIEW_ROLES)
  @ApiOperation({ summary: 'Bảng phủ sóng: còn bao nhiêu nhóm chưa xét, bao nhiêu khách chưa có nhóm' })
  @HttpCode(HttpStatus.OK)
  async getCoverage(@AuthUser() user: UserDocument): Promise<ZaloGroupCoverageResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/zalo-groups/coverage', userId: user._id }),
    });

    return { success: true, data: await this.zaloGroupService.getCoverage() };
  }

  @Get('suggestions')
  @Auth(ZALO_GROUP_EDIT_ROLES)
  @ApiOperation({ summary: 'Gợi ý ghép nhóm ↔ khách theo tên nhóm (chỉ gợi ý, người vẫn phải duyệt)' })
  @HttpCode(HttpStatus.OK)
  async getSuggestions(@AuthUser() user: UserDocument): Promise<GetZaloGroupSuggestionsResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/zalo-groups/suggestions', userId: user._id }),
    });

    return { success: true, data: await this.zaloGroupService.getSuggestions() };
  }

  @Post('sync')
  @Auth(ZALO_GROUP_EDIT_ROLES)
  @ApiOperation({ summary: 'Nạp nhóm từ engine Zalo (onosceo) — KHÔNG đụng tới phân loại/khách đã gắn' })
  @HttpCode(HttpStatus.OK)
  async syncGroups(
    @Body() dto: SyncZaloGroupsDto,
    @AuthUser() user: UserDocument,
  ): Promise<SyncZaloGroupsResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'POST',
        url: '/zalo-groups/sync',
        userId: user._id,
        groups: dto.groups?.length ?? 0,
      }),
    });

    return { success: true, data: await this.zaloGroupService.syncGroups(dto) };
  }

  @Patch(':id')
  @Auth(ZALO_GROUP_EDIT_ROLES)
  @ApiOperation({ summary: 'Gắn / gỡ khách, đổi phân loại, chỉ định người phụ trách cho một nhóm' })
  @HttpCode(HttpStatus.OK)
  async updateLink(
    @Param('id') id: string,
    @Body() dto: UpdateZaloGroupLinkDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateZaloGroupLinkResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'PATCH', url: `/zalo-groups/${id}`, userId: user._id, body: dto }),
    });

    return { success: true, data: await this.zaloGroupService.updateLink(id, dto, String(user._id)) } as UpdateZaloGroupLinkResDto;
  }

  // ─── Tóm tắt tình hình nhóm ──────────────────────────────────────

  @Get('summaries')
  @Auth(ZALO_GROUP_VIEW_ROLES)
  @ApiOperation({ summary: 'Bảng tóm tắt tình hình các nhóm (gấp lên đầu)' })
  @HttpCode(HttpStatus.OK)
  async getSummaries(
    @Query() dto: GetZaloSummariesDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetZaloSummariesResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/zalo-groups/summaries', userId: user._id, query: dto }),
    });

    return { success: true, ...(await this.zaloSummaryService.list(dto)) } as GetZaloSummariesResDto;
  }

  @Get('summary-queue')
  @Auth(ZALO_GROUP_EDIT_ROLES)
  @ApiOperation({ summary: 'Nhóm đang chờ tóm tắt + mốc tin cần lấy từ (cho script đồng bộ)' })
  @HttpCode(HttpStatus.OK)
  async getSummaryQueue(@AuthUser() user: UserDocument): Promise<GetZaloSummaryQueueResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/zalo-groups/summary-queue', userId: user._id }),
    });

    return { success: true, data: await this.zaloSummaryService.getQueue() };
  }

  @Post('summarize')
  @Auth(ZALO_GROUP_EDIT_ROLES)
  @ApiOperation({ summary: 'Tóm tắt một nhóm từ đoạn hội thoại được đẩy sang' })
  @HttpCode(HttpStatus.OK)
  async summarize(
    @Body() dto: SummarizeZaloGroupDto,
    @AuthUser() user: UserDocument,
  ): Promise<SummarizeZaloGroupResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'POST',
        url: '/zalo-groups/summarize',
        userId: user._id,
        groupGlobalId: dto.groupGlobalId,
        messages: dto.messages?.length ?? 0,
      }),
    });

    return { success: true, data: await this.zaloSummaryService.summarize(dto) } as SummarizeZaloGroupResDto;
  }

  @Patch('summaries/:groupGlobalId/task')
  @Auth(ZALO_GROUP_VIEW_ROLES)
  @ApiOperation({ summary: 'Tick / bỏ tick một việc trong danh sách của nhóm' })
  @HttpCode(HttpStatus.OK)
  async toggleTask(
    @Param('groupGlobalId') groupGlobalId: string,
    @Body() dto: ToggleZaloSummaryTaskDto,
    @AuthUser() user: UserDocument,
  ): Promise<SummarizeZaloGroupResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'PATCH',
        url: `/zalo-groups/summaries/${groupGlobalId}/task`,
        userId: user._id,
        body: dto,
      }),
    });

    return {
      success: true,
      data: await this.zaloSummaryService.toggleTask(groupGlobalId, dto.index, dto.xong),
    } as SummarizeZaloGroupResDto;
  }
}

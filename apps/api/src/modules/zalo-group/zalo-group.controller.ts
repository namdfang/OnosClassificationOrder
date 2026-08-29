import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import type {
  GetZaloGroupLinksResDto,
  GetZaloGroupSuggestionsResDto,
  SyncZaloGroupsResDto,
  UpdateZaloGroupLinkResDto,
  ZaloGroupCoverageResDto,
} from 'shared';
import { GetZaloGroupLinksDto, RoleType, SyncZaloGroupsDto, UpdateZaloGroupLinkDto } from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators/http.decorator';

import type { UserDocument } from '../user/user.entity';
import { ZaloGroupService } from './zalo-group.service';

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
}

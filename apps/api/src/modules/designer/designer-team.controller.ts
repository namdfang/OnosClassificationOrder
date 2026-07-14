import { ZodValidationPipe } from '@anatine/zod-nestjs';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CreateDesignerTeamMemberDto,
  CreateDesignerTeamMemberResDto,
  GetDesignerTeamDto,
  GetDesignerTeamResDto,
  ResDto,
  ResetDesignerPasswordDto,
  RoleType,
  UpdateDesignerTeamMemberDto,
  UpdateDesignerTeamMemberResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { DesignerTeamService } from './designer-team.service';

@Controller('designer/team')
@ApiTags('designer')
@UsePipes(ZodValidationPipe)
export class DesignerTeamController {
  constructor(
    private readonly teamService: DesignerTeamService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  // Designer (sub) cũng cần list này để chọn người nhận thay khi "báo không làm
  // được → bàn giao" (RejectModal). Chỉ mở GET read-only; create/update/delete
  // vẫn giới hạn Admin/Leader.
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager, RoleType.DesignerLeader, RoleType.Designer])
  @ApiOperation({ summary: 'List sub-designers + active/done task counts' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetDesignerTeamResDto })
  async list(
    @Query() query: GetDesignerTeamDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetDesignerTeamResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'GET', url: '/designer/team', userId: user._id }),
    });
    const data = await this.teamService.list(query.status);
    return { success: true, data, total: data.length };
  }

  @Post()
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.DesignerLeader])
  @ApiOperation({ summary: 'Create sub-designer (role=Designer + assigneeCode)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateDesignerTeamMemberResDto })
  async create(
    @Body() dto: CreateDesignerTeamMemberDto,
    @AuthUser() actor: UserDocument,
  ): Promise<CreateDesignerTeamMemberResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/designer/team', actorId: actor._id }),
    });
    const data = await this.teamService.create(dto);
    return { success: true, data };
  }

  @Patch(':userId')
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.DesignerLeader])
  @ApiOperation({ summary: 'Update sub-designer info (block reassign code if active tasks)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateDesignerTeamMemberResDto })
  async update(
    @Param('userId') userId: string,
    @Body() dto: UpdateDesignerTeamMemberDto,
    @AuthUser() actor: UserDocument,
  ): Promise<UpdateDesignerTeamMemberResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'PATCH', url: `/designer/team/${userId}`, actorId: actor._id }),
    });
    const data = await this.teamService.update(userId, dto);
    return { success: true, data };
  }

  @Post(':userId/reset-password')
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.DesignerLeader])
  @ApiOperation({ summary: 'Reset sub-designer password (force change next login)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async resetPassword(
    @Param('userId') userId: string,
    @Body() dto: ResetDesignerPasswordDto,
    @AuthUser() actor: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: `/designer/team/${userId}/reset-password`, actorId: actor._id }),
    });
    await this.teamService.resetPassword(userId, dto.password);
    return { success: true };
  }

  @Delete(':userId')
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.DesignerLeader])
  @ApiOperation({ summary: 'Soft delete sub-designer (block if active tasks)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async remove(@Param('userId') userId: string, @AuthUser() actor: UserDocument): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'DELETE', url: `/designer/team/${userId}`, actorId: actor._id }),
    });
    await this.teamService.remove(userId);
    return { success: true };
  }
}

import { Controller, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import { RoleType } from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import type { UserDocument } from '../user/user.entity';
import type { RunReportResult } from './scheduled-reports.service';
import { ScheduledReportsService } from './scheduled-reports.service';
import type { ReportKind } from './types';

const ADMIN_ROLES = [RoleType.SuperAdmin, RoleType.Admin];

@Controller('reports')
@ApiTags('reports')
export class ScheduledReportsController {
  constructor(
    private readonly service: ScheduledReportsService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post('run-now')
  @Auth(ADMIN_ROLES)
  @ApiOperation({
    summary: 'Gửi ngay 1 view báo cáo Telegram (Admin) — `view=daily|detail|designer|tool-check` + `factoryId` optional',
  })
  @HttpCode(HttpStatus.OK)
  async runNow(
    @AuthUser() user: UserDocument,
    @Query('view') view?: string,
    @Query('factoryId') factoryId?: string,
  ): Promise<{ success: true; data: RunReportResult }> {
    const kind: ReportKind = view === 'designer' || view === 'tool-check' || view === 'detail' ? view : 'daily';
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/reports/run-now', userId: user._id, view: kind, factoryId }),
    });

    return { success: true, data: await this.service.run(kind, factoryId || undefined) };
  }
}

import { BadRequestException, Controller, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import { RoleType } from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import type { UserDocument } from '../user/user.entity';
import { ScheduledReportsService } from './scheduled-reports.service';
import type { ReportSlot } from './types';

const ADMIN_ROLES = [RoleType.SuperAdmin, RoleType.Admin];
const VALID_SLOTS: ReportSlot[] = ['morning', 'noon', 'evening'];
const VALID_REPORTS = ['designer', 'factory', 'error', 'all'] as const;

@Controller('reports')
@ApiTags('reports')
export class ScheduledReportsController {
  constructor(
    private readonly service: ScheduledReportsService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post('run-now')
  @Auth(ADMIN_ROLES)
  @ApiOperation({ summary: 'Manual trigger scheduled reports (Admin debug)' })
  @HttpCode(HttpStatus.OK)
  async runNow(
    @AuthUser() user: UserDocument,
    @Query('slot') slot?: string,
    @Query('report') report?: string,
  ): Promise<{ success: true; data: { ran: string[]; skipped: string[]; slot: ReportSlot } }> {
    const resolvedSlot: ReportSlot | undefined = slot ? validateSlot(slot) : undefined;
    const reports = parseReports(report);

    this.logger.info({
      message: JSON.stringify({
        method: 'POST',
        url: '/reports/run-now',
        userId: user._id,
        slot: resolvedSlot,
        reports,
      }),
    });

    const result = await this.service.run({ slot: resolvedSlot, reports });

    return {
      success: true,
      data: {
        ran: result.ran,
        skipped: result.skipped,
        slot: resolvedSlot ?? inferSlotForResponse(new Date()),
      },
    };
  }
}

function validateSlot(slot: string): ReportSlot {
  if (!VALID_SLOTS.includes(slot as ReportSlot)) {
    throw new BadRequestException(`Invalid slot. Must be one of: ${VALID_SLOTS.join(', ')}`);
  }

  return slot as ReportSlot;
}

function parseReports(report?: string): Array<'designer' | 'factory' | 'error'> | undefined {
  if (!report || report === 'all') return undefined;
  if (!VALID_REPORTS.includes(report as (typeof VALID_REPORTS)[number])) {
    throw new BadRequestException(`Invalid report. Must be one of: ${VALID_REPORTS.join(', ')}`);
  }

  return [report as 'designer' | 'factory' | 'error'];
}

function inferSlotForResponse(now: Date): ReportSlot {
  const vnHour = (now.getUTCHours() + 7) % 24;
  if (vnHour < 7 || (vnHour === 7 && now.getUTCMinutes() < 30)) return 'morning';
  if (vnHour < 13) return 'noon';

  return 'evening';
}

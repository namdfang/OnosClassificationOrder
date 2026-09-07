import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CeoOverviewQueryDto, CeoOverviewResDto, CeoReportGenerateDto, CeoReportResDto, RoleType } from 'shared';

import { Auth } from '@/decorators';

import { CeoDashboardService } from './ceo-dashboard.service';
import { CeoReportService } from './ceo-report.service';

@ApiTags('ceo-dashboard')
@Controller('ceo')
export class CeoDashboardController {
  constructor(
    private readonly service: CeoDashboardService,
    private readonly reports: CeoReportService,
  ) {}

  @Get('overview')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'CEO Dashboard — 7 khối điều hành + kết luận theo luật, một phản hồi (CeoDashboard.md)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CeoOverviewResDto })
  async overview(@Query() q: CeoOverviewQueryDto): Promise<CeoOverviewResDto> {
    return { success: true, data: await this.service.getOverview(q.from, q.to) };
  }

  @Get('report')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Nhận định mới nhất của hệ thống cho kỳ (null nếu chưa có) + cờ đang sinh' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CeoReportResDto })
  async report(@Query() q: CeoOverviewQueryDto): Promise<CeoReportResDto> {
    return { success: true, data: { report: await this.reports.getLatest(q.from, q.to), generating: this.reports.isGenerating(q.from, q.to) } };
  }

  @Post('report/generate')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Khởi chạy sinh nhận định cho kỳ (chạy NỀN, trả về ngay; FE thăm dò GET /ceo/report tới khi generating=false)' })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOkResponse({ type: CeoReportResDto })
  async generate(@Body() body: CeoReportGenerateDto): Promise<CeoReportResDto> {
    if (!this.reports.isGenerating(body.from, body.to)) {
      // Không await: sinh mất 30–150s, vượt timeout HTTP thường. Lỗi đã được service ghi log.
      void this.reports.generate(body.from, body.to, 'manual').catch(() => undefined);
    }
    return { success: true, data: { report: await this.reports.getLatest(body.from, body.to), generating: true } };
  }
}

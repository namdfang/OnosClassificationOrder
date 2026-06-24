import { InjectQueue } from '@nestjs/bullmq';
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { RoleType } from 'shared';

import { Auth } from '@/decorators';

import {
  DESIGN_PREVIEW_QUEUE,
  DESIGN_THUMB_QUEUE,
  DesignImageJobData,
} from './design-image.processor';
import { DesignImageService } from './design-image.service';
import { R2DesignObjectRepository } from './r2-design-object.repository';

@Controller('design-image')
@ApiTags('design-image')
export class DesignImageController {
  constructor(
    private readonly imageService: DesignImageService,
    private readonly r2Repo: R2DesignObjectRepository,
    @InjectQueue(DESIGN_THUMB_QUEUE) private readonly thumbQueue: Queue<DesignImageJobData>,
    @InjectQueue(DESIGN_PREVIEW_QUEUE) private readonly previewQueue: Queue<DesignImageJobData>,
  ) {}

  @Get('stats')
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'R2 storage + queue stats' })
  @HttpCode(HttpStatus.OK)
  async getStats(): Promise<{
    success: true;
    data: {
      enabled: boolean;
      objectCount: number;
      totalSizeBytes: number;
      totalSizeMb: number;
      thumbQueue: { waiting: number; active: number; failed: number; completed: number };
      previewQueue: { waiting: number; active: number; failed: number; completed: number };
    };
  }> {
    const r2 = await this.r2Repo.getTotalStats();
    const [tw, ta, tf, tc, pw, pa, pf, pc] = await Promise.all([
      this.thumbQueue.getWaitingCount(),
      this.thumbQueue.getActiveCount(),
      this.thumbQueue.getFailedCount(),
      this.thumbQueue.getCompletedCount(),
      this.previewQueue.getWaitingCount(),
      this.previewQueue.getActiveCount(),
      this.previewQueue.getFailedCount(),
      this.previewQueue.getCompletedCount(),
    ]);
    return {
      success: true,
      data: {
        enabled: this.imageService.isEnabled(),
        objectCount: r2.objectCount,
        totalSizeBytes: r2.totalSizeBytes,
        totalSizeMb: Math.round((r2.totalSizeBytes / 1024 / 1024) * 100) / 100,
        thumbQueue: { waiting: tw, active: ta, failed: tf, completed: tc },
        previewQueue: { waiting: pw, active: pa, failed: pf, completed: pc },
      },
    };
  }

  @Post('drain-failed')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Retry all failed jobs on both queues' })
  @HttpCode(HttpStatus.OK)
  async retryFailed(): Promise<{ success: true; data: { retried: number } }> {
    let retried = 0;
    for (const q of [this.thumbQueue, this.previewQueue]) {
      const failed = await q.getFailed(0, 1000);
      for (const job of failed) {
        await job.retry();
        retried++;
      }
    }
    return { success: true, data: { retried } };
  }

  /**
   * On-demand preview — gọi khi user click thumb mở dialog mà preview chưa
   * sẵn sàng trên R2. BE check HEAD; nếu thiếu thì process inline (5-8s).
   */
  @Post('ensure-preview')
  @Auth([
    RoleType.SuperAdmin,
    RoleType.Admin,
    RoleType.Manager,
    RoleType.Support,
    RoleType.DesignerLeader,
    RoleType.Designer,
    RoleType.Fulfillment,
  ])
  @ApiOperation({ summary: 'Ensure design preview exists on R2 (block if needed)' })
  @HttpCode(HttpStatus.OK)
  async ensurePreview(
    @Body() body: { sourceUrl?: string },
  ): Promise<{ success: true; data: { url: string; cached: boolean } }> {
    // [R2-disabled] tạm thời trả thẳng sourceUrl, không upload R2.
    // Restore: bỏ block dưới + uncomment call processPreview.
    const sourceUrl = (body?.sourceUrl || '').trim();
    return { success: true, data: { url: sourceUrl, cached: false } };
    // const { url, cached } = await this.imageService.processPreview(sourceUrl);
    // return { success: true, data: { url, cached } };
  }
}

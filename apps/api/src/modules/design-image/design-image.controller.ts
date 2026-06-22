import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { RoleType } from 'shared';

import { Auth } from '@/decorators';

import { DESIGN_IMAGE_QUEUE, DesignImageJobData } from './design-image.processor';
import { DesignImageService } from './design-image.service';
import { R2DesignObjectRepository } from './r2-design-object.repository';

@Controller('design-image')
@ApiTags('design-image')
export class DesignImageController {
  constructor(
    private readonly imageService: DesignImageService,
    private readonly r2Repo: R2DesignObjectRepository,
    @InjectQueue(DESIGN_IMAGE_QUEUE) private readonly queue: Queue<DesignImageJobData>,
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
      queue: { waiting: number; active: number; failed: number; completed: number };
    };
  }> {
    const r2 = await this.r2Repo.getTotalStats();
    const [waiting, active, failed, completed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getFailedCount(),
      this.queue.getCompletedCount(),
    ]);
    return {
      success: true,
      data: {
        enabled: this.imageService.isEnabled(),
        objectCount: r2.objectCount,
        totalSizeBytes: r2.totalSizeBytes,
        totalSizeMb: Math.round((r2.totalSizeBytes / 1024 / 1024) * 100) / 100,
        queue: { waiting, active, failed, completed },
      },
    };
  }

  @Post('drain-failed')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Retry all failed jobs (cẩn thận: tăng load worker)' })
  @HttpCode(HttpStatus.OK)
  async retryFailed(): Promise<{ success: true; data: { retried: number } }> {
    const failed = await this.queue.getFailed(0, 1000);
    let retried = 0;
    for (const job of failed) {
      await job.retry();
      retried++;
    }
    return { success: true, data: { retried } };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Logger } from 'winston';

import { ApiConfigService } from '@/shared/services';

import { TelegramNotificationService } from '../telegram-notification/telegram-notification.service';
import { DesignerAggregator } from './aggregators/designer-aggregator';
import { ErrorAggregator } from './aggregators/error-aggregator';
import { FactoryAggregator } from './aggregators/factory-aggregator';
import { buildShiftPeriod } from './build-period';
import type { ReportSlot } from './types';

const TZ = 'Asia/Ho_Chi_Minh';

export type RunOptions = {
  slot?: ReportSlot;
  reports?: Array<'designer' | 'factory' | 'error'>;
};

@Injectable()
export class ScheduledReportsService {
  constructor(
    private readonly designerAgg: DesignerAggregator,
    private readonly factoryAgg: FactoryAggregator,
    private readonly errorAgg: ErrorAggregator,
    private readonly telegram: TelegramNotificationService,
    private readonly config: ApiConfigService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Cron('30 7 * * *', { name: 'scheduled-reports-morning', timeZone: TZ })
  async morningReport(): Promise<void> {
    await this.runAll('morning');
  }

  @Cron('0 13 * * *', { name: 'scheduled-reports-noon', timeZone: TZ })
  async noonReport(): Promise<void> {
    await this.runAll('noon');
  }

  @Cron('30 18 * * *', { name: 'scheduled-reports-evening', timeZone: TZ })
  async eveningReport(): Promise<void> {
    await this.runAll('evening');
  }

  async runAll(slot: ReportSlot): Promise<void> {
    if (!this.config.scheduledReports.enabled) {
      this.logger.info({ message: `[scheduled-reports] skipped (disabled): ${slot}` });

      return;
    }
    await this.run({ slot, reports: ['designer', 'factory', 'error'] });
  }

  async run(options: RunOptions): Promise<{ ran: string[]; skipped: string[] }> {
    const slot = options.slot ?? currentSlot(new Date());
    const period = buildShiftPeriod(new Date(), slot);
    const reports = options.reports ?? ['designer', 'factory', 'error'];
    const ran: string[] = [];
    const skipped: string[] = [];

    if (reports.includes('designer')) {
      const ok = await this.safe('designer', async () => {
        const data = await this.designerAgg.aggregate(period);
        await this.telegram.notifyDesignerReport({ period, data, generatedAt: new Date() });
      });
      ok ? ran.push('designer') : skipped.push('designer');
    }

    if (reports.includes('factory')) {
      const ok = await this.safe('factory', async () => {
        const data = await this.factoryAgg.aggregate(period);
        await this.telegram.notifyFactoryReport({ period, data, generatedAt: new Date() });
      });
      ok ? ran.push('factory') : skipped.push('factory');
    }

    if (reports.includes('error')) {
      const ok = await this.safe('error', async () => {
        const data = await this.errorAgg.aggregate(period);
        await this.telegram.notifyErrorReport({ period, data, generatedAt: new Date() });
      });
      ok ? ran.push('error') : skipped.push('error');
    }

    return { ran, skipped };
  }

  private async safe(name: string, fn: () => Promise<void>): Promise<boolean> {
    try {
      await fn();

      return true;
    } catch (error) {
      this.logger.info({
        message: `[scheduled-reports][WARN] ${name} failed`,
        error: error instanceof Error ? error.message : String(error),
      });

      return false;
    }
  }
}

function currentSlot(now: Date): ReportSlot {
  const vnHour = (now.getUTCHours() + 7) % 24;
  if (vnHour < 7 || (vnHour === 7 && now.getUTCMinutes() < 30)) return 'morning';
  if (vnHour < 13) return 'noon';

  return 'evening';
}

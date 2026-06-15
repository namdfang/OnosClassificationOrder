import type { OnModuleInit } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronTime } from 'cron';
import { Logger } from 'winston';

import { CronjobService } from './cronjob.service';

@Injectable()
export class CronjobRunnerService implements OnModuleInit {
  constructor(
    private readonly cronjobService: CronjobService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setTimeout(async () => {
      try {
        // this.stopCronjobs();
        await this.runActiveCronjobs();
      } catch (error) {
        this.logger.info(`Cronjob Error ${(error as Error).message}`);
      }
    }, 2000);
  }

  stopCronjobs() {
    const jobs = this.schedulerRegistry.getCronJobs();

    for (const job of jobs) {
      job[1].stop();
    }
  }

  async runActiveCronjobs() {
    const activeCronjobs = await this.cronjobService.findAllActiveCronjobs();

    for (const cronjob of activeCronjobs) {
      const jobs = this.schedulerRegistry.getCronJobs();

      for (const job of jobs) {
        if (job[0] === cronjob.code) {
          job[1].setTime(new CronTime(cronjob.duration));
          job[1].start();

          this.logger.info(`Cronjob ${job[0]} Started`);
        }
      }
    }
  }
}

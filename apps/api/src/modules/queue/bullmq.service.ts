/* eslint-disable no-await-in-loop */
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import { BullQueue } from '@/constants';
import { ApiConfigService } from '@/shared/services';

@Injectable()
export class BullMQService {
  constructor(
    @InjectQueue('refresh-queue') private readonly queue: Queue,
    private readonly configService: ApiConfigService,
  ) {
    void this.addRepeatableJobs();
  }

  async addRepeatableJobs() {
    console.log('==========================================');
    console.log('Add Jobs');
    console.log('==========================================');

    const repeatableJobs = await this.queue.getRepeatableJobs();
    console.log('🚀 ~ BullMQService ~ addRepeatableJobs ~ repeatableJobs:', repeatableJobs);

    const jobs = [
      {
        name: BullQueue.RefreshTrackingStatus,
        cronTime: this.configService.bullmq.cronTime[BullQueue.RefreshTrackingStatus],
      },
      {
        name: BullQueue.SendMail,
        cronTime: this.configService.bullmq.cronTime[BullQueue.SendMail],
      },
    ];

    await Promise.all(
      jobs.map(async ({ name, cronTime: cronTime }: { name: string; cronTime?: string }) => {
        const existingJob = repeatableJobs.find((job) => job.name === name);

        if (existingJob) {
          if (cronTime) {
            if (cronTime === existingJob.pattern) {
              console.log(`Job: ${name} already exists with the same cron time.`);
            } else {
              await this.queue.removeRepeatableByKey(existingJob.key);
              await this.queue.add(name, {}, { repeat: { pattern: cronTime } });
              console.log(`Updated job: ${name} with new cron time.`);
            }
          } else {
            await this.queue.removeRepeatableByKey(existingJob.key);
            console.log(`Removed job: ${name} as cron time is not specified.`);
          }
        } else {
          if (cronTime) {
            await this.queue.add(name, {}, { repeat: { pattern: cronTime } });
            console.log(`Added job: ${name}`);
          } else {
            console.log(`Job ${name} not added as cron time is not specified.`);
          }
        }
      }),
    );

    await Promise.all(
      repeatableJobs.map(async (job) => {
        const existingJob = jobs.find((j) => j.name === job.name);

        if (!existingJob) {
          await this.queue.removeRepeatableByKey(job.key);
          console.log(`Removed repeatable job: ${job.name}`);
        }
      }),
    );
  }
}

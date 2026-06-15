import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { BullQueue } from '@/constants';

import { MailService } from '../mail/mail.service';

@Processor('refresh-queue')
export class BullMQProcessor extends WorkerHost {
  constructor(private readonly mailService: MailService) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any
  async process(job: Job<any, any, string>): Promise<any> {
    console.log('==========================================');
    console.log(job.name, new Date().toLocaleTimeString());
    console.log('==========================================');

    switch (job.name) {
      case BullQueue.SendMail: {
        await this.mailService.sendScheduleMails();
        break;
      }

      default: {
        throw new Error(`No job name match: ${job.name}`);
      }
    }
  }
}

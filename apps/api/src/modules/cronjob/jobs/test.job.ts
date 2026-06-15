import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Logger } from 'winston';

@Injectable()
export class TestJob {
  constructor(@Inject('winston') private readonly logger: Logger) {}

  @Cron('0 0 5 31 2 *', {
    name: 'TEST-CRON',
  })
  doTest() {
    this.logger.info('Test Cron Job');
  }
}

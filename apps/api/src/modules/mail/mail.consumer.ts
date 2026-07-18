/* eslint-disable @typescript-eslint/no-explicit-any */
import { AmqpConnection, RabbitPayload, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Controller, Injectable } from '@nestjs/common';
import Bottleneck from 'bottleneck';
import { MailStatus, type SendMailPaymentDto } from 'shared';

import { ApiConfigService } from '@/shared/services';

import { MailService } from './mail.service';
import { MailHistoryRepository } from './mail-history.repository';

export function ProdRabbitSubscribe(options: any) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    console.log('process.env.pm_id', process.env.pm_id);

    if (process.env.pm_id === '0' || !process.env.pm_id) {
      return RabbitSubscribe(options)(target, propertyKey, descriptor);
    }

    return descriptor;
  };
}

@Injectable()
@Controller()
export class MailConsumer implements OnModuleInit, OnModuleDestroy {
  private limiter: Bottleneck;

  constructor(
    private mailService: MailService,
    private mailHistoryRepository: MailHistoryRepository,
    private readonly amqpConnection: AmqpConnection,
    private readonly configService: ApiConfigService,
  ) {
    this.limiter = new Bottleneck({
      maxConcurrent: 3,
      minTime: 10_000,
      timeout: 60_000,
    });
  }

  onModuleInit() {
    // Delay setupDLQ to give AmqpConnection time to establish channel
    setTimeout(() => {
      // void this.setupDLQ();
    }, 2000);
  }

  onModuleDestroy() {
    // Gracefully shut down Bottleneck when the module is destroyed
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.limiter.stop();
  }

  private async setupDLQ() {
    try {
      const channel = this.amqpConnection.channel;
      const dlExchange = process.env.RABBITMQ_MAIN_EXCHANGE;
      const sendDlq = process.env.RABBITMQ_MAIN_EXCHANGE + '.mail.send.dlq';

      await channel.assertQueue(sendDlq, { durable: true });
      await channel.bindQueue(sendDlq, dlExchange, sendDlq);

      console.log('Mail DLQ setup completed successfully');
    } catch (error) {
      console.error('Error setting up Mail DLQ:', error);
    }
  }

  @ProdRabbitSubscribe({
    exchange: process.env.RABBITMQ_MAIN_EXCHANGE,
    routingKey: process.env.RABBITMQ_MAIN_EXCHANGE + '.mail.payment',
    queue: process.env.RABBITMQ_MAIN_EXCHANGE + '.mail',
  })
  async onMailPayment(
    @RabbitPayload()
    sendMailPaymentDto: SendMailPaymentDto & { retry: number },
  ): Promise<void> {
    const { retry, email } = sendMailPaymentDto;

    try {
      await this.mailService.sendMailPayment(sendMailPaymentDto);
    } catch (error) {
      console.log(error);

      if (retry < 3) {
        await this.amqpConnection.publish(
          process.env.RABBITMQ_MAIN_EXCHANGE!,
          process.env.RABBITMQ_MAIN_EXCHANGE + '.mail.payment',
          {
            ...sendMailPaymentDto,
            retry: retry + 1,
          },
          {
            headers: {
              'x-delay': 60_000,
            },
          },
        );
      } else {
        console.error('Max retries reached for email:', email);
        await this.amqpConnection.publish(
          process.env.RABBITMQ_MAIN_EXCHANGE!,
          process.env.RABBITMQ_MAIN_EXCHANGE + '.mail.payment.dlq',
          {
            ...sendMailPaymentDto,
            error: error instanceof Error ? error.message : 'Unknown error',
            failedAt: new Date().toISOString(),
          },
        );
      }
    }
  }

  @ProdRabbitSubscribe({
    exchange: process.env.RABBITMQ_MAIN_EXCHANGE,
    routingKey: process.env.RABBITMQ_MAIN_EXCHANGE + '.mail.send',
    queue: process.env.RABBITMQ_MAIN_EXCHANGE + '.mail.send',
    queueOptions: {
      durable: true,
      deadLetterExchange: process.env.RABBITMQ_MAIN_EXCHANGE,
      deadLetterRoutingKey: process.env.RABBITMQ_MAIN_EXCHANGE + '.mail.send.dlq',
      messageTtl: 86_400_000,
    },
    errorHandler: async (channel: any, msg: any, error: any) => {
      console.error('RabbitMQ mail send error:', error);
      await channel.nack(msg, false, true);
    },
  })
  async onMailSend(
    @RabbitPayload() mail: { mailId: string; to: string; subject: string; body: string; retry?: number },
  ): Promise<void> {
    const retry = mail.retry || 0;

    try {
      await this.limiter.schedule(async () => {
        console.log(`Processing mail send to: ${mail.to}`);
        await this.mailService.processSendEmail({
          to: mail.to,
          subject: mail.subject,
          html: mail.body,
        });

        await this.mailHistoryRepository.updateOne({ _id: mail.mailId }, { status: MailStatus.Done });
        console.log(`Successfully sent mail to: ${mail.to}`);
      });
    } catch (error) {
      console.log(error);

      if (retry < 3) {
        await this.amqpConnection.publish(
          process.env.RABBITMQ_MAIN_EXCHANGE!,
          process.env.RABBITMQ_MAIN_EXCHANGE + '.mail.send',
          {
            ...mail,
            retry: retry + 1,
          },
          {
            headers: {
              'x-delay': 60_000,
            },
          },
        );
      } else {
        console.error('Max retries reached for email:', mail.to);
        await this.amqpConnection.publish(
          process.env.RABBITMQ_MAIN_EXCHANGE!,
          process.env.RABBITMQ_MAIN_EXCHANGE + '.mail.send.dlq',
          {
            ...mail,
            error: error instanceof Error ? error.message : 'Unknown error',
            failedAt: new Date().toISOString(),
          },
        );
      }
    }
  }
}

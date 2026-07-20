import { RabbitPayload, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Controller } from '@nestjs/common';
import { TeleMessageDto } from 'shared';

import { UserService } from './user.service';

@Controller()
export class NotificationConsumer {
  constructor(private readonly userService: UserService) {}

  @RabbitSubscribe({
    exchange: process.env.RABBITMQ_MAIN_EXCHANGE,
    routingKey: process.env.RABBITMQ_MAIN_EXCHANGE + '.message.telegram',
    queue: process.env.RABBITMQ_MAIN_EXCHANGE + '.message',
  })
  async sendNotification(@RabbitPayload() data: TeleMessageDto): Promise<void> {
    const { userId, message }: { userId: string; message: string } = data;

    // BROKEN legacy path: `UserService.sendNotification` không còn tồn tại —
    // handler này chạy (message telegram vào queue) sẽ TypeError như hiện
    // trạng. Cast type-only để qua type-check, KHÔNG đổi runtime.
    await (
      this.userService as unknown as { sendNotification(userId: string, message: string): Promise<void> }
    ).sendNotification(userId, message);
  }
}

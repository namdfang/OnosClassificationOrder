import { RabbitPayload, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Controller } from '@nestjs/common';

import { extractIpLocation } from '@/utils/extract-ip-location';

import { ActionRepository } from '../actions/action.repository';

@Controller()
export class AuthConsumer {
  constructor(private readonly actionRepository: ActionRepository) {}

  @RabbitSubscribe({
    exchange: process.env.RABBITMQ_MAIN_EXCHANGE,
    routingKey: process.env.RABBITMQ_MAIN_EXCHANGE + '.auth.location',
    queue: process.env.RABBITMQ_MAIN_EXCHANGE + '.auth.location',
  })
  async handleExtractLocation(@RabbitPayload() data: { ip: string; actionId: string }): Promise<void> {
    const { ip, actionId } = data;

    try {
      const ipInfo = await extractIpLocation(ip);

      await this.actionRepository.updateOne({ _id: actionId }, { ...ipInfo });
    } catch (error) {
      console.log(error);
    }
  }
}

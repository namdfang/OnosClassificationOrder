import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { ISendMailOptions } from '@nestjs-modules/mailer';
import { MailerService as MailerMain } from '@nestjs-modules/mailer';
import dayjs from 'dayjs';
import pLimit from 'p-limit';
import type {
  CreateMailTemplateDto,
  GetMailHistoryDto,
  GetMailHistoryResDto,
  GetMailTemplatesResDto,
  PageQueryDto,
  ScheduleMailDto,
  SendMailPaymentDto,
  UpdateMailTemplateDto,
} from 'shared';
import { MailStatus, MailType } from 'shared';

import { MailHistoryRepository } from './mail-history.repository';
import type { MailTemplateDocument, MailTemplateEntity } from './mail-template.entity';
import { MailTemplateRepository } from './mail-template.repository';
import { escapeRegExp } from '@/utils';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerMain: MailerMain,
    private readonly mailTemplateRepository: MailTemplateRepository,
    private readonly mailHistoryRepository: MailHistoryRepository,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  async sendMailPayment(sendMailPaymentDto: SendMailPaymentDto): Promise<void> {
    const { name, email, title, subject, amount, balance } = sendMailPaymentDto;

    const mailTemplatePayment = await this.mailTemplateRepository.findOne({ name: MailType.Payment });

    if (!mailTemplatePayment) {
      throw new BadRequestException('MailTemplate not found');
    }

    type VariableTemplate = {
      [key in (typeof mailTemplatePayment.variables)[number]]: string;
    };

    const data: VariableTemplate = {
      name,
      title,
      amount,
      balance,
    };

    let body = mailTemplatePayment.body;

    for (const key of Object.keys(data)) {
      const value = data[key];
      const regex = new RegExp(`{{${key}}}`, 'g'); // Create a regex pattern to match the exact placeholder
      body = body.replaceAll(regex, value);
    }

    let mailStatus = MailStatus.Done;

    try {
      await this.processSendEmail({ to: email, subject, html: body });
    } catch (error) {
      console.log('Error sending email', error);

      mailStatus = MailStatus.Error;
    }

    await this.mailHistoryRepository.create({
      email,
      body,
      topic: MailType.Payment,
      status: mailStatus,
    });
  }

  async processSendEmail({ to, subject, html }: ISendMailOptions): Promise<void> {
    try {
      await this.mailerMain.sendMail({
        to,
        subject,
        html,
      });
      console.log('Email sent');
    } catch (error) {
      console.log('Error sending email', error);

      throw error;
    }
  }

  async getMailTemplates(getMailTemplatesDto: PageQueryDto): Promise<GetMailTemplatesResDto> {
    const { limit, page, sort, order } = getMailTemplatesDto;

    return await this.mailTemplateRepository.findAllAndCount(
      {},
      {
        paging: {
          skip: (page - 1) * limit,
          limit,
        },
        sort: {
          [sort || 'createdAt']: order === 'asc' ? 1 : -1,
        },
      },
    );
  }

  async getMailHistory(getMailHistoryDto: GetMailHistoryDto): Promise<GetMailHistoryResDto> {
    const { email, status, topic, limit, page, sort, order } = getMailHistoryDto;

    let filterQuery = {};
    const regexEmail = {
      $regex: escapeRegExp(email),
      $options: 'i',
    };

    if (email) {
      filterQuery = { ...filterQuery, $or: [{ name: email }, { name: regexEmail }] };
    }

    if (status) {
      filterQuery = { ...filterQuery, status };
    }

    if (topic) {
      filterQuery = { ...filterQuery, topic };
    }

    return await this.mailHistoryRepository.findAllAndCount(filterQuery, {
      paging: {
        skip: (page - 1) * limit,
        limit,
      },
      sort: {
        [sort || 'createdAt']: order === 'asc' ? 1 : -1,
      },
    });
  }

  validateMailTemplate(body: string, variables: string[]): boolean {
    const uniqueVariables = [...new Set(variables)].sort();

    if (uniqueVariables.length !== variables.length) {
      return false;
    }

    const matches = body
      .match(/{{(.*?)}}/g)
      ?.map((match) => match.replaceAll(/{{|}}/g, ''))
      .filter((match) => variables.includes(match));

    const uniqueMatches = [...new Set(matches)].sort();

    if (uniqueMatches.length !== uniqueVariables.length) {
      return false;
    }

    for (const [i, match] of uniqueMatches.entries()) {
      if (match !== uniqueVariables[i]) {
        return false;
      }
    }

    return true;
  }

  async createMailTemplate(createMailTemplateDto: CreateMailTemplateDto): Promise<MailTemplateDocument> {
    const { body, variables } = createMailTemplateDto;

    if (!this.validateMailTemplate(body, variables)) {
      throw new BadRequestException('Invalid mail template');
    }

    const newMailTemplate: MailTemplateEntity = {
      ...createMailTemplateDto,
    };

    return this.mailTemplateRepository.create(newMailTemplate);
  }

  async getMailTemplate(mailTemplateId: string): Promise<MailTemplateDocument> {
    const mailTemplate = await this.mailTemplateRepository.findOneById(mailTemplateId);

    if (!mailTemplate) {
      throw new BadRequestException('MailTemplate not found');
    }

    return mailTemplate;
  }

  async updateMailTemplate(
    mailTemplateId: string,
    updateMailTemplateDto: UpdateMailTemplateDto,
  ): Promise<MailTemplateEntity> {
    const { body, variables } = updateMailTemplateDto;

    if (body && variables && !this.validateMailTemplate(body, variables)) {
      throw new BadRequestException('Invalid mail template');
    }

    const mailTemplate = await this.mailTemplateRepository.findOneByIdAndUpdate(mailTemplateId, {
      $set: {
        ...updateMailTemplateDto,
      },
    });

    if (!mailTemplate) {
      throw new BadRequestException('MailTemplate not found');
    }

    return mailTemplate;
  }

  async scheduleMail(scheduleMailDto: ScheduleMailDto): Promise<void> {
    const { type, scheduleTime, scheduleDate, variables } = scheduleMailDto;

    const email = variables.email;

    const mailTemplateSalary = await this.mailTemplateRepository.findOne({ name: type });

    let body = '';

    if (mailTemplateSalary) {
      body = mailTemplateSalary.body;

      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g'); // Create a regex pattern to match the exact placeholder
        body = body.replaceAll(regex, value || '0');
      }
    } else {
      body = variables.body;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument

    const times = scheduleTime.split(':');

    await this.mailHistoryRepository.create({
      topic: type,
      email,
      status: MailStatus.Pending,
      body,
      subject: variables.subject,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      scheduledTime: dayjs(scheduleDate)
        .clone()
        .hour(Number(times[0]))
        .minute(Number(times[1]))
        .second(0)
        .millisecond(0)
        .toDate(),
    });
  }

  async sendScheduleMails() {
    const mails = await this.mailHistoryRepository.findAll({
      status: MailStatus.Pending,
      scheduledTime: {
        $lte: new Date(),
      },
    });

    const limit = pLimit(10);

    await Promise.all(
      mails.map((mail) =>
        limit(async () => {
          try {
            await this.amqpConnection.publish(
              process.env.RABBITMQ_MAIN_EXCHANGE!,
              process.env.RABBITMQ_MAIN_EXCHANGE + '.mail.send',
              {
                mailId: mail._id,
                to: mail.email.replaceAll(/@+/g, '@').replaceAll(/[^\d.@A-Za-z]+/g, '.'),
                subject: mail.subject,
                body: mail.body,
              },
            );
          } catch (error) {
            console.log('Error sending email', error);

            await this.mailHistoryRepository.updateOne(
              { _id: mail._id },
              {
                $set: {
                  status: MailStatus.Error,
                },
              },
            );
          }
        }),
      ),
    );
    await this.mailHistoryRepository.updateMany(
      {
        _id: { $in: mails.map((mail) => mail._id) },
      },
      {
        status: MailStatus.Sending,
      },
    );
  }
}

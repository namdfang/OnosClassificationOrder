import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CreateMailTemplateDto,
  GetMailHistoryDto,
  PageQueryDto,
  ResDto,
  RoleType,
  ScheduleMailDto,
  UpdateMailTemplateDto,
} from 'shared';
import { Logger } from 'winston';

// import { ResDto } from 'shared';
import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { MailService } from './mail.service';
import { MailTemplateRepository } from './mail-template.repository';

@Controller('mail')
@ApiTags('mail')
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly mailRepository: MailTemplateRepository,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get('history')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Get Mail History',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async getMailHistory(
    @Query()
    getMailHistoryDto: GetMailHistoryDto,
    @AuthUser() user: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'getMailHistory',
        method: 'GET',
        url: '/mailHistory',
        message: 'Get Mail History',
        userId: user._id,
        query: getMailHistoryDto,
      }),
    });

    return { success: true, ...(await this.mailService.getMailHistory(getMailHistoryDto)) };
  }

  @Get('templates')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Get mailTemplates',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async getMailTemplates(
    @Query()
    pageQueryDto: PageQueryDto,
    @AuthUser() user: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'getMailTemplates',
        method: 'GET',
        url: '/mailTemplates',
        message: 'Get Mail Template',
        userId: user._id,
        query: pageQueryDto,
      }),
    });

    return { success: true, ...(await this.mailService.getMailTemplates(pageQueryDto)) };
  }

  @Post('templates')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Create mailTemplate',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async createMailTemplate(
    @Body() createMailTemplateDto: CreateMailTemplateDto,
    @AuthUser() user: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'createMailTemplate',
        method: 'POST',
        url: '/mailTemplates',
        message: 'Create Mail Template',
        userId: user._id,
        body: createMailTemplateDto,
      }),
    });

    return { success: true, data: await this.mailService.createMailTemplate(createMailTemplateDto) };
  }

  @Patch('templates/:mailTemplateId')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Update mailTemplate',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
    description: 'Update mailTemplate',
  })
  async updateMailTemplate(
    @Param('mailTemplateId') mailTemplateId: string,
    @Body() updateMailTemplateDto: UpdateMailTemplateDto,
    @AuthUser() user: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'updateMailTemplate',
        method: 'PATCH',
        url: `/mailTemplates/${mailTemplateId}`,
        message: 'Update Mail Template',
        userId: user.id,
        body: updateMailTemplateDto,
        params: {
          mailTemplateId,
        },
      }),
    });

    return {
      success: true,
      data: await this.mailService.updateMailTemplate(mailTemplateId, updateMailTemplateDto),
    };
  }

  @Get('templates/:mailTemplateId')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Get Mail Template',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async getMailTemplate(
    @Param('mailTemplateId') mailTemplateId: string,
    @AuthUser() user: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'getMailTemplate',
        method: 'GET',
        url: `/mailTemplates/${mailTemplateId}`,
        message: 'Get Mail Template',
        userId: user._id,
        params: {
          mailTemplateId,
        },
      }),
    });

    return { success: true, data: await this.mailService.getMailTemplate(mailTemplateId) };
  }

  @Delete('templates/:mailTemplateId')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Delete Mail Template',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async deleteMailTemplate(
    @Param('mailTemplateId') mailTemplateId: string,
    @AuthUser() user: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'deleteMailTemplate',
        method: 'Delete',
        url: `/mailTemplates/${mailTemplateId}`,
        message: 'Delete Mail Template',
        userId: user._id,
        params: {
          mailTemplateId,
        },
      }),
    });

    await this.mailRepository.softDelete({ _id: mailTemplateId });

    return { success: true };
  }

  @Post('schedule')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Schedule Mail',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async scheduleMail(@Body() scheduleMailDto: ScheduleMailDto, @AuthUser() user: UserDocument): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'scheduleMail',
        method: 'POST',
        url: '/mail/schedule',
        message: 'Schedule Mail',
        userId: user._id,
        body: scheduleMailDto,
      }),
    });

    // eslint-disable-next-line no-useless-catch
    try {
      await this.mailService.scheduleMail(scheduleMailDto);

      return { success: true };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      throw error;
    }
  }
}

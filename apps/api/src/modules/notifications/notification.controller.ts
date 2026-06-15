import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CreateNotificationSystemDto,
  GetNotificationResDto,
  GetNotificationsDto,
  GetNotificationsResDto,
  ResDto,
  RoleType,
  UpdateNotificationDto,
  UpdateNotificationResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

@Controller('notifications')
@ApiTags('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationRepository: NotificationRepository,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  @Auth([
    RoleType.Admin,
    RoleType.Logistics,
    RoleType.Manager,
    RoleType.Seller,
    RoleType.Accountant,
    RoleType.ProductManager,
    RoleType.Provider,
    RoleType.Referrer,
    RoleType.Support,
  ])
  @ApiOperation({
    summary: 'Get notifications',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: GetNotificationsResDto,
  })
  async getNotifications(
    @Query()
    getNotificationsDto: GetNotificationsDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetNotificationsResDto> {
    return { success: true, ...(await this.notificationService.getNotifications(getNotificationsDto, user)) };
  }

  @Get('unseen')
  @Auth([
    RoleType.Admin,
    RoleType.Manager,
    RoleType.Logistics,
    RoleType.Seller,
    RoleType.Accountant,
    RoleType.ProductManager,
    RoleType.Provider,
    RoleType.Referrer,
    RoleType.Support,
  ])
  @ApiOperation({
    summary: 'Get unseen notifications',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async unseen(@AuthUser() user: UserDocument): Promise<ResDto> {
    return { success: true, data: { unseen: await this.notificationService.unseen(user) } };
  }

  @Post()
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Create notification',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async createNotification(
    @Body() createNotificationSystemDto: CreateNotificationSystemDto,
    @AuthUser() user: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'createNotification',
        method: 'POST',
        url: '/notifications',
        message: 'Create notification',
        userId: user._id,
        body: createNotificationSystemDto,
      }),
    });

    return {
      success: true,
      data: await this.notificationService.createSystemNotification(createNotificationSystemDto),
    };
  }

  @Patch(':notificationId')
  @Auth([RoleType.Admin, RoleType.Seller])
  @ApiOperation({
    summary: 'Update notification',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: UpdateNotificationResDto,
    description: 'Update notification',
  })
  async updateNotification(
    @Param('notificationId') notificationId: string,
    @Body() updateNotificationDto: UpdateNotificationDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateNotificationResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'updateNotification',
        method: 'PATCH',
        url: `/notifications/${notificationId}`,
        message: 'Update notification',
        userId: user.id,
        body: updateNotificationDto,
        params: {
          notificationId,
        },
      }),
    });

    return {
      success: true,
      data: await this.notificationService.updateNotification(notificationId, updateNotificationDto),
    };
  }

  @Get(':notificationId')
  @Auth([RoleType.Admin, RoleType.Logistics, RoleType.Seller, RoleType.Support])
  @ApiOperation({
    summary: 'Get notification',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: GetNotificationResDto,
  })
  async getNotification(
    @Param('notificationId') notificationId: string,
    @AuthUser() user: UserDocument,
  ): Promise<GetNotificationResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'getNotification',
        method: 'GET',
        url: `/notifications/${notificationId}`,
        message: 'Get notification',
        userId: user._id,
        params: {
          notificationId,
        },
      }),
    });

    return { success: true, data: await this.notificationService.getNotification(notificationId) };
  }

  @Delete(':notificationId')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Delete notification',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async deleteNotification(
    @Param('notificationId') notificationId: string,
    @AuthUser() user: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'deleteNotification',
        method: 'Delete',
        url: `/notifications/${notificationId}`,
        message: 'Delete notification',
        userId: user._id,
        params: {
          notificationId,
        },
      }),
    });

    await this.notificationRepository.softDelete({ _id: notificationId });

    return { success: true };
  }

  @Get(':notificationId/seen')
  @Auth([RoleType.Admin, RoleType.Logistics, RoleType.Manager, RoleType.Seller, RoleType.Support])
  @ApiOperation({
    summary: 'Seen notification',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async seenNotification(
    @Param('notificationId') notificationId: string,
    @AuthUser() user: UserDocument,
  ): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'seenNotification',
        method: 'Get',
        url: `/notifications/${notificationId}/seen`,
        message: 'Seen notification',
        userId: user._id,
        params: {
          notificationId,
        },
      }),
    });

    return { success: true, data: await this.notificationService.seenNotification(notificationId) };
  }

  @Get(':seen-all-notifications')
  @Auth([RoleType.Admin, RoleType.Logistics, RoleType.Manager, RoleType.Seller, RoleType.Provider, RoleType.Support])
  @ApiOperation({
    summary: 'Seen all notification',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async seenAllNotification(@AuthUser() user: UserDocument): Promise<ResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'seenAllNotification',
        method: 'Get',
        url: `/notifications/seen-all-notifications`,
        message: 'Seen all notification',
        userId: user._id,
      }),
    });

    try {
      await this.notificationRepository.updateMany({ userId: user._id }, { $set: { seen: true } });

      return { success: true };
    } catch (error) {
      throw new BadRequestException(error);
    }
  }
}

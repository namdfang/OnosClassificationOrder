import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CreateNotificationDto,
  CreateNotificationSystemDto,
  GetNotificationsDto,
  GetNotificationsResDto,
  UpdateNotificationDto,
} from 'shared';
import { NotificationType } from 'shared';

import { timeAgo, escapeRegExp } from '@/utils';

import type { UserDocument } from '../user/user.entity';
import { UserRepository } from '../user/user.repository';
import type { NotificationDocument } from './notification.entity';
import { NotificationEntity } from './notification.entity';
import { NotificationRepository } from './notification.repository';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(NotificationEntity.name)
    private notificationModel: Model<NotificationDocument>,
    private notificationRepository: NotificationRepository,
    private userRepository: UserRepository,
  ) {}

  async getNotifications(
    getNotificationsDto: GetNotificationsDto,
    user: UserDocument,
  ): Promise<GetNotificationsResDto> {
    const { type, search, limit, page, sort, order } = getNotificationsDto;

    let filterQuery = {};
    const regexSearch = {
      $regex: escapeRegExp(search),
      $options: 'i',
    };

    if (search) {
      filterQuery = { ...filterQuery, $or: [{ title: search }, { title: regexSearch }] };
    }

    if (type) {
      filterQuery = { ...filterQuery, type };
    }

    filterQuery = {
      ...filterQuery,
      userId: user._id,
    };

    const unseenCount = await this.notificationModel.count({
      ...filterQuery,
      seen: false,
    });

    const notifications = await this.notificationRepository.findAllAndCount(filterQuery, {
      paging: {
        skip: (page - 1) * limit,
        limit,
      },
      sort: {
        seen: 1,
        [sort || 'createdAt']: order === 'asc' ? 1 : -1,
      },
    });

    const notificationsFormat = notifications.data.map((notification) => ({
      ...notification,
      description: notification.description,
      timesAgo: timeAgo(notification.createdAt!),
    }));

    return {
      data: notificationsFormat,
      unseen: unseenCount,
      total: notifications.total,
    };
  }

  async unseen(user: UserDocument): Promise<number> {
    return await this.notificationModel.count({ userId: user._id, seen: false });
  }

  async createNotification(createNotificationDto: CreateNotificationDto): Promise<NotificationDocument> {
    const newNotification: NotificationEntity = {
      ...createNotificationDto,
      seen: false,
    };

    return this.notificationRepository.create(newNotification);
  }

  async createSystemNotification(createNotificationSystemDto: CreateNotificationSystemDto): Promise<string> {
    const users = await this.userRepository.findAll();

    const promises = users.map((user) => {
      void this.notificationRepository.create({
        ...createNotificationSystemDto,
        userId: user._id,
        seen: false,
        type: NotificationType.System,
      });
    });

    await Promise.all(promises);

    return 'Created system notification successfully';
  }

  async getNotification(notificationId: string): Promise<NotificationDocument> {
    const notification = await this.notificationRepository.findOneById(notificationId);

    if (!notification) {
      throw new BadRequestException('Notification not found');
    }

    return notification;
  }

  async seenNotification(notificationId: string): Promise<NotificationEntity> {
    const notification = await this.notificationRepository.findOneByIdAndUpdate(notificationId, {
      $set: {
        seen: true,
      },
    });

    if (!notification) {
      throw new BadRequestException('Notification not found');
    }

    return notification;
  }

  async updateNotification(
    notificationId: string,
    updateNotificationDto: UpdateNotificationDto,
  ): Promise<NotificationEntity> {
    const notification = await this.notificationRepository.findOneByIdAndUpdate(notificationId, {
      $set: {
        ...updateNotificationDto,
      },
    });

    if (!notification) {
      throw new BadRequestException('Notification not found');
    }

    return notification;
  }
}

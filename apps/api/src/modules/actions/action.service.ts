import { Injectable } from '@nestjs/common';
import { type GetActionsDto, type GetActionsResDto, RoleType } from 'shared';

import { applyDateFilters } from '@/utils';

import type { UserDocument } from '../user/user.entity';
import { UserRepository } from '../user/user.repository';
import { ActionRepository } from './action.repository';

@Injectable()
export class ActionService {
  constructor(
    private actionRepository: ActionRepository,
    private userRepository: UserRepository,
  ) {}

  async getActions(getActionsDto: GetActionsDto, user: UserDocument): Promise<GetActionsResDto> {
    const { limit, page, sort, order, ip, email, type, sessionId, from, to } = getActionsDto;

    let filterQuery = {};

    if (ip) {
      filterQuery = {
        ...filterQuery,
        ip,
      };
    }

    if (user.role?.name !== RoleType.Admin) {
      filterQuery = {
        ...filterQuery,
        userId: user._id,
      };
    }

    if (sessionId) {
      filterQuery = {
        ...filterQuery,
        sessionId,
      };
    }

    if (from && to) {
      applyDateFilters(filterQuery, from, to);
    }

    if (email) {
      const userFilter = await this.userRepository.findOne({ email });

      if (userFilter) {
        filterQuery = {
          ...filterQuery,
          userId: userFilter._id,
        };
      }
    }

    if (type) {
      filterQuery = {
        ...filterQuery,
        type,
      };
    }

    return await this.actionRepository.findAllAndCount(filterQuery, {
      paging: {
        skip: (page - 1) * limit,
        limit,
      },
      populate: [
        {
          path: 'user',
          select: 'email',
        },
      ],
      sort: {
        active: -1,
        [sort || 'createdAt']: order === 'asc' ? 1 : -1,
      },
    });
  }

  // async createAction(createActionDto: CreateActionDto): Promise<ActionDocument> {
  //   if (!createActionDto.name.startsWith('PKD')) {
  //     throw new BadRequestException('Action code must start with PKD');
  //   }

  //   let newActionCode = genCode(8);
  //   let existedAction = await this.actionRepository.findOne({
  //     code: newActionCode,
  //   });

  //   while (existedAction) {
  //     newActionCode = genCode(8);
  //     // eslint-disable-next-line no-await-in-loop
  //     existedAction = await this.actionRepository.findOne({
  //       code: newActionCode,
  //     });
  //   }

  //   const newAction: ActionEntity = {
  //     ...createActionDto,
  //     code: newActionCode,
  //   };

  //   return this.actionRepository.create(newAction);
  // }

  // async getAction(actionId: string): Promise<ActionDocument> {
  //   const action = await this.actionRepository.findOneById(actionId);

  //   if (!action) {
  //     throw new BadRequestException('Action not found');
  //   }

  //   return action;
  // }

  // async updateAction(actionId: string, updateActionDto: UpdateActionDto): Promise<ActionEntity> {
  //   if (updateActionDto.name && !updateActionDto.name.startsWith('PKD')) {
  //     throw new BadRequestException('Action code must start with PKD');
  //   }

  //   const action = await this.actionRepository.findOneByIdAndUpdate(actionId, {
  //     $set: {
  //       ...updateActionDto,
  //     },
  //   });

  //   if (!action) {
  //     throw new BadRequestException('Action not found');
  //   }

  //   return action;
  // }
}

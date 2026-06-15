import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import { CronTime } from 'cron';
import type { DeleteCronjobResDto } from 'shared';
import {
  CreateCronjobDto,
  CreateCronjobResDto,
  GetCronjobsDto,
  GetCronjobsResDto,
  RoleType,
  Status,
  UpdateCronjobDto,
  UpdateCronjobResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { CronjobService } from './cronjob.service';

@Controller('cronjobs')
@ApiTags('cronjobs')
export class CronjobController {
  constructor(
    private cronjobService: CronjobService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  @Auth([RoleType.Admin, RoleType.Developer])
  @ApiOperation({
    summary: 'Get cronjobs',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: GetCronjobsResDto,
  })
  async getCronjobs(@Query() getCronjobsDto: GetCronjobsDto): Promise<GetCronjobsResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'GET',
        url: '/cronjobs',
        message: 'Get cronjobs',
        action: 'getCronjobs',
        query: getCronjobsDto,
      }),
    });

    return { success: true, ...(await this.cronjobService.getCronjobs(getCronjobsDto)) };
  }

  @Post()
  @Auth([RoleType.Admin, RoleType.Developer])
  @ApiOperation({
    summary: 'Create cronjob',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: CreateCronjobResDto,
  })
  async createCronjob(
    @Body() createCronDto: CreateCronjobDto,
    @AuthUser() user: UserDocument,
  ): Promise<CreateCronjobResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'createCronjob',
        method: 'POST',
        url: '/cronjobs',
        message: 'Create cronjob',
        userId: user._id,
        body: createCronDto,
      }),
    });

    const cronjob = await this.cronjobService.createCronjob(createCronDto);
    this.schedulerRegistry.getCronJob(cronjob.code).setTime(new CronTime(cronjob.duration));

    if (cronjob.status === Status.Active) {
      this.schedulerRegistry.getCronJob(cronjob.code).start();
    } else {
      this.schedulerRegistry.getCronJob(cronjob.code).stop();
    }

    return {
      success: true,
      data: cronjob,
    };
  }

  @Get(':cronjobId')
  @Auth([RoleType.Admin, RoleType.Developer])
  @ApiOperation({
    summary: 'Get cronjob',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: UpdateCronjobResDto,
  })
  async get(@Param('cronjobId') cronjobId: string, @AuthUser() user: UserDocument) {
    this.logger.info({
      message: JSON.stringify({
        action: 'getCronjob',
        method: 'GET',
        url: `/cronjobs/:${cronjobId}`,
        message: 'Get cronjob',
        userId: user._id,
        params: {
          id: cronjobId,
        },
      }),
    });

    const cronjob = await this.cronjobService.getById(cronjobId);

    return {
      success: true,
      data: cronjob,
    };
  }

  @Patch(':cronjobId')
  @Auth([RoleType.Admin, RoleType.Developer])
  @ApiOperation({
    summary: 'Update cronjob',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: UpdateCronjobResDto,
  })
  async updateCronjob(
    @Param('cronjobId') cronjobId: string,
    @Body() updateCronjobDto: UpdateCronjobDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateCronjobResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'updateCronjob',
        method: 'PATCH',
        url: `/cronjobs/${cronjobId}`,
        message: 'Update cronjob',
        userId: user._id,
        params: {
          cronjobId,
        },
        body: updateCronjobDto,
      }),
    });

    const cronjob = await this.cronjobService.updateCronjob(cronjobId, updateCronjobDto);

    this.schedulerRegistry.getCronJob(cronjob.code).setTime(new CronTime(cronjob.duration));

    if (cronjob.status === Status.Active) {
      this.schedulerRegistry.getCronJob(cronjob.code).start();
    } else {
      this.schedulerRegistry.getCronJob(cronjob.code).stop();
    }

    return {
      success: true,
      data: cronjob,
    };
  }

  @Delete(':id')
  @Auth([RoleType.Admin, RoleType.Developer])
  @ApiOperation({
    summary: 'Delete cronjob',
  })
  @HttpCode(HttpStatus.OK)
  async deleteCronjob(@Param('id') id: string, @AuthUser() user: UserDocument): Promise<DeleteCronjobResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'deleteCronjob',
        method: 'DELETE',
        url: '/cronjobs/:id',
        message: 'Delete cronjob',
        userId: user._id,
        params: {
          id,
        },
      }),
    });

    const cronjob = await this.cronjobService.getById(id);

    await this.cronjobService.deleteCronjob(id);

    this.schedulerRegistry.getCronJob(cronjob.code).stop();

    return {
      success: true,
      data: null,
    };
  }
}

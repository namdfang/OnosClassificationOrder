import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CronTime } from 'cron';
import type { CreateCronjobDto, GetCronjobsDto, GetCronjobsResDto, UpdateCronjobDto } from 'shared';
import { Status } from 'shared';

import type { CronjobEntity } from './cronjob.entity';
import { CronjobRepository } from './cronjob.repository';

@Injectable()
export class CronjobService {
  constructor(private cronjobRepository: CronjobRepository) {}

  async getCronjobs(getCronjobsDto: GetCronjobsDto): Promise<GetCronjobsResDto> {
    const { page, limit, sort, order } = getCronjobsDto;

    return await this.cronjobRepository.findAllAndCount(
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

  async getById(cronjobId: string): Promise<CronjobEntity> {
    const cronjob = await this.cronjobRepository.findOneById(cronjobId);

    if (!cronjob) {
      throw new NotFoundException('Cronjob not found');
    }

    return cronjob;
  }

  async createCronjob(createCronjobDto: CreateCronjobDto): Promise<CronjobEntity> {
    try {
      new CronTime(createCronjobDto.duration);
    } catch {
      throw new BadRequestException('Invalid cron duration');
    }

    return await this.cronjobRepository.create(createCronjobDto);
  }

  async updateCronjob(id: string, updateCronjobDto: UpdateCronjobDto): Promise<CronjobEntity> {
    try {
      if (updateCronjobDto.duration) {
        new CronTime(updateCronjobDto.duration);
      }
    } catch {
      throw new BadRequestException('Invalid cron duration');
    }

    const cronjob = await this.cronjobRepository.findOneAndUpdate({ _id: id }, updateCronjobDto);

    if (!cronjob) {
      throw new NotFoundException('Cronjob not found');
    }

    return cronjob;
  }

  async deleteCronjob(id: string): Promise<boolean> {
    return await this.cronjobRepository.softDelete({ _id: id });
  }

  findAllActiveCronjobs(): Promise<CronjobEntity[]> {
    return this.cronjobRepository.findAll({ status: Status.Active });
  }
}

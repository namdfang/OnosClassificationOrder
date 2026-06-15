import { BadRequestException, Injectable } from '@nestjs/common';
import type { CreateDepartmentDto, GetDepartmentsDto, GetDepartmentsResDto, UpdateDepartmentDto } from 'shared';
import { RoleType } from 'shared';

import { genCode , escapeRegExp } from '@/utils';

import type { UserDocument } from '../user/user.entity';
import type { DepartmentDocument, DepartmentEntity } from './department.entity';
import { DepartmentRepository } from './department.repository';

@Injectable()
export class DepartmentService {
  constructor(private departmentRepository: DepartmentRepository) {}

  async getDepartments(getDepartmentsDto: GetDepartmentsDto, user: UserDocument): Promise<GetDepartmentsResDto> {
    const { search, limit, page, sort, order } = getDepartmentsDto;

    let filterQuery = {};
    const regexSearch = {
      $regex: escapeRegExp(search),
      $options: 'i',
    };

    if (search) {
      filterQuery = { ...filterQuery, $or: [{ name: search }, { name: regexSearch }] };
    }

    if (![RoleType.Admin, RoleType.Accountant, RoleType.Logistics].includes(user.role?.name as RoleType)) {
      filterQuery = {
        ...filterQuery,
        userId: user._id,
      };
    }

    return await this.departmentRepository.findAllAndCount(filterQuery, {
      paging: {
        skip: (page - 1) * limit,
        limit,
      },
      sort: {
        [sort || 'createdAt']: order === 'asc' ? 1 : -1,
      },
    });
  }

  async createDepartment(createDepartmentDto: CreateDepartmentDto): Promise<DepartmentDocument> {
    // if (!createDepartmentDto.name.startsWith('PKD')) {
    //   throw new BadRequestException('Department code must start with PKD');
    // }

    let newDepartmentCode = genCode(8);
    let existedDepartment = await this.departmentRepository.findOne({
      code: newDepartmentCode,
    });

    while (existedDepartment) {
      newDepartmentCode = genCode(8);
      // eslint-disable-next-line no-await-in-loop
      existedDepartment = await this.departmentRepository.findOne({
        code: newDepartmentCode,
      });
    }

    const newDepartment: DepartmentEntity = {
      ...createDepartmentDto,
      code: newDepartmentCode,
    };

    return this.departmentRepository.create(newDepartment);
  }

  async getDepartment(departmentId: string): Promise<DepartmentDocument> {
    const department = await this.departmentRepository.findOneById(departmentId);

    if (!department) {
      throw new BadRequestException('Department not found');
    }

    return department;
  }

  async updateDepartment(departmentId: string, updateDepartmentDto: UpdateDepartmentDto): Promise<DepartmentEntity> {
    // if (updateDepartmentDto.name && !updateDepartmentDto.name.startsWith('PKD')) {
    //   throw new BadRequestException('Department code must start with PKD');
    // }

    const department = await this.departmentRepository.findOneByIdAndUpdate(departmentId, {
      $set: {
        ...updateDepartmentDto,
      },
    });

    if (!department) {
      throw new BadRequestException('Department not found');
    }

    return department;
  }
}

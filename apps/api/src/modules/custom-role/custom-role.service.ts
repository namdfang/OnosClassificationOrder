import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCustomRoleDto, GetCustomRolesDto, GetCustomRolesResDto, UpdateCustomRoleDto } from 'shared';

import type { CustomRoleDocument } from './custom-role.entity';
import { CustomRoleRepository } from './custom-role.repository';

@Injectable()
export class CustomRoleService {
  constructor(private customRoleRepository: CustomRoleRepository) {}

  public async createCustomRole(createRoleDto: CreateCustomRoleDto): Promise<CustomRoleDocument> {
    return this.customRoleRepository.create(createRoleDto);
  }

  async getCustomRoles(getRolesDto: GetCustomRolesDto): Promise<GetCustomRolesResDto> {
    const { page, limit, status, sort, order } = getRolesDto;

    console.log(getRolesDto);

    let query = {};

    if (status) {
      query = {
        ...query,
        status,
      };
    }

    return await this.customRoleRepository.findAllAndCount(
      { ...query },
      {
        paging: {
          limit,
          skip: limit * (page - 1),
        },
        select: ['name', 'description', 'status', 'permissionIds'],
        sort: {
          [sort || 'createdAt']: order === 'asc' ? 1 : -1,
        },
      },
    );
  }

  async findOneById(customRoleId: string): Promise<CustomRoleDocument> {
    const customRole = await this.customRoleRepository.findOneById(customRoleId, { populate: { path: 'permissions' } });

    if (!customRole) {
      throw new NotFoundException('Role not found');
    }

    return customRole;
  }

  public async updateCustomRole(customRoleId: string, updateRoleDto: UpdateCustomRoleDto): Promise<CustomRoleDocument> {
    const customRole = await this.customRoleRepository.findOneByIdAndUpdate(customRoleId, updateRoleDto);

    if (!customRole) {
      throw new NotFoundException('Role not found');
    }

    return customRole;
  }
}

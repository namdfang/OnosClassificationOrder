/* eslint-disable unicorn/no-array-reduce */
import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreatePermissionDto, UpdatePermissionDto } from 'shared';

import type { PermissionDocument } from './permission.entity';
import { PermissionRepository } from './permission.repository';

@Injectable()
export class PermissionService {
  constructor(private permissionRepository: PermissionRepository) {}

  public async createPermission(createPermissionDto: CreatePermissionDto): Promise<PermissionDocument> {
    return await this.permissionRepository.create({
      ...createPermissionDto,
    });
  }

  async getAllPermissions(): Promise<PermissionDocument[]> {
    return this.permissionRepository.findAll({}, { select: ['permissionId', 'description', 'status', 'action'] });
  }

  async findOneById(permissionId: string): Promise<PermissionDocument | null> {
    return this.permissionRepository.findOneById(permissionId);
  }

  public async updatePermission(
    permissionId: string,
    updatePermissionDto: UpdatePermissionDto,
  ): Promise<PermissionDocument> {
    const permission = await this.permissionRepository.findOneByIdAndUpdate(permissionId, updatePermissionDto);

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return permission;
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { CreateRoleDto, GetRolesDto, GetRolesResDto, UpdateRoleDto, UpdateRolePermissionsDto } from 'shared';
import { ALL_PERMISSION_CODES, DEFAULT_ROLE_PERMISSIONS, RoleType, Status, SYSTEM_ROLES } from 'shared';

import type { RoleDocument } from './role.entity';
import { RoleRepository } from './role.repository';

@Injectable()
export class RoleService implements OnModuleInit {
  constructor(private roleRepository: RoleRepository) {}

  /**
   * Phase 5 seed: ensure every system role exists + has the default permission
   * codes baseline. We do NOT overwrite codes once an admin has customized
   * them — only newly inserted roles get the preset.
   */
  async onModuleInit() {
    for (const roleName of SYSTEM_ROLES) {
      try {
        // withDeleted so we restore (instead of insert-and-fail) any role
        // that was soft-deleted previously — the unique index on `name` doesn't
        // exclude soft-deleted rows.
        const existing = await this.roleRepository.findOne({ name: roleName }, { withDeleted: true });
        const defaults = DEFAULT_ROLE_PERMISSIONS[roleName] || [];

        if (!existing) {
          await this.roleRepository.create({
            name: roleName,
            description: `${roleName} (system)`,
            status: Status.Active,
            permissionIds: [],
            permissionCodes: defaults,
            isSystem: true,
          });
          // eslint-disable-next-line no-console
          console.log(`[role-seed] created ${roleName} with ${defaults.length} permissions`);
          continue;
        }

        // System role = catalog là source of truth. Mỗi lần boot ta sync
        // `permissionCodes` về đúng default — feature mới thêm vào catalog tự
        // propagate, quyền bị rút (vd. Phase 8 bỏ `toolResultNote.edit` của
        // Fulfillment) cũng được áp luôn. Nếu admin muốn role custom thì
        // tạo role mới với `isSystem=false` thay vì sửa system role.
        const patch: Record<string, unknown> = {};
        if (!existing.isSystem) patch.isSystem = true;
        if (existing.deletedAt) patch.deletedAt = null;
        const currentCodes = (existing.permissionCodes || []).slice().sort();
        const targetCodes = defaults.slice().sort();
        const codesDiffer =
          currentCodes.length !== targetCodes.length ||
          currentCodes.some((c, i) => c !== targetCodes[i]);
        if (codesDiffer) patch.permissionCodes = defaults;

        if (Object.keys(patch).length > 0) {
          await this.roleRepository.findOneAndUpdate({ _id: existing._id }, patch);
          // eslint-disable-next-line no-console
          console.log(
            `[role-seed] sync ${roleName} (${Object.keys(patch).join(', ')})${
              codesDiffer ? ` — ${defaults.length} codes` : ''
            }`,
          );
        }
      } catch (err) {
        // Don't crash app on seed race / duplicate key — the role exists, that's good enough.
        const isDup = (err as { code?: number })?.code === 11000;
        // eslint-disable-next-line no-console
        console.warn(`[role-seed] ${isDup ? 'duplicate' : 'error'} on ${roleName}:`, (err as Error).message);
      }
    }
  }

  public async createRole(createRoleDto: CreateRoleDto): Promise<RoleDocument> {
    const existing = await this.roleRepository.findOne({ name: createRoleDto.name });
    if (existing) throw new BadRequestException('Role name already exists');
    return this.roleRepository.create({ ...createRoleDto, isSystem: false });
  }

  async getRoles(getRolesDto: GetRolesDto): Promise<GetRolesResDto> {
    const { page, limit, status, sort, order } = getRolesDto;

    const query: Record<string, unknown> = {};
    if (status) query.status = status;

    return await this.roleRepository.findAllAndCount(query, {
      paging: {
        limit,
        skip: limit * (page - 1),
      },
      select: ['name', 'description', 'status', 'permissionIds', 'permissionCodes', 'isSystem'],
      sort: {
        [sort || 'createdAt']: order === 'asc' ? 1 : -1,
      },
    });
  }

  async findOneById(roleId: string): Promise<RoleDocument> {
    const role = await this.roleRepository.findOneById(roleId, { populate: { path: 'permissions' } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  public async updateRole(roleId: string, updateRoleDto: UpdateRoleDto): Promise<RoleDocument> {
    const role = await this.roleRepository.findOneByIdAndUpdate(roleId, { ...updateRoleDto });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  public async updatePermissions(roleId: string, dto: UpdateRolePermissionsDto): Promise<RoleDocument> {
    const role = await this.roleRepository.findOneById(roleId);
    if (!role) throw new NotFoundException('Role not found');

    const invalid = dto.codes.filter((c) => !ALL_PERMISSION_CODES.includes(c));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unknown permission code(s): ${invalid.join(', ')}`);
    }

    const updated = await this.roleRepository.findOneAndUpdate({ _id: roleId }, { permissionCodes: dto.codes });
    if (!updated) throw new NotFoundException('Role not found');
    return updated;
  }

  public async deleteRole(roleId: string): Promise<boolean> {
    const role = await this.roleRepository.findOneById(roleId);
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('Cannot delete system role');
    return this.roleRepository.softDelete({ _id: roleId });
  }

  /**
   * Reset a system role's permissionCodes back to its seed defaults.
   * Useful when admins want to undo customization.
   */
  public async resetPermissions(roleId: string): Promise<RoleDocument> {
    const role = await this.roleRepository.findOneById(roleId);
    if (!role) throw new NotFoundException('Role not found');
    const defaults = DEFAULT_ROLE_PERMISSIONS[role.name as RoleType];
    if (!defaults) throw new BadRequestException('No default preset for this role');
    const updated = await this.roleRepository.findOneAndUpdate({ _id: roleId }, { permissionCodes: defaults });
    if (!updated) throw new NotFoundException('Role not found');
    return updated;
  }
}

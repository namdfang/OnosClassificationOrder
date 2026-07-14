import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { generateHash } from 'core';
import type { Model } from 'mongoose';
import type {
  CreateDesignerTeamMemberDto,
  DesignerTeamMember,
  UpdateDesignerTeamMemberDto,
} from 'shared';
import { CODE_LENGTH, DESIGNER_ACTIVE_STATUSES, RoleType, Status } from 'shared';

import { genCode } from '@/utils';

import { OrderEntity } from '../order/order.entity';
import { RoleRepository } from '../role/role.repository';
import { UserEntity, UserDocument } from '../user/user.entity';

/**
 * Quản lý team designer (leader CRUD sub-designer). Identity model: `user._id`
 * là khoá duy nhất — Order.assignee = user._id (string). Không còn liên quan
 * workshop_config.
 *
 * Rule:
 *   - Email unique trong DB.
 *   - Block delete/disable nếu user còn task ở trạng thái active
 *     ({assigned, in-progress, rework}).
 */
@Injectable()
export class DesignerTeamService {
  constructor(
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>,
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    private readonly roleRepository: RoleRepository,
  ) {}

  async list(status?: Status): Promise<DesignerTeamMember[]> {
    const designerRole = await this.roleRepository.findOne({ name: RoleType.Designer });
    if (!designerRole) return [];

    const filter: Record<string, unknown> = { roleId: designerRole._id };
    if (status) filter.status = status;

    const users = await this.userModel.find(filter).lean();
    if (users.length === 0) return [];

    const userIds = users.map((u) => String(u._id));
    const [active, completed] = await Promise.all([
      this.countActiveTasksByUser(userIds),
      this.countCompletedTasksByUser(userIds),
    ]);

    return users
      .map((u) => ({
        _id: String(u._id),
        fullName: u.fullName,
        email: u.email,
        status: u.status,
        hireDate: u.hireDate,
        telegramChatId: u.telegramChatId,
        activeTaskCount: active.get(String(u._id)) || 0,
        completedTaskCount: completed.get(String(u._id)) || 0,
        createdAt: (u as { createdAt?: Date }).createdAt,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async create(dto: CreateDesignerTeamMemberDto): Promise<DesignerTeamMember> {
    const designerRole = await this.roleRepository.findOne({ name: RoleType.Designer });
    if (!designerRole) {
      throw new BadRequestException(
        'Role Designer chưa tồn tại — restart API để RoleService seed trước.',
      );
    }

    await this.assertEmailFree(dto.email, null);

    const passwordHash = generateHash(dto.password);
    const created = await this.userModel.create({
      fullName: dto.fullName,
      email: dto.email.toLowerCase(),
      password: passwordHash,
      roleId: designerRole._id,
      userCode: genCode(CODE_LENGTH),
      hireDate: dto.hireDate,
      telegramChatId: dto.telegramChatId,
      status: Status.Active,
    });

    const [member] = this.toTeamMembers([created.toObject() as UserDocument]);
    return member;
  }

  async update(userId: string, dto: UpdateDesignerTeamMemberDto): Promise<DesignerTeamMember> {
    const current = await this.userModel.findById(userId).lean();
    if (!current) throw new NotFoundException('Designer not found');

    const patch: Record<string, unknown> = {};

    if (dto.fullName) patch.fullName = dto.fullName;
    if (dto.email) {
      await this.assertEmailFree(dto.email, userId);
      patch.email = dto.email.toLowerCase();
    }
    if (dto.hireDate !== undefined) patch.hireDate = dto.hireDate;
    if (dto.telegramChatId !== undefined) patch.telegramChatId = dto.telegramChatId;
    if (dto.status) {
      if (dto.status !== Status.Active) {
        const activeCount = await this.orderModel.countDocuments({
          assignee: userId,
          designerStatus: { $in: DESIGNER_ACTIVE_STATUSES },
        });
        if (activeCount > 0) {
          throw new ConflictException(
            `Không tắt được account: còn ${activeCount} task active. Reassign hoặc hoàn thành trước.`,
          );
        }
      }
      patch.status = dto.status;
    }

    if (Object.keys(patch).length === 0) {
      const [member] = this.toTeamMembers([current as UserDocument]);
      return member;
    }

    const updated = await this.userModel.findByIdAndUpdate(userId, patch, { new: true }).lean();
    if (!updated) throw new NotFoundException('Designer not found');

    const [member] = this.toTeamMembers([updated as UserDocument]);
    return member;
  }

  async remove(userId: string): Promise<void> {
    const current = await this.userModel.findById(userId).lean();
    if (!current) throw new NotFoundException('Designer not found');

    const activeCount = await this.orderModel.countDocuments({
      assignee: userId,
      designerStatus: { $in: DESIGNER_ACTIVE_STATUSES },
    });
    if (activeCount > 0) {
      throw new ConflictException(
        `Không xoá được: user còn ${activeCount} task active. Reassign cho người khác trước.`,
      );
    }

    await this.userModel.updateOne(
      { _id: userId },
      { $set: { deletedAt: new Date(), status: Status.Inactive } },
    );
  }

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = generateHash(newPassword);
    const result = await this.userModel.updateOne(
      { _id: userId },
      { $set: { password: passwordHash, forcePassChange: true } },
    );
    if (result.matchedCount === 0) throw new NotFoundException('Designer not found');
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private async assertEmailFree(email: string, excludeUserId: string | null): Promise<void> {
    const filter: Record<string, unknown> = { email: email.toLowerCase() };
    if (excludeUserId) filter._id = { $ne: excludeUserId };
    const existing = await this.userModel.findOne(filter, { _id: 1 }).lean();
    if (existing) throw new ConflictException(`Email '${email}' đã được dùng.`);
  }

  private async countActiveTasksByUser(userIds: string[]): Promise<Map<string, number>> {
    return this.countTasksByUser(userIds, { $in: DESIGNER_ACTIVE_STATUSES });
  }

  private async countCompletedTasksByUser(userIds: string[]): Promise<Map<string, number>> {
    return this.countTasksByUser(userIds, 'done');
  }

  private async countTasksByUser(
    userIds: string[],
    designerStatusFilter: unknown,
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const agg = await this.orderModel.aggregate<{ _id: string; count: number }>([
      { $match: { assignee: { $in: userIds }, designerStatus: designerStatusFilter } },
      { $group: { _id: '$assignee', count: { $sum: 1 } } },
    ]);
    return new Map(agg.map((row) => [row._id, row.count]));
  }

  private toTeamMembers(users: UserDocument[]): DesignerTeamMember[] {
    // Single-user case (post-create/update) — skip aggregate, return zeros to avoid extra query.
    return users.map((u) => ({
      _id: String(u._id),
      fullName: u.fullName,
      email: u.email,
      status: u.status,
      hireDate: u.hireDate,
      telegramChatId: u.telegramChatId,
      activeTaskCount: 0,
      completedTaskCount: 0,
      createdAt: (u as { createdAt?: Date }).createdAt,
    }));
  }
}

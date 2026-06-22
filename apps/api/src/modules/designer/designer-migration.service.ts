import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RoleType } from 'shared';

import { RoleRepository } from '../role/role.repository';
import { UserEntity } from '../user/user.entity';

/**
 * Migration một lần khi rollout Designer Task Workflow Phase 1:
 *   - Tìm các user có role=Designer.
 *   - Nếu chỉ có 1 user → promote thành DesignerLeader + đổi email sang
 *     `designerLeader@onospod.com`.
 *   - Nếu nhiều user → trả về danh sách + skip (admin chọn tay).
 *
 * Idempotent: chạy lại không gây side effect (sau lần đầu, role hiện tại
 * không còn user nào là plain Designer).
 *
 * Trigger qua admin endpoint `POST /v1/designer/migrate-leader`.
 */
@Injectable()
export class DesignerMigrationService {
  private readonly log = new Logger(DesignerMigrationService.name);

  static readonly LEADER_EMAIL = 'designerleader@onospod.com';

  constructor(
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>,
    private readonly roleRepository: RoleRepository,
  ) {}

  async migrateLeader(): Promise<{
    status: 'promoted' | 'noop' | 'ambiguous';
    promotedUserId?: string;
    promotedEmailFrom?: string;
    candidates?: { _id: string; email: string; fullName: string }[];
    message: string;
  }> {
    const [designerRole, leaderRole] = await Promise.all([
      this.roleRepository.findOne({ name: RoleType.Designer }),
      this.roleRepository.findOne({ name: RoleType.DesignerLeader }),
    ]);

    if (!leaderRole) {
      return {
        status: 'noop',
        message: 'DesignerLeader role chưa tồn tại — boot lại API để RoleService seed trước.',
      };
    }
    if (!designerRole) {
      return { status: 'noop', message: 'Không có role Designer trong DB — không cần migrate.' };
    }

    const designerUsers = await this.userModel.find({ roleId: designerRole._id }).lean();
    if (designerUsers.length === 0) {
      return { status: 'noop', message: 'Không có user nào với role Designer — đã migrate hoặc chưa có ai.' };
    }
    if (designerUsers.length > 1) {
      return {
        status: 'ambiguous',
        message: `Có ${designerUsers.length} user với role Designer — vào /users sửa tay 1 user thành DesignerLeader rồi các user còn lại giữ Designer.`,
        candidates: designerUsers.map((u) => ({
          _id: String(u._id),
          email: String(u.email),
          fullName: String(u.fullName),
        })),
      };
    }

    const target = designerUsers[0];
    const oldEmail = String(target.email);

    await this.userModel.updateOne(
      { _id: target._id },
      {
        $set: {
          roleId: leaderRole._id,
          email: DesignerMigrationService.LEADER_EMAIL,
        },
      },
    );

    this.log.log(`[designer-migration] Promoted ${oldEmail} → DesignerLeader (${DesignerMigrationService.LEADER_EMAIL})`);

    return {
      status: 'promoted',
      promotedUserId: String(target._id),
      promotedEmailFrom: oldEmail,
      message: `Đã promote user ${oldEmail} → DesignerLeader. Email mới: ${DesignerMigrationService.LEADER_EMAIL}`,
    };
  }
}

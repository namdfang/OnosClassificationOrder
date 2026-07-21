import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CreateStageErrorDto,
  CreateWorkshopConfigDto,
  FulfillmentStage,
  GetWorkshopConfigsDto,
  GetWorkshopConfigsResDto,
  ReorderWorkshopConfigDto,
  StageErrorReworkTarget,
  UpdateStageErrorDto,
  UpdateWorkshopConfigDto,
  WorkshopConfig,
} from 'shared';
import {
  FULFILLMENT_STAGE_ORDER,
  FULFILLMENT_STAGES,
  RoleType,
  WORKSHOP_CONFIG_CATEGORIES,
  WORKSHOP_CONFIG_MODE,
  WorkshopConfigCategory,
} from 'shared';

import { WorkshopConfigEntity } from './workshop-config.entity';
import { WorkshopConfigRepository } from './workshop-config.repository';
import { WORKSHOP_CONFIG_SEED } from './workshop-config.seed';

@Injectable()
export class WorkshopConfigService implements OnModuleInit {
  constructor(
    private readonly repo: WorkshopConfigRepository,
    @InjectModel(WorkshopConfigEntity.name)
    private readonly model: Model<WorkshopConfigEntity>,
  ) {}

  async onModuleInit() {
    // One-shot cleanup: bỏ category 'assignee' khỏi DB. Sau khi Designer
    // Task Workflow Phase 6 chuyển sang dùng userId trực tiếp, category này
    // không còn ý nghĩa. `deleteMany` idempotent — boot lần 2 chỉ tốn 1 query
    // không-match.
    try {
      const r = await this.model.deleteMany({ category: 'assignee' as WorkshopConfigCategory });
      if (r.deletedCount && r.deletedCount > 0) {
        // eslint-disable-next-line no-console
        console.log(`[workshop-seed] dropped legacy 'assignee' category: ${r.deletedCount} rows`);
      }
    } catch (err) {
      console.warn('[workshop-seed] assignee cleanup failed:', (err as Error).message);
    }

    for (const item of WORKSHOP_CONFIG_SEED) {
      try {
        // withDeleted so soft-deleted rows don't trick us into inserting a
        // duplicate (the unique index ignores deletedAt).
        const existing = await this.repo.findOne({ category: item.category, code: item.code }, { withDeleted: true });
        if (!existing) {
          await this.repo.create({ ...item, isActive: true });
        } else {
          const patch: Record<string, unknown> = {};
          if (existing.deletedAt) patch.deletedAt = null;
          // Backfill errorSource cho row production_error đã tồn tại trước
          // khi Phase 1 thêm flag (idempotent — chỉ update khi DB chưa có).
          if (item.errorSource && !existing.errorSource) {
            patch.errorSource = item.errorSource;
          }
          if (Object.keys(patch).length > 0) {
            await this.repo.findOneAndUpdate({ _id: existing._id }, patch);
          }
        }
      } catch (err) {
        // Don't crash on dup-key races — the row exists, that's enough.

        console.warn(`[workshop-seed] ${item.category}/${item.code}: ${(err as Error).message}`);
      }
    }
  }

  async getAll(): Promise<Record<WorkshopConfigCategory, WorkshopConfig[]>> {
    const data = await this.repo.findAll({ isActive: true }, { sort: { category: 1, order: 1 } });
    const grouped = WORKSHOP_CONFIG_CATEGORIES.reduce(
      (acc, cat) => {
        acc[cat] = [];
        return acc;
      },
      {} as Record<WorkshopConfigCategory, WorkshopConfig[]>,
    );
    for (const item of data as unknown as WorkshopConfig[]) {
      grouped[item.category].push(item);
    }
    return grouped;
  }

  async list(dto: GetWorkshopConfigsDto): Promise<GetWorkshopConfigsResDto> {
    const filter: Record<string, unknown> = {};
    if (dto.category) filter.category = dto.category;
    if (typeof dto.isActive === 'boolean') filter.isActive = dto.isActive;

    const { data, total } = await this.repo.findAllAndCount(filter, {
      sort: { category: 1, order: 1 },
    });
    return { success: true, data, total };
  }

  async create(dto: CreateWorkshopConfigDto) {
    this.assertModeMatches(dto.category, dto);

    const existing = await this.repo.findOne({ category: dto.category, code: dto.code });
    if (existing) throw new BadRequestException('Code already exists in this category');

    const lastOrder = await this.repo.findAll(
      { category: dto.category },
      { sort: { order: -1 }, paging: { limit: 1, skip: 0 } },
    );
    const nextOrder = dto.order ?? (lastOrder[0]?.order ?? -1) + 1;

    return this.repo.create({
      ...dto,
      order: nextOrder,
      isActive: dto.isActive ?? true,
    });
  }

  async update(id: string, dto: UpdateWorkshopConfigDto) {
    const current = await this.repo.findOneById(id);
    if (!current) throw new NotFoundException('Workshop config not found');

    if (dto.code && dto.code !== current.code) {
      const dup = await this.repo.findOne({ category: current.category, code: dto.code });
      if (dup) throw new BadRequestException('Code already exists in this category');
    }

    this.assertModeMatches(current.category, { color: dto.color, icon: dto.icon });

    const updated = await this.repo.findOneAndUpdate({ _id: id }, dto);
    if (!updated) throw new NotFoundException('Workshop config not found');
    return updated;
  }

  async remove(id: string) {
    const current = await this.repo.findOneById(id);
    if (!current) throw new NotFoundException('Workshop config not found');

    await this.repo.softDelete({ _id: id });
    return { success: true };
  }

  async reorder(dto: ReorderWorkshopConfigDto) {
    for (const item of dto.items) {
      await this.repo.findOneAndUpdate({ _id: item.id, category: dto.category }, { order: item.order });
    }
    return { success: true };
  }

  /**
   * Hard-delete every row in a category and re-insert from seed. Used when the
   * admin wants the dropdown to match the seed list exactly (e.g. after a
   * cleanup), so manually-added or auto-created entries get wiped.
   */
  async resetCategory(category: WorkshopConfigCategory): Promise<{ removed: number; inserted: number }> {
    const removed = await this.model.deleteMany({ category });
    const seed = WORKSHOP_CONFIG_SEED.filter((s) => s.category === category);
    let inserted = 0;
    for (const item of seed) {
      try {
        await this.repo.create({ ...item, isActive: true });
        inserted++;
      } catch (err) {
        console.warn(`[workshop-reset] ${item.category}/${item.code}: ${(err as Error).message}`);
      }
    }
    return { removed: removed.deletedCount ?? 0, inserted };
  }

  /**
   * Group by (category, code), keep oldest doc (by createdAt asc + _id asc),
   * permanently delete the rest. Returns counts per category.
   */
  async dedupe(): Promise<{ scanned: number; removed: number; groups: number }> {
    const all = await this.model
      .find({}, { _id: 1, category: 1, code: 1, createdAt: 1 })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const seen = new Map<string, string>(); // key = category|code, value = kept _id
    const toDelete: unknown[] = [];

    for (const doc of all) {
      const key = `${doc.category}|${doc.code}`;
      if (seen.has(key)) {
        toDelete.push(doc._id);
      } else {
        seen.set(key, String(doc._id));
      }
    }

    if (toDelete.length > 0) {
      await this.model.deleteMany({ _id: { $in: toDelete } });
    }

    return { scanned: all.length, removed: toDelete.length, groups: seen.size };
  }

  // ─── Stage Error Catalog (danh mục lỗi theo công đoạn — QR) ────────────────
  // Row nằm trong category=production_error để reuse validate `setProductionError`
  // + resolve tên lỗi toàn hệ thống. Xem StageErrorCatalog.md.

  /**
   * Fulfillment → chỉ được thao tác trên stage CỦA MÌNH (lấy từ profile, bỏ qua
   * dto.stage). Role khác (Admin/Manager…) → dùng stage truyền vào.
   */
  private resolveOwnerStage(
    dtoStage: FulfillmentStage | undefined,
    user: { roleName?: RoleType; fulfillmentStage?: FulfillmentStage },
  ): FulfillmentStage {
    if (user.roleName === RoleType.Fulfillment) {
      if (!user.fulfillmentStage) {
        throw new ForbiddenException('Tài khoản Fulfillment chưa được gán công đoạn.');
      }
      return user.fulfillmentStage;
    }
    if (!dtoStage) throw new BadRequestException('Thiếu công đoạn sở hữu lỗi (stage).');
    return dtoStage;
  }

  /** Target phải là tool-check / designer / stage đứng TRƯỚC stage sở hữu. */
  private assertValidReworkTarget(ownerStage: FulfillmentStage, target: StageErrorReworkTarget) {
    if (target === 'tool-check' || target === 'designer') return;
    if (!FULFILLMENT_STAGES.includes(target)) throw new BadRequestException('reworkTarget không hợp lệ.');
    if (FULFILLMENT_STAGE_ORDER[target] >= FULFILLMENT_STAGE_ORDER[ownerStage]) {
      throw new BadRequestException('Công đoạn đẩy về phải đứng TRƯỚC công đoạn sở hữu lỗi.');
    }
  }

  private deriveErrorSource(target: StageErrorReworkTarget): 'designer' | 'factory' | 'tool-check' {
    if (target === 'tool-check' || target === 'designer') return target;
    return 'factory';
  }

  async listStageErrors(stage: FulfillmentStage): Promise<WorkshopConfig[]> {
    const data = await this.repo.findAll(
      { category: WorkshopConfigCategory.ProductionError, stage },
      { sort: { order: 1 } },
    );
    return data as unknown as WorkshopConfig[];
  }

  async createStageError(
    dto: CreateStageErrorDto,
    user: { roleName?: RoleType; fulfillmentStage?: FulfillmentStage },
  ): Promise<WorkshopConfig> {
    const stage = this.resolveOwnerStage(dto.stage, user);
    this.assertValidReworkTarget(stage, dto.reworkTarget);

    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Tên lỗi không được rỗng.');
    const dupName = await this.repo.findOne({
      category: WorkshopConfigCategory.ProductionError,
      stage,
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (dupName) throw new BadRequestException('Công đoạn này đã có lỗi cùng tên.');

    // Code tự sinh `se-<stage>-<n>` — đếm cả row soft-deleted để không đụng
    // unique index (category+code). Retry 1 lần nếu race dup-key.
    const prefix = `se-${stage}-`;
    const existing = await this.repo.findAll(
      { category: WorkshopConfigCategory.ProductionError, code: new RegExp(`^${prefix}\\d+$`) },
      { withDeleted: true },
    );
    let maxSeq = 0;
    for (const row of existing) {
      const n = Number(row.code.slice(prefix.length));
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }

    const lastOrder = await this.repo.findAll(
      { category: WorkshopConfigCategory.ProductionError, stage },
      { sort: { order: -1 }, paging: { limit: 1, skip: 0 } },
    );
    const base = {
      category: WorkshopConfigCategory.ProductionError,
      name,
      stage,
      reworkTarget: dto.reworkTarget,
      errorSource: this.deriveErrorSource(dto.reworkTarget),
      order: (lastOrder[0]?.order ?? -1) + 1,
      isActive: true,
    };
    try {
      return (await this.repo.create({ ...base, code: `${prefix}${maxSeq + 1}` })) as unknown as WorkshopConfig;
    } catch {
      return (await this.repo.create({ ...base, code: `${prefix}${maxSeq + 2}` })) as unknown as WorkshopConfig;
    }
  }

  /**
   * Lỗi đã thêm KHÔNG cho sửa tên/đích (QR đã in + đơn đã gán sẽ đổi nghĩa) —
   * CHỈ cho ẩn/hiện. Muốn "sửa" → ẩn lỗi cũ và thêm lỗi mới.
   */
  async updateStageError(
    id: string,
    dto: UpdateStageErrorDto,
    user: { roleName?: RoleType; fulfillmentStage?: FulfillmentStage },
  ): Promise<WorkshopConfig> {
    const current = await this.repo.findOneById(id);
    if (!current) throw new NotFoundException('Không tìm thấy lỗi.');
    const currentStage = (current as unknown as { stage?: FulfillmentStage }).stage;
    if (current.category !== WorkshopConfigCategory.ProductionError || !currentStage) {
      throw new BadRequestException('Chỉ thao tác được lỗi thuộc danh mục lỗi công đoạn.');
    }
    if (user.roleName === RoleType.Fulfillment && user.fulfillmentStage !== currentStage) {
      throw new ForbiddenException('Bạn chỉ thao tác được lỗi của công đoạn mình.');
    }

    const updated = await this.repo.findOneAndUpdate({ _id: id }, { isActive: dto.isActive });
    if (!updated) throw new NotFoundException('Không tìm thấy lỗi.');
    return updated as unknown as WorkshopConfig;
  }

  private assertModeMatches(category: WorkshopConfigCategory, payload: { color?: string; icon?: string }) {
    const mode = WORKSHOP_CONFIG_MODE[category];
    if (mode === 'color' && payload.icon && !payload.color) {
      throw new BadRequestException(`Category ${category} uses color, do not set icon only`);
    }
    if (mode === 'icon' && payload.color && !payload.icon) {
      throw new BadRequestException(`Category ${category} uses icon, do not set color only`);
    }
  }
}

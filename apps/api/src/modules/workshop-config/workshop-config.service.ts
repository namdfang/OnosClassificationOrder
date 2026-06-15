import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CreateWorkshopConfigDto,
  GetWorkshopConfigsDto,
  GetWorkshopConfigsResDto,
  ReorderWorkshopConfigDto,
  UpdateWorkshopConfigDto,
  WorkshopConfig,
} from 'shared';
import { WORKSHOP_CONFIG_CATEGORIES, WORKSHOP_CONFIG_MODE, WorkshopConfigCategory } from 'shared';

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
    for (const item of WORKSHOP_CONFIG_SEED) {
      try {
        // withDeleted so soft-deleted rows don't trick us into inserting a
        // duplicate (the unique index ignores deletedAt).
        const existing = await this.repo.findOne(
          { category: item.category, code: item.code },
          { withDeleted: true },
        );
        if (!existing) {
          await this.repo.create({ ...item, isActive: true });
        } else if (existing.deletedAt) {
          await this.repo.findOneAndUpdate({ _id: existing._id }, { deletedAt: null });
        }
      } catch (err) {
        // Don't crash on dup-key races — the row exists, that's enough.
        // eslint-disable-next-line no-console
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
    const nextOrder = dto.order ?? ((lastOrder[0]?.order ?? -1) + 1);

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

  private assertModeMatches(
    category: WorkshopConfigCategory,
    payload: { color?: string; icon?: string },
  ) {
    const mode = WORKSHOP_CONFIG_MODE[category];
    if (mode === 'color' && payload.icon && !payload.color) {
      throw new BadRequestException(`Category ${category} uses color, do not set icon only`);
    }
    if (mode === 'icon' && payload.color && !payload.icon) {
      throw new BadRequestException(`Category ${category} uses icon, do not set color only`);
    }
  }
}

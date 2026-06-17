import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateProductConfigDto,
  GetProductConfigsDto,
  GetProductConfigsResDto,
  ImportProductConfigDto,
  ImportProductConfigResDto,
  UpdateProductConfigDto,
} from 'shared';
import { WorkshopConfigCategory } from 'shared';

import { FactoryService } from '../factory/factory.service';
import { MachineTypeService } from '../machine-type/machine-type.service';
import { WorkshopConfigRepository } from '../workshop-config/workshop-config.repository';
import { ProductConfigRepository } from './product-config.repository';

@Injectable()
export class ProductConfigService {
  constructor(
    private readonly productConfigRepository: ProductConfigRepository,
    private readonly factoryService: FactoryService,
    private readonly machineTypeService: MachineTypeService,
    private readonly workshopConfigRepository: WorkshopConfigRepository,
  ) {}

  /**
   * Resolve a human-readable Vietnamese label (e.g. "Cotton Jersey",
   * "Polyester Jersey:", "Có Tool") to its workshop_config `code`. Tolerates
   * trailing punctuation and case differences so import data copied from
   * spreadsheets doesn't have to be sanitized first.
   */
  private async resolveWorkshopCode(
    category: WorkshopConfigCategory,
    label?: string,
  ): Promise<string | undefined> {
    if (!label) return undefined;
    const cleaned = label.replace(/[\s:.,;]+$/, '').trim();
    if (!cleaned) return undefined;
    // Case-insensitive exact match on `name`.
    const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = await this.workshopConfigRepository.findOne({
      category,
      name: { $regex: '^' + escaped + '$', $options: 'i' },
    });
    return found?.code;
  }

  async getProductConfigs(dto: GetProductConfigsDto): Promise<GetProductConfigsResDto> {
    const { page, limit, sort, order, search, factoryId, machineTypeId } = dto;
    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { shortName: { $regex: search, $options: 'i' } },
      ];
    }
    if (factoryId) filter.factoryId = factoryId;
    if (machineTypeId) filter.machineTypeId = machineTypeId;

    const { data, total } = await this.productConfigRepository.findAllAndCount(filter, {
      paging: { skip: limit * (page - 1), limit },
      sort: { [sort || 'createdAt']: order === 'asc' ? 1 : -1 },
      populate: [
        { path: 'factory', select: ['name', 'shortName'] },
        { path: 'machineType', select: ['name', 'shortName'] },
      ],
    });

    return { success: true, data, total };
  }

  async createProductConfig(dto: CreateProductConfigDto) {
    const factory = await this.factoryService.getFactory(dto.factoryId);
    if (!factory) throw new BadRequestException('Invalid factoryId');

    return this.productConfigRepository.create({ ...dto, shortName: dto.shortName.toUpperCase() });
  }

  async updateProductConfig(id: string, dto: UpdateProductConfigDto) {
    const p = await this.productConfigRepository.findOneAndUpdate(
      { _id: id },
      { ...dto, ...(dto.shortName ? { shortName: dto.shortName.toUpperCase() } : {}) },
    );
    if (!p) throw new NotFoundException('ProductConfig not found');
    return p;
  }

  async deleteProductConfig(id: string) {
    return this.productConfigRepository.softDelete({ _id: id });
  }

  async importProductConfigs(dto: ImportProductConfigDto): Promise<ImportProductConfigResDto> {
    const skipped: Array<{ row: number; reason: string }> = [];
    let imported = 0;
    let updated = 0;

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i];

      const factory = await this.factoryService.findByShortName(row.factoryCode);
      if (!factory) {
        skipped.push({ row: i + 1, reason: `Factory shortName '${row.factoryCode}' not found` });
        continue;
      }

      const machineType = await this.machineTypeService.findByShortName(row.machineCode);
      if (!machineType) {
        skipped.push({ row: i + 1, reason: `MachineType shortName '${row.machineCode}' not found` });
        continue;
      }

      const fabricCode = await this.resolveWorkshopCode(
        WorkshopConfigCategory.FabricType,
        row.fabricLabel,
      );
      if (row.fabricLabel && !fabricCode) {
        // Don't skip — just warn. The row still imports without fabric.
        skipped.push({
          row: i + 1,
          reason: `Loại vải "${row.fabricLabel}" không khớp workshop_config — bỏ qua field này`,
        });
      }
      const toolCode = await this.resolveWorkshopCode(
        WorkshopConfigCategory.ToolResult,
        row.toolResultLabel,
      );
      if (row.toolResultLabel && !toolCode) {
        skipped.push({
          row: i + 1,
          reason: `Kết quả Tool "${row.toolResultLabel}" không khớp workshop_config — bỏ qua field này`,
        });
      }

      const data = {
        fullName: row.fullName.trim(),
        shortName: row.shortName.trim().toUpperCase(),
        computerType: row.computerType?.trim() || undefined,
        machineTypeId: machineType._id,
        factoryId: factory._id,
        ...(fabricCode ? { fabricType: fabricCode } : {}),
        ...(toolCode ? { toolResult: toolCode } : {}),
      };

      const existing = await this.productConfigRepository.findOne({ fullName: data.fullName });
      if (existing) {
        await this.productConfigRepository.findOneAndUpdate({ _id: existing._id }, data);
        updated++;
      } else {
        await this.productConfigRepository.create(data);
        imported++;
      }
    }

    return { success: true, data: { imported, updated, skipped } };
  }
}

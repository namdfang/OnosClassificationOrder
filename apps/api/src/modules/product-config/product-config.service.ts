import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateProductConfigDto,
  GetProductConfigsDto,
  GetProductConfigsResDto,
  ImportProductConfigDto,
  ImportProductConfigResDto,
  UpdateProductConfigDto,
} from 'shared';

import { FactoryService } from '../factory/factory.service';
import { MachineTypeService } from '../machine-type/machine-type.service';
import { ProductConfigRepository } from './product-config.repository';

@Injectable()
export class ProductConfigService {
  constructor(
    private readonly productConfigRepository: ProductConfigRepository,
    private readonly factoryService: FactoryService,
    private readonly machineTypeService: MachineTypeService,
  ) {}

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

      const data = {
        fullName: row.fullName.trim(),
        shortName: row.shortName.trim().toUpperCase(),
        computerType: row.computerType?.trim() || undefined,
        machineTypeId: machineType._id,
        factoryId: factory._id,
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

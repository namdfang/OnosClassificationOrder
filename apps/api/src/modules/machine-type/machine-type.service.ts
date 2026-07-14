import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type {
  CreateMachineTypeDto,
  GetMachineTypesDto,
  GetMachineTypesResDto,
  MachineType,
  UpdateMachineTypeDto,
} from 'shared';

import { MachineTypeRepository } from './machine-type.repository';

const DEFAULT_MACHINE_TYPES: Array<Pick<MachineType, 'name' | 'shortName' | 'isActive'>> = [
  { name: 'In và cắt laser', shortName: 'ICL', isActive: true },
  { name: 'In và ép nhiệt', shortName: 'IEN', isActive: true },
  { name: 'Hàng thêu', shortName: 'HT', isActive: true },
];

@Injectable()
export class MachineTypeService implements OnModuleInit {
  constructor(private readonly machineTypeRepository: MachineTypeRepository) {}

  async onModuleInit() {
    for (const m of DEFAULT_MACHINE_TYPES) {
      const existing = await this.machineTypeRepository.findOne({ shortName: m.shortName });
      if (!existing) {
        await this.machineTypeRepository.create(m);
      }
    }
  }

  async getMachineTypes(dto: GetMachineTypesDto): Promise<GetMachineTypesResDto> {
    const { page, limit, sort, order, search, isActive } = dto;
    const filter: Record<string, unknown> = {};
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { shortName: { $regex: search, $options: 'i' } }];
    if (typeof isActive === 'boolean') filter.isActive = isActive;

    const { data, total } = await this.machineTypeRepository.findAllAndCount(filter, {
      paging: { skip: limit * (page - 1), limit },
      sort: { [sort || 'createdAt']: order === 'asc' ? 1 : -1 },
    });

    return { success: true, data, total };
  }

  async getMachineType(id: string) {
    const machineType = await this.machineTypeRepository.findOneById(id);
    if (!machineType) throw new NotFoundException('MachineType not found');
    return machineType;
  }

  async findByShortName(shortName: string) {
    return this.machineTypeRepository.findOne({ shortName: shortName.toUpperCase() });
  }

  /**
   * Match a free-text department/printer label ("IN và CẮT LASER") against
   * either `name` or `shortName`, case-insensitive.
   */
  async findByLabel(label: string) {
    const cleaned = label.trim();
    if (!cleaned) return null;
    const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byShortName = await this.machineTypeRepository.findOne({
      shortName: cleaned.toUpperCase(),
    });
    if (byShortName) return byShortName;
    return this.machineTypeRepository.findOne({
      name: { $regex: '^' + escaped + '$', $options: 'i' },
    });
  }

  async createMachineType(dto: CreateMachineTypeDto) {
    const existing = await this.machineTypeRepository.findOne({ shortName: dto.shortName.toUpperCase() });
    if (existing) throw new BadRequestException('MachineType shortName already exists');
    return this.machineTypeRepository.create({ ...dto, shortName: dto.shortName.toUpperCase(), isActive: dto.isActive ?? true });
  }

  async updateMachineType(id: string, dto: UpdateMachineTypeDto) {
    const m = await this.machineTypeRepository.findOneAndUpdate(
      { _id: id },
      { ...dto, ...(dto.shortName ? { shortName: dto.shortName.toUpperCase() } : {}) },
    );
    if (!m) throw new NotFoundException('MachineType not found');
    return m;
  }
}

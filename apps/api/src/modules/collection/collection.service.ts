import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCollectionDto, GetCollectionsDto, GetCollectionsResDto, UpdateCollectionDto } from 'shared';

import { CollectionRepository } from './collection.repository';

@Injectable()
export class CollectionService {
  constructor(private readonly collectionRepository: CollectionRepository) {}

  async getCollections(dto: GetCollectionsDto): Promise<GetCollectionsResDto> {
    const { page, limit, sort, order, search, isActive } = dto;
    const filter: Record<string, unknown> = {};
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { shortName: { $regex: search, $options: 'i' } }];
    if (typeof isActive === 'boolean') filter.isActive = isActive;

    const { data, total } = await this.collectionRepository.findAllAndCount(filter, {
      paging: { skip: limit * (page - 1), limit },
      sort: sort ? { [sort]: order === 'asc' ? 1 : -1 } : { sortOrder: 1, createdAt: -1 },
    });

    return { success: true, data, total };
  }

  async getCollection(id: string) {
    const collection = await this.collectionRepository.findOneById(id);
    if (!collection) throw new NotFoundException('Collection not found');
    return collection;
  }

  async createCollection(dto: CreateCollectionDto) {
    const existing = await this.collectionRepository.findOne({ shortName: dto.shortName.toUpperCase() });
    if (existing) throw new BadRequestException('Collection shortName already exists');
    return this.collectionRepository.create({
      ...dto,
      shortName: dto.shortName.toUpperCase(),
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
  }

  async updateCollection(id: string, dto: UpdateCollectionDto) {
    const collection = await this.collectionRepository.findOneAndUpdate(
      { _id: id },
      { ...dto, ...(dto.shortName ? { shortName: dto.shortName.toUpperCase() } : {}) },
    );
    if (!collection) throw new NotFoundException('Collection not found');
    return collection;
  }
}

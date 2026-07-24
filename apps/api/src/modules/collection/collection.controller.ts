import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateCollectionDto,
  CreateCollectionResDto,
  GetCollectionsDto,
  GetCollectionsResDto,
  RoleType,
  UpdateCollectionDto,
  UpdateCollectionResDto,
} from 'shared';

import { Auth } from '@/decorators';

import { CollectionService } from './collection.service';

@Controller('collections')
@ApiTags('collections')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Get()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Get collections' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCollectionsResDto })
  async getCollections(@Query() dto: GetCollectionsDto): Promise<GetCollectionsResDto> {
    return this.collectionService.getCollections(dto);
  }

  @Post()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Create collection' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateCollectionResDto })
  async createCollection(@Body() dto: CreateCollectionDto): Promise<CreateCollectionResDto> {
    return { success: true, data: await this.collectionService.createCollection(dto) };
  }

  @Patch(':id')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Update collection' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateCollectionResDto })
  async updateCollection(@Param('id') id: string, @Body() dto: UpdateCollectionDto): Promise<UpdateCollectionResDto> {
    return { success: true, data: await this.collectionService.updateCollection(id, dto) };
  }
}

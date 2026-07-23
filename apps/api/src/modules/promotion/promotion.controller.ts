import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreatePromotionDto,
  CreatePromotionResDto,
  DeletePromotionResDto,
  GetPromotionsDto,
  GetPromotionsResDto,
  PromotionStatsResDto,
  RoleType,
  UpdatePromotionDto,
  UpdatePromotionResDto,
} from 'shared';

import { Auth } from '@/decorators';

import { PromotionService } from './promotion.service';

@Controller('promotions')
@ApiTags('promotions')
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Get()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'List promotions' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetPromotionsResDto })
  async getPromotions(@Query() dto: GetPromotionsDto): Promise<GetPromotionsResDto> {
    return this.promotionService.getPromotions(dto);
  }

  @Get('stats')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Thống kê nhanh chương trình giảm giá' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PromotionStatsResDto })
  async getStats(): Promise<PromotionStatsResDto> {
    return this.promotionService.getStats();
  }

  @Post()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Create promotion' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreatePromotionResDto })
  async createPromotion(@Body() dto: CreatePromotionDto): Promise<CreatePromotionResDto> {
    return { success: true, data: await this.promotionService.createPromotion(dto) };
  }

  @Patch(':id')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Update promotion' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdatePromotionResDto })
  async updatePromotion(@Param('id') id: string, @Body() dto: UpdatePromotionDto): Promise<UpdatePromotionResDto> {
    return { success: true, data: await this.promotionService.updatePromotion(id, dto) };
  }

  @Delete(':id')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Delete promotion' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeletePromotionResDto })
  async deletePromotion(@Param('id') id: string): Promise<DeletePromotionResDto> {
    await this.promotionService.deletePromotion(id);
    return { success: true };
  }
}

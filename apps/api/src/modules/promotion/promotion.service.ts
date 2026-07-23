import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePromotionDto,
  GetPromotionsDto,
  GetPromotionsResDto,
  Promotion,
  PromotionStatsResDto,
  UpdatePromotionDto,
} from 'shared';
import { Status } from 'shared';

import { PromotionRepository } from './promotion.repository';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** MongoDB duplicate-key error E11000 từ unique index `code`. */
function isDuplicateCodeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: number; keyPattern?: Record<string, unknown>; message?: string };
  if (e.code !== 11000) return false;
  if (e.keyPattern?.code !== undefined) return true;
  return typeof e.message === 'string' && e.message.includes('index: code_1');
}

export type PromotionMatchParams = {
  productConfigId: string;
  productCategoryId?: string;
  tier?: number | null;
  quantity: number;
};

/** Áp dụng discount của 1 promotion lên giá gốc → giá sau giảm (không âm). */
export function applyPromotionDiscount(basePrice: number, promotion: Pick<Promotion, 'discountType' | 'discountValue'>): number {
  const discounted =
    promotion.discountType === 'percentage'
      ? basePrice - (basePrice * promotion.discountValue) / 100
      : basePrice - promotion.discountValue;
  return Math.max(0, Math.round(discounted * 100) / 100);
}

/** 1 promotion có khớp sản phẩm/tier/số lượng hay không (KHÔNG check ngày hiệu lực — caller lọc trước bằng query). */
export function promotionMatches(promotion: Promotion, params: PromotionMatchParams): boolean {
  if (promotion.scope === 'category' && promotion.scopeCategoryId !== params.productCategoryId) return false;
  if (promotion.scope === 'product' && !promotion.scopeProductConfigIds?.includes(params.productConfigId)) return false;
  if (promotion.applicableTiers?.length) {
    if (params.tier == null || !promotion.applicableTiers.includes(params.tier)) return false;
  }
  if (promotion.minQuantity && params.quantity < promotion.minQuantity) return false;
  return true;
}

@Injectable()
export class PromotionService {
  constructor(private readonly promotionRepository: PromotionRepository) {}

  async getPromotions(dto: GetPromotionsDto): Promise<GetPromotionsResDto> {
    const { page, limit, sort, order, search, status, scope, tier } = dto;
    const and: Record<string, unknown>[] = [];
    if (search) {
      and.push({ $or: [{ name: { $regex: search, $options: 'i' } }, { code: { $regex: search, $options: 'i' } }] });
    }
    if (status) and.push({ status });
    if (scope) and.push({ scope });
    if (tier !== undefined) {
      and.push({ $or: [{ applicableTiers: { $exists: false } }, { applicableTiers: { $size: 0 } }, { applicableTiers: tier }] });
    }
    const filter = and.length ? { $and: and } : {};

    const { data, total } = await this.promotionRepository.findAllAndCount(filter, {
      paging: { skip: limit * (page - 1), limit },
      sort: { [sort || 'createdAt']: order === 'asc' ? 1 : -1 },
    });

    return { success: true, data, total };
  }

  /** Danh sách promotion đang active + trong khoảng ngày hiệu lực — dùng để resolve giá catalog. */
  async getActiveInDateRange(): Promise<Promotion[]> {
    const now = new Date();
    return this.promotionRepository.findAll({
      status: Status.Active,
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: now } }] },
      ],
    });
  }

  async createPromotion(dto: CreatePromotionDto) {
    try {
      return await this.promotionRepository.create(dto);
    } catch (err) {
      if (isDuplicateCodeError(err)) throw new BadRequestException('Mã coupon đã tồn tại');
      throw err;
    }
  }

  async updatePromotion(id: string, dto: UpdatePromotionDto) {
    try {
      const p = await this.promotionRepository.findOneAndUpdate({ _id: id }, dto);
      if (!p) throw new NotFoundException('Promotion not found');
      return p;
    } catch (err) {
      if (isDuplicateCodeError(err)) throw new BadRequestException('Mã coupon đã tồn tại');
      throw err;
    }
  }

  async deletePromotion(id: string) {
    return this.promotionRepository.softDelete({ _id: id });
  }

  async getStats(): Promise<PromotionStatsResDto> {
    const all = await this.promotionRepository.findAll({});
    const now = new Date();
    const soon = new Date(now.getTime() + SEVEN_DAYS_MS);
    const byTier: Record<string, number> = {};
    let active = 0;
    let expiringSoon = 0;
    for (const p of all) {
      if (p.status === Status.Active) {
        active++;
        if (p.endDate && p.endDate <= soon && p.endDate >= now) expiringSoon++;
      }
      const tiers = p.applicableTiers?.length ? p.applicableTiers : ['all'];
      for (const t of tiers) byTier[String(t)] = (byTier[String(t)] || 0) + 1;
    }
    return { success: true, data: { total: all.length, active, expiringSoon, byTier } };
  }
}

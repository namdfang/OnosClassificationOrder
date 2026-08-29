import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  GetZaloGroupLinksDto,
  SyncZaloGroupsDto,
  UpdateZaloGroupLinkDto,
  ZaloGroupSuggestion,
} from 'shared';
import { ZaloGroupKind } from 'shared';

import { CustomerEntity } from '../customer/customer.entity';
import { ZaloGroupRepository } from './zalo-group.repository';
import type { ZaloGroupLinkDocument } from './zalo-group-link.entity';
import { ZaloGroupLinkEntity } from './zalo-group-link.entity';

/** Điểm cắt của gợi ý — dưới ngưỡng này thì đoán bừa hại hơn là không đoán. */
const SUGGESTION_MIN_SCORE = 0.5;
/** Trần số gợi ý trả về một lượt: đây là danh sách để người DUYỆT, không phải để cuộn. */
const SUGGESTION_LIMIT = 200;

@Injectable()
export class ZaloGroupService {
  constructor(
    private readonly zaloGroupRepository: ZaloGroupRepository,
    @InjectModel(ZaloGroupLinkEntity.name) private readonly zaloGroupLinkModel: Model<ZaloGroupLinkEntity>,
    @InjectModel(CustomerEntity.name) private readonly customerModel: Model<CustomerEntity>,
  ) {}

  /**
   * Nạp nhóm từ engine Zalo (`onosceo`) vào OnosFactory.
   *
   * Người gọi đã gộp dòng hội thoại theo `groupGlobalId` trước khi gửi sang —
   * xem `ZaloGroupSnapshot`. Ở đây chỉ upsert theo khoá đó.
   *
   * Đồng bộ KHÔNG bao giờ đụng tới `kind`/`customerId`/`ownerUserId`: đó là
   * công người vận hành bỏ ra, chạy lại đồng bộ mà xoá mất thì không ai dám
   * chạy lần hai. Chỉ ghi đè phần đọc từ Zalo (tiêu đề, nick, mốc tin).
   */
  async syncGroups(dto: SyncZaloGroupsDto): Promise<{ created: number; updated: number; rawConversations: number }> {
    let created = 0;
    let updated = 0;
    let rawConversations = 0;

    for (const g of dto.groups) {
      rawConversations += g.conversationIds?.length ?? 0;

      const res = await this.zaloGroupLinkModel.updateOne(
        { groupGlobalId: g.groupGlobalId },
        {
          $set: {
            title: g.title,
            conversationIds: g.conversationIds ?? [],
            memberNicks: g.memberNicks ?? [],
            ...(g.lastMessageAt ? { lastMessageAt: g.lastMessageAt } : {}),
            syncedAt: new Date(),
          },
          // Chỉ đặt lúc TẠO MỚI. Nhóm đã được xét rồi thì lần đồng bộ sau không
          // được kéo ngược về 'chưa xét'.
          $setOnInsert: { kind: ZaloGroupKind.Unreviewed },
        },
        { upsert: true },
      );

      if (res.upsertedCount > 0) created += 1;
      else if (res.matchedCount > 0) updated += 1;
    }

    return { created, updated, rawConversations };
  }

  async getGroups(dto: GetZaloGroupLinksDto): Promise<{ data: ZaloGroupLinkDocument[]; total: number }> {
    const filter: Record<string, unknown> = {};

    if (dto.kind) filter.kind = dto.kind;
    if (dto.customerId) filter.customerId = dto.customerId;
    if (typeof dto.unlinked === 'boolean') {
      filter.customerId = dto.unlinked ? { $in: [null, ''] } : { $nin: [null, ''] };
    }
    if (dto.search?.trim()) {
      filter.title = { $regex: escapeRegex(dto.search.trim()), $options: 'i' };
    }

    const { page, limit, sort, order } = dto;

    const { data, total } = await this.zaloGroupRepository.findAllAndCount<ZaloGroupLinkDocument>(filter, {
      paging: { skip: limit * (page - 1), limit },
      // Mặc định xếp nhóm có tin mới nhất lên đầu — đó là nhóm đang chạy, cần
      // gắn trước; nhóm chết nằm cuối cũng không ai vội.
      sort: { [sort || 'lastMessageAt']: order === 'asc' ? 1 : -1 },
    });

    return { data, total };
  }

  /**
   * Gắn / gỡ / đổi phân loại một nhóm.
   *
   * Ràng buộc nghiệp vụ đặt ở đây chứ không ở DTO vì nó liên quan hai trường:
   * `kind='seller'` mà không có khách thì bản ghi vô nghĩa — nhóm nằm trong
   * diện phân tích doanh thu nhưng không quy được về ai.
   */
  async updateLink(id: string, dto: UpdateZaloGroupLinkDto, userId: string): Promise<ZaloGroupLinkDocument> {
    const before = await this.zaloGroupRepository.findOneById<ZaloGroupLinkDocument>(id);
    if (!before) throw new NotFoundException('Không tìm thấy nhóm Zalo.');

    const nextKind = dto.kind ?? before.kind;
    const nextCustomerId = dto.customerId === undefined ? before.customerId : dto.customerId;

    if (nextKind === ZaloGroupKind.Seller && !nextCustomerId) {
      throw new BadRequestException("Nhóm khách phải gắn với một khách hàng — chọn khách hoặc đổi sang phân loại khác.");
    }
    if (nextKind !== ZaloGroupKind.Seller && nextCustomerId) {
      throw new BadRequestException('Chỉ nhóm khách mới gắn được khách hàng — gỡ khách trước khi đổi phân loại.');
    }

    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};

    if (dto.kind !== undefined) set.kind = dto.kind;
    if (dto.note !== undefined) {
      if (dto.note === null) unset.note = '';
      else set.note = dto.note;
    }
    if (dto.ownerUserId !== undefined) {
      if (dto.ownerUserId === null) unset.ownerUserId = '';
      else set.ownerUserId = dto.ownerUserId;
    }

    if (dto.customerId !== undefined) {
      if (dto.customerId === null) {
        unset.customerId = '';
        unset.userSku = '';
        unset.linkedAt = '';
        unset.linkedByUserId = '';
      } else {
        const customer = await this.customerModel.findById(dto.customerId).select('userSku').lean();
        if (!customer) throw new NotFoundException('Không tìm thấy khách hàng.');
        set.customerId = dto.customerId;
        // Chụp `userSku` ngay lúc gắn — báo cáo nối nhóm ↔ đơn đi qua trường này.
        set.userSku = (customer as { userSku?: string }).userSku ?? '';
        set.linkedAt = new Date();
        set.linkedByUserId = userId;
      }
    }

    const updated = await this.zaloGroupLinkModel.findOneAndUpdate(
      { _id: id },
      {
        ...(Object.keys(set).length > 0 ? { $set: set } : {}),
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Không tìm thấy nhóm Zalo.');

    return updated;
  }

  /**
   * Đoán nhóm nào thuộc khách nào bằng cách soi TÊN NHÓM.
   *
   * Cố ý chỉ đoán, không tự gắn. Tên nhóm Zalo do người đặt tay nên đủ kiểu
   * ("OnosPod/ 2026/ GIANG/ KL/ TOPUP", "BOD - Lenful/VIP"); gắn tự động là
   * sớm muộn cũng quy nhầm doanh thu sang khách khác, mà sai kiểu đó rất khó
   * phát hiện. Người duyệt nhanh hơn nhiều so với người đi dò 147 nhóm.
   */
  async getSuggestions(): Promise<ZaloGroupSuggestion[]> {
    const [groups, customers] = await Promise.all([
      this.zaloGroupLinkModel
        .find({ kind: ZaloGroupKind.Unreviewed, customerId: { $in: [null, ''] } })
        .select('groupGlobalId title')
        .lean(),
      this.customerModel.find({ userSku: { $nin: [null, ''] } }).select('userSku fullName').lean(),
    ]);

    const out: ZaloGroupSuggestion[] = [];

    for (const g of groups) {
      const title = String((g as { title?: string }).title ?? '');
      if (!title.trim()) continue;
      const haystack = normalize(title);

      let best: ZaloGroupSuggestion | undefined;

      for (const c of customers) {
        const sku = String((c as { userSku?: string }).userSku ?? '').trim();
        if (!sku) continue;

        const name = String((c as { fullName?: string }).fullName ?? '').trim();
        let score = 0;
        let reason = '';

        if (haystack.includes(normalize(sku))) {
          // Mã dài khớp nguyên thì gần như chắc chắn; mã 3-4 ký tự dễ trùng
          // ngẫu nhiên trong một câu tiếng Việt nên hạ điểm.
          score = sku.length >= 6 ? 0.95 : 0.6;
          reason = `Tên nhóm chứa mã khách "${sku}"`;
        } else if (name.length >= 5 && haystack.includes(normalize(name))) {
          score = 0.7;
          reason = `Tên nhóm chứa tên khách "${name}"`;
        }

        if (score >= SUGGESTION_MIN_SCORE && (!best || score > best.score)) {
          best = {
            groupGlobalId: String((g as { groupGlobalId: string }).groupGlobalId),
            title,
            customerId: String((c as { _id: unknown })._id),
            userSku: sku,
            customerName: name || undefined,
            score,
            reason,
          };
        }
      }

      if (best) out.push(best);
    }

    return out.sort((a, b) => b.score - a.score).slice(0, SUGGESTION_LIMIT);
  }

  /** Bảng phủ sóng: còn bao nhiêu nhóm chưa xét, bao nhiêu khách chưa có nhóm. */
  async getCoverage(): Promise<{
    totalGroups: number;
    byKind: Record<string, number>;
    linkedGroups: number;
    customersWithGroup: number;
    customersWithoutGroup: number;
    totalCustomers: number;
  }> {
    const [byKindRaw, totalGroups, linkedGroups, linkedCustomerIds, totalCustomers] = await Promise.all([
      this.zaloGroupLinkModel.aggregate<{ _id: string; n: number }>([
        { $match: { deletedAt: { $exists: false } } },
        { $group: { _id: '$kind', n: { $sum: 1 } } },
      ]),
      this.zaloGroupLinkModel.countDocuments({ deletedAt: { $exists: false } }),
      this.zaloGroupLinkModel.countDocuments({ kind: ZaloGroupKind.Seller, customerId: { $nin: [null, ''] } }),
      this.zaloGroupLinkModel.distinct('customerId', { customerId: { $nin: [null, ''] } }),
      this.customerModel.countDocuments({ deletedAt: { $exists: false } }),
    ]);

    const byKind: Record<string, number> = {};
    for (const row of byKindRaw) byKind[row._id] = row.n;

    const customersWithGroup = linkedCustomerIds.length;

    return {
      totalGroups,
      byKind,
      linkedGroups,
      customersWithGroup,
      customersWithoutGroup: Math.max(0, totalCustomers - customersWithGroup),
      totalCustomers,
    };
  }
}

/** Bỏ dấu + thường hoá để so tên nhóm với mã/tên khách. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { GetZaloIdentitiesDto, SyncZaloIdentitiesDto, UpdateZaloIdentityDto } from 'shared';
import { ZaloIdentityKind } from 'shared';

import type { ZaloIdentityDocument } from './zalo-identity.entity';
import { ZaloIdentityEntity } from './zalo-identity.entity';
import { doanPhanLoai as doanPhanLoaiThuan } from './zalo-identity.logic';

@Injectable()
export class ZaloIdentityService {
  constructor(
    @InjectModel(ZaloIdentityEntity.name)
    private readonly identityModel: Model<ZaloIdentityEntity>,
  ) {}

  /**
   * Nạp người gửi từ engine và GIEO đề xuất phân loại.
   *
   * Đề xuất dựa trên bằng chứng đếm được, không phải đoán từ tên: người trực
   * nhiều nhóm là nhân viên, người chỉ ở một nhóm là khách. Đo trên dữ liệu
   * thật 30/08 (262 người gửi / 147 nhóm): 23 người ở ≥5 nhóm — không ai là
   * khách; 184 người ở đúng 1 nhóm — đều là khách.
   *
   * KHÔNG bao giờ ghi đè `kind` của bản ghi người đã xác nhận. Đồng bộ mà xoá
   * công người duyệt thì lần sau không ai dám chạy.
   */
  async sync(dto: SyncZaloIdentitiesDto): Promise<{ created: number; updated: number; suggested: number }> {
    let created = 0;
    let updated = 0;
    let suggested = 0;

    for (const it of dto.identities) {
      const goiY = this.doanPhanLoai(it.groupCount, it.laTaiKhoanCongTy);
      if (goiY !== ZaloIdentityKind.Unknown) suggested += 1;

      const res = await this.identityModel.updateOne(
        { zaloUid: it.zaloUid },
        {
          $set: {
            displayName: it.displayName,
            groupCount: it.groupCount,
            messageCount: it.messageCount,
            suggestedKind: goiY,
            syncedAt: new Date(),
          },
          // `kind` chỉ đặt lúc TẠO MỚI. Người đã xác nhận rồi thì đồng bộ sau
          // không được kéo ngược về đề xuất của máy.
          $setOnInsert: { kind: ZaloIdentityKind.Unknown },
        },
        { upsert: true },
      );

      if (res.upsertedCount > 0) created += 1;
      else if (res.matchedCount > 0) updated += 1;
    }

    return { created, updated, suggested };
  }

  /** Đề xuất phân loại từ bằng chứng đếm được. */
  /** Uỷ quyền cho hàm thuần ở `zalo-identity.logic.ts` (kiểm thử được). */
  private doanPhanLoai(groupCount: number, laTaiKhoanCongTy?: boolean): ZaloIdentityKind {
    return doanPhanLoaiThuan(groupCount, laTaiKhoanCongTy);
  }


  /**
   * Áp hàng loạt đề xuất của máy cho những người CHƯA ai xác nhận.
   *
   * Nút này để dọn nhanh phần chắc chắn (23 nhân viên + 184 khách), còn phần
   * mập mờ vẫn nằm lại chờ người xét từng dòng.
   */
  async applySuggestions(userId: string): Promise<{ applied: number }> {
    const res = await this.identityModel.updateMany(
      {
        confirmedAt: { $exists: false },
        suggestedKind: { $exists: true, $ne: ZaloIdentityKind.Unknown },
      },
      [
        {
          $set: {
            kind: '$suggestedKind',
            confirmedAt: new Date(),
            confirmedByUserId: userId,
          },
        },
      ],
    );

    return { applied: res.modifiedCount };
  }

  async list(dto: GetZaloIdentitiesDto): Promise<{ data: ZaloIdentityDocument[]; total: number }> {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (dto.kind) filter.kind = dto.kind;
    if (dto.chuaXacNhan) filter.confirmedAt = { $exists: false };
    if (dto.search?.trim()) {
      const q = dto.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.displayName = { $regex: q, $options: 'i' };
    }

    const { page, limit } = dto;
    const [data, total] = await Promise.all([
      this.identityModel
        .find(filter)
        // Chưa xác nhận lên trước, trong đó người nhiều nhóm nhất lên đầu — xét
        // họ trước thì mỗi lượt xét gỡ được nhiều tin nhắn nhất.
        .sort({ confirmedAt: 1, groupCount: -1 })
        .skip(limit * (page - 1))
        .limit(limit)
        .lean(),
      this.identityModel.countDocuments(filter),
    ]);

    return { data: data as ZaloIdentityDocument[], total };
  }

  async update(zaloUid: string, dto: UpdateZaloIdentityDto, userId: string): Promise<ZaloIdentityDocument> {
    const set: Record<string, unknown> = {
      kind: dto.kind,
      confirmedAt: new Date(),
      confirmedByUserId: userId,
    };
    const unset: Record<string, ''> = {};

    if (dto.userId !== undefined) {
      if (dto.userId === null) unset.userId = '';
      else set.userId = dto.userId;
    }
    if (dto.customerId !== undefined) {
      if (dto.customerId === null) unset.customerId = '';
      else set.customerId = dto.customerId;
    }

    const updated = await this.identityModel.findOneAndUpdate(
      { zaloUid },
      {
        $set: set,
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Không tìm thấy định danh Zalo này.');

    return updated;
  }

  /**
   * Bảng tra uid → phân loại, cho bước dựng đoạn chat.
   *
   * Trả cả `displayName` để nhãn trong chat vẫn có tên người, kể cả khi bản
   * ghi chưa ai xác nhận.
   */
  async mapByUid(uids: string[]): Promise<Map<string, { kind: ZaloIdentityKind; displayName?: string }>> {
    if (uids.length === 0) return new Map();

    const rows = await this.identityModel
      .find({ zaloUid: { $in: uids } })
      .select('zaloUid kind displayName')
      .lean();

    return new Map(rows.map((r) => [String(r.zaloUid), { kind: r.kind, displayName: r.displayName }]));
  }

  /** Đếm nhanh cho bảng phủ sóng. */
  async counts(): Promise<Record<string, number>> {
    const rows = await this.identityModel.aggregate<{ _id: string; n: number }>([
      { $match: { deletedAt: { $exists: false } } },
      { $group: { _id: '$kind', n: { $sum: 1 } } },
    ]);
    const out: Record<string, number> = {};
    for (const r of rows) out[r._id] = r.n;
    out.chuaXacNhan = await this.identityModel.countDocuments({ confirmedAt: { $exists: false } });

    return out;
  }
}

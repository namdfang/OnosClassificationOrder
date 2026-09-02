import { Inject, Injectable } from '@nestjs/common';
import type { AgentSellerSupportItem, AgentSellerSupportQuery } from 'shared';
import { AGENT_TOM_TAT_HAN_GIO } from 'shared';

import { AgentApiRepository } from './agent-api.repository';

/**
 * Một lệnh gọi trả đủ mọi thứ agent cần để trả lời thay chủ tịch — thay cho
 * việc agent tự ghép 4 bảng mỗi lần hỏi.
 *
 * Vì sao gộp: trước đó agent phải đọc `zalo_group_summaries`, rồi `customers`,
 * rồi `orders`, rồi `productConfigs`, và phải đọc thêm tài liệu mới biết ghép
 * thế nào. Bốn vòng gọi cho một câu hỏi, và mỗi chỗ ghép sai là một câu trả lời
 * sai gửi tới khách.
 *
 * CHỐT RIÊNG TƯ: nguồn là `zalo_group_summaries`, mà bảng đó theo thiết kế chỉ
 * chứa nhóm `seller`/`operation` — tóm tắt bị XOÁ khi nhóm bị đổi sang `internal`.
 * Nên nhóm cá nhân của nhân viên không bao giờ lọt ra đây. Ràng buộc này nằm ở
 * khâu GHI chứ không phải ở tài liệu, nên không thể quên áp dụng.
 */
@Injectable()
export class AgentSellerSupportService {
  constructor(@Inject(AgentApiRepository) private readonly repo: AgentApiRepository) {}

  async list(q: AgentSellerSupportQuery): Promise<AgentSellerSupportItem[]> {
    const gioiHan = Math.min(Math.max(q.limit ?? 50, 1), 200);

    const dieuKien: Record<string, unknown> = {};
    if (q.mucDo) dieuKien.mucDo = q.mucDo;
    if (q.userSku) dieuKien.userSku = q.userSku;

    const tomTat = await this.repo.find({
      collection: 'zalo_group_summaries',
      filter: dieuKien,
      projection: {},
      sort: { updatedAt: -1 },
      limit: gioiHan,
      skip: 0,
      maxTimeMS: 20_000,
    });

    if (!tomTat.length) return [];

    // Phân loại nhóm nằm ở bảng liên kết, không ở bản tóm tắt.
    const gids = tomTat.map((t) => String(t.groupGlobalId));
    const links = await this.repo.find({
      collection: 'zalo_group_links',
      filter: { groupGlobalId: { $in: gids } },
      projection: { groupGlobalId: 1, kind: 1, title: 1, customerId: 1, lastMessageAt: 1 },
      sort: {},
      limit: gids.length,
      skip: 0,
      maxTimeMS: 20_000,
    });
    const theoGid = new Map(links.map((l) => [String(l.groupGlobalId), l]));

    const skus = [...new Set(tomTat.map((t) => t.userSku).filter(Boolean).map(String))];
    const soLieu = skus.length ? await this.thongKeDon(skus) : new Map();
    const sanPham = skus.length && q.kemSanPham !== false ? await this.sanPhamHay(skus) : new Map();

    const bayGio = Date.now();

    return tomTat.map((t) => {
      const gid = String(t.groupGlobalId);
      const chotLuc = (t.tomTatLuc ?? t.updatedAt) as Date | undefined;
      const link = theoGid.get(gid) ?? {};
      const sku = t.userSku ? String(t.userSku) : null;

      return {
        groupGlobalId: gid,
        title: (link.title as string) ?? (t.title as string) ?? null,
        kind: (link.kind as string) ?? null,
        lastMessageAt: (link.lastMessageAt as Date) ?? null,
        customerId: (t.customerId as string) ?? (link.customerId as string) ?? null,
        userSku: sku,
        tomTat: {
          mucDo: (t.mucDo as string) ?? null,
          tieuDe: (t.tieuDe as string) ?? null,
          khachQuanTam: (t.khachQuanTam as string) ?? null,
          salePhanHoi: (t.salePhanHoi as string) ?? null,
          tonDong: (t.tonDong as string) ?? null,
          nghiNgo: (t.nghiNgo as string[]) ?? [],
          checklist: (t.checklist as unknown[]) ?? [],
          soTin: (t.soTin as number) ?? 0,
          // Agent PHẢI xem mốc này trước khi tin: tóm tắt có thể cũ nhiều ngày
          // nếu lịch chạy hỏng, mà hỏng thì im lặng chứ không báo lỗi.
          tomTatLuc: (chotLuc as Date) ?? null,
          // Tính SẴN ở máy chủ thay vì để client tự so mốc — so mốc là thứ dễ
          // quên nhất, mà quên thì agent trả lời khách bằng dữ liệu cũ.
          tomTatTre: chotLuc
            ? bayGio - new Date(chotLuc).getTime() > AGENT_TOM_TAT_HAN_GIO * 3_600_000
            : true,
          denMocTin: (t.denMocTin as Date) ?? null,
        },
        donHang: sku ? (soLieu.get(sku) ?? null) : null,
        sanPhamHay: sku ? (sanPham.get(sku) ?? []) : [],
      } as AgentSellerSupportItem;
    });
  }

  /**
   * Số liệu đơn SỐNG, đọc thẳng lúc gọi — khác bản tóm tắt vốn là ảnh chụp lúc
   * mô hình chạy. Áp đúng bộ lọc chuẩn của repo: bỏ đơn huỷ và đơn chưa map xưởng.
   */
  private async thongKeDon(skus: string[]): Promise<Map<string, unknown>> {
    const moc = new Date();
    const rows = await this.repo.aggregate({
      collection: 'orders',
      pipeline: [
        { $match: { userSku: { $in: skus }, cancelledAt: null, factoryId: { $ne: null } } },
        {
          $group: {
            _id: '$userSku',
            tongDon: { $sum: 1 },
            // `$ifNull` là BẮT BUỘC: nhiều đơn KHÔNG CÓ trường `heldAt` /
            // `productionError` / `fulfillmentCompletedAt` chứ không phải bằng
            // null. Trong biểu thức gộp, trường thiếu KHÔNG bằng null — bỏ
            // `$ifNull` thì `$eq` sai ở mọi dòng và `$ne` đúng ở mọi dòng.
            // Đã dẫm phải: báo 4.496 đơn "đang giữ" trong khi thực tế là 0.
            dangLam: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$fulfillmentCompletedAt', null] }, null] }, 1, 0] } },
            dangLoi: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [{ $ifNull: ['$productionError', null] }, null] },
                      { $ne: [{ $ifNull: ['$productionError', ''] }, ''] },
                      { $eq: [{ $ifNull: ['$fulfillmentCompletedAt', null] }, null] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            dangGiu: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$heldAt', null] }, null] }, 1, 0] } },
            vaoSxSomNhat: {
              $min: {
                $cond: [
                  { $eq: [{ $ifNull: ['$fulfillmentCompletedAt', null] }, null] },
                  { $ifNull: ['$inProductionAt', null] },
                  null,
                ],
              },
            },
          },
        },
      ],
      maxTimeMS: 25_000,
    });

    return new Map(
      rows.map((r) => {
        const som = r.vaoSxSomNhat ? new Date(r.vaoSxSomNhat as string) : null;

        return [
          String(r._id),
          {
            tongDon: r.tongDon,
            dangLam: r.dangLam,
            dangLoi: r.dangLoi,
            dangGiu: r.dangGiu,
            // Đơn tồn lâu nhất — con số chủ tịch hỏi đầu tiên khi khách kêu.
            tonLauNhatNgay: som ? Math.floor((moc.getTime() - som.getTime()) / 86_400_000) : null,
          },
        ];
      }),
    );
  }

  /** Sản phẩm khách đặt nhiều nhất 30 ngày — để trả lời được ngay chuyện hàng hoá. */
  private async sanPhamHay(skus: string[]): Promise<Map<string, unknown[]>> {
    const tu = new Date(Date.now() - 30 * 86_400_000);
    const rows = await this.repo.aggregate({
      collection: 'orders',
      pipeline: [
        { $match: { userSku: { $in: skus }, cancelledAt: null, orderAt: { $gte: tu } } },
        { $group: { _id: { sku: '$userSku', sp: '$type' }, soDon: { $sum: 1 } } },
        { $sort: { soDon: -1 } },
        { $group: { _id: '$_id.sku', top: { $push: { sanPham: '$_id.sp', soDon: '$soDon' } } } },
      ],
      maxTimeMS: 25_000,
    });

    return new Map(rows.map((r) => [String(r._id), ((r.top as unknown[]) ?? []).slice(0, 5)]));
  }
}

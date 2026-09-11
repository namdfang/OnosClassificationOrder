import { createHmac } from 'node:crypto';

import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import type { AgentZaloMessage } from 'shared';
import { AGENT_ZALO_INBOUND_CONFIG_KEY } from 'shared';

import { ApiConfigService } from '@/shared/services/api-config.service';

import { SystemConfigService } from '../system-config/system-config.service';
import { nhomDuocNghe, suyVai } from './agent-zalo-inbound.logic';
import { LY_DO_CHAN } from './agent-zalo-send.logic';

const HAN_GIAY = 15;

/** Hình dạng blob `system_configs` — khai ở đây vì chỉ hai service này đọc nó. */
export interface CauHinhNgheZalo {
  /**
   * TẬP uid của Chủ tịch — điều kiện kích hoạt (a). Nhiều uid vì uid Zalo phụ
   * thuộc nick đang nhìn (xem `agent-zalo-inbound.logic.ts`). Đây là đường ghi
   * đè bằng tay, dùng chung với `zalo_identities.kind='chairman'`.
   */
  chairmanZaloUids?: string[];
  /**
   * TẬP uid của các nick TRỢ LÝ AI, nhìn từ phía người khác — điều kiện (b).
   *
   * Cùng lý do nhiều uid như trên. Không suy ra được từ `zalo_accounts`: uid ở
   * bảng đó là uid nick tự nhìn mình, còn `mentions[].uid` là uid người khác
   * thấy — hai không gian khác nhau.
   */
  agentNickZaloUids?: string[];
  /** Bên nhận webhook đã lọc. Nhiều bên vì có thể có agent điều phối lẫn agent nghiệp vụ. */
  subscribers?: Array<{ url: string; secret?: string; enabled?: boolean; description?: string }>;
  /** Bí mật mình đã đăng ký với engine, dùng để xác thực chiều engine → mình. */
  engineWebhookSecret?: string;
}

/**
 * Tin THÔ do engine trả. Chỉ khai phần mình dùng — engine trả 24 trường, khai
 * hết là tự buộc mình phải sửa file này mỗi lần bên kia thêm cột.
 */
export interface TinThoEngine {
  id: string;
  conversationId?: string;
  zaloMsgId?: string;
  senderUid?: string;
  senderName?: string;
  content?: string;
  contentType?: string;
  attachments?: unknown[];
  replyToId?: string | null;
  mentions?: Array<{ uid?: string; name?: string }>;
  isDeleted?: boolean;
  sentAt: string;
}

export interface NhomDaTra {
  groupGlobalId: string;
  kind?: string;
  title?: string;
  conversationIds?: string[];
}

/**
 * ĐỌC tin Zalo cho agent.
 *
 * Engine đã có sẵn đường đọc (`GET /conversations/:id/messages`) — lớp này không
 * dựng lại cái đó, nó thêm ba thứ engine không biết:
 *
 * 1. **Chốt nhóm.** Engine không có khái niệm `kind`; chặn nhóm khách phải ở đây.
 * 2. **Ghép nhóm → nhiều hội thoại.** Một nhóm có nhiều nick công ty, mỗi nick một
 *    hội thoại; agent chỉ biết `groupGlobalId`.
 * 3. **Vai người gửi.** `senderType` của engine chỉ có `contact`/`self`.
 */
@Injectable()
export class AgentZaloReadService {
  private readonly logger = new Logger(AgentZaloReadService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ApiConfigService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async layCauHinh(): Promise<CauHinhNgheZalo> {
    return (await this.systemConfig.get<CauHinhNgheZalo>(AGENT_ZALO_INBOUND_CONFIG_KEY)) ?? {};
  }

  private headerEngine(): Record<string, string> {
    const { secret } = this.config.zaloEngine;
    const ts = String(Date.now());

    return {
      'content-type': 'application/json',
      'x-service-token': `${ts}.${createHmac('sha256', secret).update(ts).digest('base64url')}`,
      'x-user-id': 'agent-api',
      'x-user-name': 'Agent',
      'x-user-role': 'owner',
      'x-user-scopes': '[]',
    };
  }

  async goiEngine<T>(duong: string): Promise<T> {
    const { url, secret } = this.config.zaloEngine;
    if (!url || !secret) throw new ServiceUnavailableException('Chưa cấu hình engine Zalo.');

    let res: Response;
    try {
      res = await fetch(`${url}${duong}`, { headers: this.headerEngine(), signal: AbortSignal.timeout(HAN_GIAY * 1000) });
    } catch (e) {
      throw new ServiceUnavailableException(`Không gọi được engine Zalo: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      this.logger.error(`[agent-zalo-read] engine trả ${res.status} ở ${duong}: ${raw.slice(0, 300)}`);
      throw new ServiceUnavailableException(`Engine Zalo từ chối (${res.status}).`);
    }

    return (await res.json()) as T;
  }

  /** Tra nhóm theo `groupGlobalId`, đã áp chốt loại nhóm. */
  async nhomDuocPhep(groupGlobalId: string): Promise<NhomDaTra> {
    const nhom = (await this.connection
      .collection('zalo_group_links')
      .findOne({ groupGlobalId }, { projection: { kind: 1, conversationIds: 1, title: 1, groupGlobalId: 1 } })) as NhomDaTra | null;

    if (!nhom) throw new BadRequestException(LY_DO_CHAN.khongThayNhom);
    if (!nhomDuocNghe(nhom.kind)) {
      throw new BadRequestException(
        nhom.kind === 'seller'
          ? 'CẤM đọc nhóm khách hàng — đường này chỉ dành cho nhóm nội bộ và nhóm vận hành.'
          : LY_DO_CHAN.chuaXet,
      );
    }

    return nhom;
  }

  /**
   * Tập uid cho hai điều kiện kích hoạt, lấy từ `zalo_identities` — bảng người
   * vận hành đã xét.
   *
   * KHÔNG lấy từ `GET /accounts` của engine: uid ở đó là uid nick TỰ NHÌN MÌNH,
   * còn `mentions[].uid` là uid phía người khác thấy. Hai không gian khác nhau,
   * so với nhau thì luôn trượt và trượt im lặng — đã đo: không một uid nào trong
   * 12 uid bị tag nhiều nhất khớp bảng account.
   */
  async tapUidKichHoat(): Promise<{ chuTich: Set<string>; nickAgent: Set<string> }> {
    const cauHinh = await this.layCauHinh();
    const ds = await this.connection
      .collection('zalo_identities')
      .find({ kind: { $in: ['chairman', 'ai-support'] } }, { projection: { zaloUid: 1, kind: 1 } })
      .toArray();

    const chuTich = new Set<string>(cauHinh.chairmanZaloUids ?? []);
    const nickAgent = new Set<string>(cauHinh.agentNickZaloUids ?? []);
    for (const d of ds) {
      if (d.kind === 'chairman') chuTich.add(String(d.zaloUid));
      else nickAgent.add(String(d.zaloUid));
    }

    return { chuTich, nickAgent };
  }

  /** Bảng uid → `kind` từ `zalo_identities`, để suy vai người gửi. */
  async kindTheoUid(uids: string[]): Promise<Map<string, string>> {
    if (uids.length === 0) return new Map();
    const ds = await this.connection
      .collection('zalo_identities')
      .find({ zaloUid: { $in: uids } }, { projection: { zaloUid: 1, kind: 1 } })
      .toArray();

    return new Map(ds.map((d) => [String(d.zaloUid), String(d.kind)]));
  }

  /**
   * Tin của một nhóm, gộp từ MỌI hội thoại của nhóm đó và sắp theo thời gian.
   *
   * Hội thoại hỏng thì bỏ qua chứ không làm hỏng cả lượt đọc: `conversationIds`
   * có thể cũ — nick bị gỡ khỏi nhóm mà bản ghi còn, Zalo trả "Nhóm này không
   * tồn tại". Đã gặp thật. Một nick chết không được làm câm cả nhóm.
   */
  async tinCuaNhom(groupGlobalId: string, limit = 50, since?: string): Promise<AgentZaloMessage[]> {
    const nhom = await this.nhomDuocPhep(groupGlobalId);
    const hoiThoai = nhom.conversationIds ?? [];
    if (hoiThoai.length === 0) return [];

    const mocSince = since ? new Date(since).getTime() : 0;
    const tho: TinThoEngine[] = [];

    for (const id of hoiThoai) {
      try {
        const j = await this.goiEngine<{ data?: TinThoEngine[] }>(
          `/api/zalo-multi/conversations/${encodeURIComponent(id)}/messages?limit=${limit}`,
        );
        for (const m of j.data ?? []) tho.push({ ...m, conversationId: m.conversationId ?? id });
      } catch (e) {
        this.logger.warn(`[agent-zalo-read] bỏ qua hội thoại ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const loc = tho
      .filter((m) => !m.isDeleted && (!mocSince || new Date(m.sentAt).getTime() > mocSince))
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
      .slice(0, limit);

    return this.ganVai(loc, nhom);
  }

  /** Gắn vai người gửi + đánh dấu mention nào trúng nick công ty. */
  async ganVai(tho: TinThoEngine[], nhom: NhomDaTra): Promise<AgentZaloMessage[]> {
    const { chuTich, nickAgent } = await this.tapUidKichHoat();

    const uids = new Set<string>();
    for (const m of tho) {
      if (m.senderUid) uids.add(String(m.senderUid));
      for (const mt of m.mentions ?? []) if (mt?.uid) uids.add(String(mt.uid));
    }
    const kinds = await this.kindTheoUid([...uids]);

    return tho.map((m) => ({
      messageId: String(m.id),
      zaloMsgId: m.zaloMsgId ? String(m.zaloMsgId) : undefined,
      groupGlobalId: nhom.groupGlobalId,
      groupTitle: nhom.title,
      kind: String(nhom.kind),
      conversationId: String(m.conversationId),
      sentAt: new Date(m.sentAt).toISOString(),
      content: m.content ?? undefined,
      contentType: String(m.contentType ?? 'text'),
      attachments: Array.isArray(m.attachments) && m.attachments.length > 0 ? m.attachments : undefined,
      replyToId: m.replyToId ?? undefined,
      sender: {
        zaloUid: m.senderUid ? String(m.senderUid) : undefined,
        displayName: m.senderName ?? undefined,
        role: suyVai(m.senderUid ? String(m.senderUid) : undefined, chuTich, kinds),
      },
      mentions: (m.mentions ?? []).map((mt) => ({
        uid: mt?.uid ? String(mt.uid) : undefined,
        name: mt?.name || undefined,
        laNickAgent: !!mt?.uid && nickAgent.has(String(mt.uid)),
      })),
    }));
  }
}

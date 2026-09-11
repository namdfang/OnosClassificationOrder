import { createHmac } from 'node:crypto';

import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { ApiConfigService } from '@/shared/services/api-config.service';

import { chonHoiThoai, kiemNoiDung, type NhomDeGui } from './agent-zalo-send.logic';

/** Engine từ chối token quá cũ; 15 giây là dư cho một lời gọi nội bộ. */
const HAN_GIAY = 15;

/**
 * Đường GỬI Zalo cho agent — ngoại lệ DUY NHẤT của luật chỉ-đọc (BR-3).
 *
 * Vì sao đặt ở đây thay vì nhờ engine của nhà cung cấp mở thêm: engine đã gửi
 * được từ lâu (`POST /conversations/:id/messages`), và app này vốn gọi engine
 * mỗi ngày cho màn chat. Thứ còn thiếu chỉ là một lớp mỏng có CHỐT CHẶN —
 * agent không có phiên người dùng nên không đi qua proxy của màn chat được.
 *
 * Vì sao KHÔNG dùng `AgentApiRepository`: lớp đó cố ý chỉ phơi `find`/`aggregate`
 * để giữ BR-3 bằng hình dạng, không bằng kỷ luật. Đường ghi này tách hẳn ra
 * chỗ khác để phần đọc vẫn đúng bất biến đó.
 *
 * Xác thực với engine: `x-service-token` = `{ts}.{HMAC-SHA256(ts, secret)}` cộng
 * bốn header danh tính — đúng cơ chế proxy của nhà cung cấp đang dùng.
 */
@Injectable()
export class AgentZaloSendService {
  private readonly logger = new Logger(AgentZaloSendService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ApiConfigService,
  ) {}

  async guiTinNhom(groupGlobalId: string, content: string, conversationId?: string): Promise<{ conversationId: string; groupTitle?: string; sentAt: string }> {
    const { url, secret } = this.config.zaloEngine;
    if (!url || !secret) throw new ServiceUnavailableException('Chưa cấu hình engine Zalo.');

    const noiDung = kiemNoiDung(content);
    if (!noiDung.ok) throw new BadRequestException(noiDung.lyDo);

    const nhom = (await this.connection
      .collection('zalo_group_links')
      .findOne({ groupGlobalId }, { projection: { kind: 1, conversationIds: 1, title: 1 } })) as NhomDeGui | null;

    const chon = chonHoiThoai(nhom, conversationId);
    if (!chon.ok) throw new BadRequestException(chon.lyDo);

    const ts = String(Date.now());
    const sig = createHmac('sha256', secret).update(ts).digest('base64url');

    let res: Response;
    try {
      res = await fetch(`${url}/api/zalo-multi/conversations/${encodeURIComponent(chon.conversationId)}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-service-token': `${ts}.${sig}`,
          // Engine đòi ngữ cảnh người dùng; agent gửi NHÂN DANH HỆ THỐNG nên
          // ghi rõ là `agent` để nhật ký bên engine không lẫn với người thật.
          'x-user-id': 'agent-api',
          'x-user-name': 'Agent',
          'x-user-role': 'owner',
          'x-user-scopes': '[]',
        },
        body: JSON.stringify({ content: noiDung.content }),
        signal: AbortSignal.timeout(HAN_GIAY * 1000),
      });
    } catch (e) {
      throw new ServiceUnavailableException(`Không gọi được engine Zalo: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!res.ok) {
      // Nguyên văn lỗi engine chỉ vào log; agent nhận câu chung để không lộ
      // đường dẫn/nội bộ ra ngoài.
      const raw = await res.text().catch(() => '');
      this.logger.error(`[agent-zalo-send] engine trả ${res.status}: ${raw.slice(0, 300)}`);
      throw new ServiceUnavailableException(`Engine Zalo từ chối (${res.status}).`);
    }

    return { conversationId: chon.conversationId, groupTitle: nhom?.title, sentAt: new Date().toISOString() };
  }
}

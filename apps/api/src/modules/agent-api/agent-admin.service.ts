import { Injectable } from '@nestjs/common';
import type { AgentAdminOverview, AgentAdminTable } from 'shared';

import { ApiConfigService } from '@/shared/services/api-config.service';

import { AGENT_API_RATE_LIMIT_PER_MIN } from './agent-api.constants';
import { buildTableMeta } from './agent-table-meta';
import { AGENT_TABLE_REGISTRY } from './registry';

/** Đường gốc của bộ API agent — tương đối, FE ghép origin của nó. */
const AGENT_BASE_PATH = '/api/v1/agent';
const AGENT_AUTH_HEADER = 'X-Agent-Api-Key';
const AGENT_KEY_ENV_NAME = 'AGENT_API_KEY';

/**
 * Bề mặt QUẢN TRỊ của bộ API agent (`API-3`) — dữ liệu cho trang hướng dẫn
 * trong `/adm`.
 *
 * Dựng **từ registry tại thời điểm gọi**, không cache và không chép cứng danh
 * sách bảng: thêm một trường vào registry là nó tự hiện ra trên trang, không
 * phải sửa dòng nào ở đây lẫn ở FE (AC-05). Trang chép cứng là trang nói về một
 * bề mặt dữ liệu không có thật.
 *
 * Service này **không chạm collection nghiệp vụ nào** — chỉ đọc hằng số trong
 * bộ nhớ. Nên "lộ giá trị dữ liệu" không phải là điều nó có thể làm, kể cả khi
 * trả ra tên các trường bị che.
 */
@Injectable()
export class AgentAdminService {
  constructor(private readonly config: ApiConfigService) {}

  overview(): AgentAdminOverview {
    return {
      basePath: AGENT_BASE_PATH,
      authHeader: AGENT_AUTH_HEADER,
      keyConfigured: Boolean(this.config.agentApi.key),
      keyEnvName: AGENT_KEY_ENV_NAME,
      limits: {
        // Hằng số dùng chung với `@Throttle` — con số hiển thị KHÔNG BAO GIỜ
        // lệch khỏi con số đang chặn (`API-4`, AC-03).
        rateLimitPerMin: AGENT_API_RATE_LIMIT_PER_MIN,
        maxLimit: this.config.agentApi.maxLimit,
        readTimeoutMs: this.config.agentApi.readTimeoutMs,
        queryTimeoutMs: this.config.agentApi.queryTimeoutMs,
      },
      // Dùng chung hàm dựng với bề mặt agent (`API-18`), rồi bỏ hai khoá trang
      // này không cần. Dựng lại từ registry ở đây sẽ tạo bản thứ hai để lệch —
      // đúng thứ AC-03 của `API-18` cấm.
      tables: Object.values(AGENT_TABLE_REGISTRY).map((spec): AgentAdminTable => {
        const { fieldCount: _fieldCount, readableFields: _readableFields, ...table } = buildTableMeta(spec);
        return table;
      }),
    };
  }

  /**
   * Giá trị khoá agent. Người dùng đã chấp nhận việc hiển thị khoá trên trang
   * (`API-3` SRS §8/A4); đường riêng này để khoá chỉ rời máy chủ khi người xem
   * CHỦ ĐỘNG bấm hiện, chứ không phải ở mọi lần tải trang.
   *
   * Chuỗi rỗng khi chưa cấu hình — trang đã biết điều đó từ `keyConfigured`.
   */
  key(): { key: string } {
    return { key: this.config.agentApi.key };
  }
}

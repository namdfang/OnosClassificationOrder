import { Injectable } from '@nestjs/common';
import type { AgentAdminOverview, AgentAdminTable } from 'shared';

import { ApiConfigService } from '@/shared/services/api-config.service';

import { AGENT_API_RATE_LIMIT_PER_MIN } from './agent-api.constants';
import { AgentApiRepository } from './agent-api.repository';
import { buildOpenTableMeta, buildTableMeta } from './agent-table-meta';
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
 * Service này **không đọc bản ghi nào** — chỉ đọc hằng số trong bộ nhớ cộng
 * DANH SÁCH TÊN collection (`API-19`). Nên "lộ giá trị dữ liệu" vẫn không phải
 * điều nó có thể làm, kể cả khi trả ra tên các trường bị che.
 *
 * Từ `API-19` trang quản trị phải hiện **mọi bảng agent với tới được**, không
 * chỉ 11 bảng có mô tả: người vận hành mở trang này để biết agent đọc được
 * những gì, và một trang chỉ kể 11 bảng trong khi agent đọc được cả trăm là
 * trang nói sai về hệ thống.
 */
@Injectable()
export class AgentAdminService {
  constructor(
    private readonly config: ApiConfigService,
    private readonly repository: AgentApiRepository,
  ) {}

  async overview(): Promise<AgentAdminOverview> {
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
      tables: (await this.tableKeys()).map((key): AgentAdminTable => {
        const documented = AGENT_TABLE_REGISTRY[key];
        const meta = documented ? buildTableMeta(documented) : buildOpenTableMeta(key);
        const { fieldCount: _fieldCount, readableFields: _readableFields, ...table } = meta;
        return table;
      }),
    };
  }

  /** Bảng có mô tả HỢP với mọi collection đang có — cùng phép hợp `AgentReadService` dùng. */
  private async tableKeys(): Promise<string[]> {
    const names = await this.repository.listCollections();
    return [...new Set([...names, ...Object.keys(AGENT_TABLE_REGISTRY)])].sort();
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

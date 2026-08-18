import type { ApiConfigService } from '@/shared/services/api-config.service';

import { AgentAdminService } from './agent-admin.service';
import { AGENT_API_RATE_LIMIT_PER_MIN } from './agent-api.constants';
import { AGENT_TABLE_REGISTRY } from './registry';

const configWith = (key: string): ApiConfigService =>
  ({
    agentApi: { key, maxLimit: 200, readTimeoutMs: 3000, queryTimeoutMs: 8000 },
  }) as unknown as ApiConfigService;

const build = (key = 'secret-key') => new AgentAdminService(configWith(key));

/**
 * `API-3` — bề mặt quản trị phải là **tấm gương của registry**, không phải bản
 * chép. Các case dưới đây so thẳng với registry thật thay vì với một danh sách
 * viết tay: một danh sách viết tay cũng sẽ mục đúng theo cách mà AC-05 sợ.
 */
describe('AgentAdminService.overview', () => {
  it('AC-05: danh sách bảng khớp CHÍNH XÁC registry, không chép cứng', () => {
    expect(build().overview().tables.map((t) => t.key)).toEqual(Object.keys(AGENT_TABLE_REGISTRY));
  });

  it('AC-04: mỗi trường mang đủ chính sách, khớp từng bit với registry', () => {
    const overview = build().overview();

    for (const table of overview.tables) {
      const spec = AGENT_TABLE_REGISTRY[table.key];
      expect(table.fields.map((f) => f.name)).toEqual(Object.keys(spec.fields));

      for (const field of table.fields) {
        const policy = spec.fields[field.name];
        expect(field).toEqual({
          name: field.name,
          type: policy.type,
          read: policy.read,
          filter: policy.filter,
          sortable: policy.sortable,
          groupable: policy.groupable,
          aggregatable: policy.aggregatable,
          freeText: policy.freeText,
          note: policy.note,
        });
      }
    }
  });

  it('AC-16: trả TÊN các trường cố ý bị che, và chỉ tên', () => {
    const products = build().overview().tables.find((t) => t.key === 'productConfigs');

    expect(products?.excludedFields).toEqual(AGENT_TABLE_REGISTRY.productConfigs.deliberatelyExcluded);
    // Giá vốn phải nằm ở danh sách LOẠI TRỪ, tuyệt đối không ở danh sách đọc được.
    expect(products?.excludedFields).toContain('variations.cost');
    expect(products?.fields.map((f) => f.name)).not.toContain('variations.cost');
  });

  it('AC-05: trường mới thêm vào registry tự hiện ra, không sửa dòng nào', () => {
    const spec = AGENT_TABLE_REGISTRY.factories;
    const injected = '__probe_field__';
    spec.fields[injected] = { type: 'string', read: true, filter: 'full', sortable: true, groupable: true };

    try {
      const factories = build().overview().tables.find((t) => t.key === 'factories');
      expect(factories?.fields.map((f) => f.name)).toContain(injected);
    } finally {
      delete spec.fields[injected];
    }
  });

  it('AC-03: hạn mức lấy từ hằng số đang chặn thật, không từ biến môi trường', () => {
    expect(build().overview().limits.rateLimitPerMin).toBe(AGENT_API_RATE_LIMIT_PER_MIN);
  });

  it('AC-09: keyConfigured phân biệt được đã cấu hình với chưa, và KHÔNG kèm khoá', () => {
    const configured = build('secret-key').overview();
    const missing = build('').overview();

    expect([configured.keyConfigured, missing.keyConfigured]).toEqual([true, false]);
    expect(missing.keyEnvName).toBe('AGENT_API_KEY');
    expect(JSON.stringify(configured)).not.toContain('secret-key');
  });
});

describe('AgentAdminService.key', () => {
  it('trả khoá khi đã cấu hình, chuỗi rỗng khi chưa', () => {
    expect([build('secret-key').key(), build('').key()]).toEqual([{ key: 'secret-key' }, { key: '' }]);
  });
});

import type { ApiConfigService } from '@/shared/services/api-config.service';

import { AgentAdminService } from './agent-admin.service';
import { AGENT_API_RATE_LIMIT_PER_MIN } from './agent-api.constants';
import type { AgentApiRepository } from './agent-api.repository';
import { AGENT_DENY_FIELD_NAMES, AGENT_TABLE_REGISTRY } from './registry';

const configWith = (key: string): ApiConfigService =>
  ({
    agentApi: { key, maxLimit: 200, readTimeoutMs: 3000, queryTimeoutMs: 8000 },
  }) as unknown as ApiConfigService;

/**
 * Kho dữ liệu giả chỉ trả DANH SÁCH TÊN collection — từ `API-19`, trang quản
 * trị phải kể cả bảng không có mô tả, nên nó cần hỏi cơ sở dữ liệu.
 * `zz_undocumented` là bảng cố tình không có trong từ điển.
 */
const repositoryWith = (names: string[]): AgentApiRepository =>
  ({ listCollections: () => Promise.resolve(names) }) as unknown as AgentApiRepository;

const UNDOCUMENTED = 'zz_undocumented';

const build = (key = 'secret-key') =>
  new AgentAdminService(configWith(key), repositoryWith([...Object.keys(AGENT_TABLE_REGISTRY), UNDOCUMENTED]));

/**
 * `API-3` — bề mặt quản trị phải là **tấm gương của registry**, không phải bản
 * chép. Các case dưới đây so thẳng với registry thật thay vì với một danh sách
 * viết tay: một danh sách viết tay cũng sẽ mục đúng theo cách mà AC-05 sợ.
 */
describe('AgentAdminService.overview', () => {
  it('API-19: kể MỌI collection, không chỉ bảng có mô tả', async () => {
    const overview = await build().overview();
    expect(overview.tables.map((t) => t.key)).toEqual(
      [...Object.keys(AGENT_TABLE_REGISTRY), UNDOCUMENTED].sort(),
    );
  });

  it('API-19: bảng không có mô tả hiện ra với khung rỗng và lời nhắc, KHÔNG bị bỏ qua', async () => {
    const table = (await build().overview()).tables.find((t) => t.key === UNDOCUMENTED);

    expect(table?.fields).toEqual([]);
    // Danh sách trường rỗng nhìn từ ngoài giống hệt bảng bị khoá — mô tả phải
    // nói rõ là chưa ai mô tả, không phải là không đọc được.
    expect(table?.description).toContain('chưa có mô tả');
    expect(table?.excludedFields).toEqual(AGENT_DENY_FIELD_NAMES);
  });

  it('AC-04: mỗi trường mang đủ chính sách, khớp từng bit với registry', async () => {
    const overview = await build().overview();

    for (const table of overview.tables) {
      const spec = AGENT_TABLE_REGISTRY[table.key];
      if (!spec) continue;
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

  it('AC-16: trả TÊN các trường cố ý bị che, và chỉ tên', async () => {
    const customers = (await build().overview()).tables.find((t) => t.key === 'customers');

    expect(customers?.excludedFields).toEqual(AGENT_TABLE_REGISTRY.customers.deliberatelyExcluded);
    // Bí mật xác thực phải nằm ở danh sách LOẠI TRỪ, tuyệt đối không ở danh
    // sách đọc được. `API-19` mở giá vốn, nên ca cũ đổi sang trường này —
    // `password` là thứ duy nhất còn bị che ở bảng `customers`.
    expect(customers?.excludedFields).toContain('password');
    expect(customers?.fields.map((f) => f.name)).not.toContain('password');
  });

  it('AC-05: trường mới thêm vào registry tự hiện ra, không sửa dòng nào', async () => {
    const spec = AGENT_TABLE_REGISTRY.factories;
    const injected = '__probe_field__';
    spec.fields[injected] = { type: 'string', read: true, filter: 'full', sortable: true, groupable: true };

    try {
      const factories = (await build().overview()).tables.find((t) => t.key === 'factories');
      expect(factories?.fields.map((f) => f.name)).toContain(injected);
    } finally {
      delete spec.fields[injected];
    }
  });

  it('AC-03: hạn mức lấy từ hằng số đang chặn thật, không từ biến môi trường', async () => {
    expect((await build().overview()).limits.rateLimitPerMin).toBe(AGENT_API_RATE_LIMIT_PER_MIN);
  });

  it('AC-09: keyConfigured phân biệt được đã cấu hình với chưa, và KHÔNG kèm khoá', async () => {
    const configured = await build('secret-key').overview();
    const missing = await build('').overview();

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

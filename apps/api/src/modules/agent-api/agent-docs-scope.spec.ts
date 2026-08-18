import fs from 'fs';
import path from 'path';

import type { ApiConfigService } from '@/shared/services/api-config.service';

import { AgentDocsService, SECTION_DIRS } from './agent-docs.service';

/**
 * `API-13` — cổng tài liệu agent chỉ còn phơi tài liệu **nghiệp vụ**.
 *
 * Bốn ca đầu bám AC-01/AC-05. Ca cuối không bám AC nào: nó canh cái bẫy đã được
 * nêu ở bản đánh giá khả thi — danh sách nhóm tài liệu nằm ở HAI chỗ (service
 * và script chép tài liệu vào bản build), lệch nhau thì máy dev vẫn xanh còn
 * production thiếu tài liệu.
 */
const service = new AgentDocsService({ agentApi: { docsDir: '' } } as unknown as ApiConfigService);
service.onModuleInit();
const catalog = service.list();

describe('API-13 — phạm vi cổng tài liệu agent', () => {
  it('AC-01: danh mục CHỈ còn nhóm agent-guide', () => {
    expect(catalog.every((d) => d.section === 'agent-guide')).toBe(true);
  });

  /**
   * Danh mục rỗng là cách hỏng nguy hiểm nhất của thay đổi này: cổng vẫn chạy
   * nhưng trả 503 cho mọi lời gọi. Nó xảy ra nếu mốc nhận diện thư mục
   * `documents/` bị xoá thay vì đổi sang `AgentGuide`.
   */
  it('AC-05: danh mục KHÔNG rỗng — ca này đỏ nghĩa là mốc nhận diện thư mục đã hỏng', () => {
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('AC-05: slug tài liệu kỹ thuật cũ trả DOC_NOT_FOUND kèm danh mục hiện có, không rỗng', () => {
    let body: { code?: string; available?: string[] } | undefined;
    try {
      service.get('orders');
    } catch (err) {
      body = (err as { getResponse: () => { code?: string; available?: string[] } }).getResponse();
    }
    expect(body?.code).toBe('DOC_NOT_FOUND');
    expect(body?.available?.length).toBeGreaterThan(0);
  });

  /**
   * AC-01 cấm thứ chỉ có nghĩa với NGƯỜI SỬA MÃ. Đường dẫn endpoint của chính
   * bộ API agent và tên tham số của DSL được phép — đó là thứ agent buộc phải
   * biết để gọi.
   *
   * Quét trên tài liệu ĐANG ĐƯỢC PHƠI THẬT (đọc qua danh mục), không phải trên
   * một danh sách file chép tay: file mới thêm vào cũng tự bị soi.
   */
  describe('AC-01: tài liệu được phơi không chứa dấu hiệu kỹ thuật', () => {
    const FORBIDDEN: { label: string; pattern: RegExp }[] = [
      { label: 'đường dẫn mã nguồn trong repo', pattern: /(apps|packages)\/[a-z-]+\// },
      { label: 'tên file .ts/.tsx', pattern: /[\w-]+\.tsx?\b/ },
      { label: 'nhãn File FE / File BE / Route', pattern: /\b(File FE|File BE|Route)\s*:/ },
      { label: 'cú pháp gọi hàm', pattern: /\b[A-Za-z_][\w]*\(\)/ },
      { label: 'route giao diện', pattern: /(^|[\s`(])\/(adm|ffm|customer)(\/|\b)/m },
    ];

    it.each(catalog.map((d) => [d.slug]))('%s sạch', (slug) => {
      const { markdown } = service.get(slug);
      for (const { label, pattern } of FORBIDDEN) {
        expect({ slug, label, hit: pattern.exec(markdown)?.[0] ?? null }).toEqual({ slug, label, hit: null });
      }
    });
  });

  it('hai nguồn không lệch: script chép tài liệu vào bản build phủ đúng các nhóm service phục vụ', () => {
    const script = fs.readFileSync(path.resolve(__dirname, '../../../scripts/copy-agent-docs.mjs'), 'utf8');
    const declared = /const SECTIONS = \[([^\]]*)\]/.exec(script)?.[1] ?? '';
    const copied = declared
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    expect(copied.sort()).toEqual(SECTION_DIRS.map((s) => s.dir).sort());
  });
});

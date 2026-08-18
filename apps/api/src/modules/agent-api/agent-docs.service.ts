import { Injectable, OnModuleInit } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import type { AgentDoc, AgentDocSection, AgentDocSummary } from 'shared';

import { ApiConfigService } from '@/shared/services/api-config.service';

import { docNotFound, docsUnavailable } from './agent-errors';

type DocEntry = AgentDocSummary & { filePath: string };

/** Thư mục con của `documents/` được phục vụ, theo thứ tự agent nên đọc. */
const SECTION_DIRS: { section: AgentDocSection; dir: string }[] = [
  { section: 'agent-guide', dir: 'AgentGuide' },
  { section: 'feature', dir: 'FunctionDescription' },
  { section: 'architecture', dir: 'Architecture' },
];

/**
 * Năng lực C của bộ API agent (`API-1`): tra cứu tài liệu nghiệp vụ (AC-12,
 * AC-13).
 *
 * `documents/Plans/` **bị loại** theo ASSUMPTION A2 của SRS — phần lớn là đề
 * xuất và lịch sử triển khai, agent đọc vào dễ mô tả sai hiện trạng hệ thống.
 *
 * Danh mục dựng MỘT LẦN lúc boot; `:slug` chỉ tra trong danh mục đó, nên bên
 * gọi không bao giờ đưa được đường dẫn xuống `fs` — chặn path traversal tận
 * gốc.
 */
@Injectable()
export class AgentDocsService implements OnModuleInit {
  private catalog: DocEntry[] = [];
  private rootDir = '';

  constructor(private readonly config: ApiConfigService) {}

  onModuleInit(): void {
    this.rootDir = this.resolveRoot();
    if (!this.rootDir) {
      console.warn(
        '[agent-api] KHÔNG tìm thấy thư mục tài liệu. Đặt AGENT_DOCS_DIR, hoặc chạy lại build để ' +
          'bước copy-agent-docs sinh ra <thư mục chạy>/agent-docs. Endpoint tài liệu sẽ trả 503.',
      );
      return;
    }
    this.catalog = this.buildCatalog(this.rootDir);
  }

  /**
   * Thứ tự tìm, xem `.devtasks/design/API-1.md` §10.3. `start:prod` chạy
   * `node dist-prod/main.js` nên không có gì bảo đảm gốc repo nằm cạnh tiến
   * trình — bản đóng gói mới là đường đi của production.
   */
  private resolveRoot(): string {
    const candidates = [
      this.config.agentApi.docsDir,
      path.resolve(process.cwd(), 'agent-docs'),
      path.resolve(__dirname, '..', '..', '..', 'agent-docs'),
    ].filter(Boolean);

    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }

    // Máy dev: đi ngược lên tìm `documents/` ở gốc repo, để sửa doc là thấy
    // ngay mà không phải build lại.
    let dir = __dirname;
    for (let i = 0; i < 8; i += 1) {
      const guess = path.resolve(dir, 'documents');
      if (fs.existsSync(path.join(guess, 'FunctionDescription'))) return guess;
      dir = path.dirname(dir);
    }
    return '';
  }

  private buildCatalog(root: string): DocEntry[] {
    const out: DocEntry[] = [];
    for (const { section, dir } of SECTION_DIRS) {
      const full = path.join(root, dir);
      if (!fs.existsSync(full)) continue;
      for (const name of fs.readdirSync(full).sort()) {
        if (!name.endsWith('.md')) continue;
        const filePath = path.join(full, name);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        out.push({
          slug: this.slugify(name.replace(/\.md$/i, '')),
          title: (lines.find((l) => l.startsWith('# ')) ?? name).replace(/^#\s*/, '').trim(),
          section,
          lines: lines.length,
          sizeKb: Math.round((Buffer.byteLength(content, 'utf8') / 1024) * 10) / 10,
          summary: this.firstParagraph(lines),
          filePath,
        });
      }
    }
    return out;
  }

  private slugify(name: string): string {
    return name
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  private firstParagraph(lines: string[]): string {
    const p = lines.find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('-'));
    return (p ?? '').replace(/[*`_]/g, '').trim().slice(0, 240);
  }

  list(): AgentDocSummary[] {
    if (!this.catalog.length) throw docsUnavailable();
    return this.catalog.map(({ filePath: _filePath, ...rest }) => rest);
  }

  get(slug: string): AgentDoc {
    if (!this.catalog.length) throw docsUnavailable();
    const entry = this.catalog.find((d) => d.slug === slug);
    // Trả kèm danh mục đang có — bên gọi là agent, nó phải tự sửa được lời gọi.
    if (!entry) throw docNotFound(slug, this.catalog.map((d) => d.slug));
    return {
      slug: entry.slug,
      title: entry.title,
      section: entry.section,
      markdown: fs.readFileSync(entry.filePath, 'utf8'),
    };
  }
}

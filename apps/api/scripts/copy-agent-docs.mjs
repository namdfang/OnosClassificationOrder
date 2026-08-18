// @ts-check
/**
 * Đóng gói tài liệu nghiệp vụ vào bản build của API (`API-1`, AC-12).
 *
 * `start:prod` chạy `node dist-prod/main.js`, và `build` chỉ chép `dist` sang
 * `dist-prod` — không có gì bảo đảm `documents/` ở gốc repo nằm cạnh tiến
 * trình đang chạy. Đây đúng kịch bản "xanh ở local, đỏ trên production" mà rủi
 * ro R4 của bản đánh giá khả thi đã cảnh báo, nên tài liệu được chép thẳng vào
 * cả `dist` lẫn `dist-prod`.
 *
 * `documents/Plans/` CỐ Ý bị loại (SRS ASSUMPTION A2): phần lớn là đề xuất và
 * lịch sử triển khai, agent đọc vào dễ mô tả sai hiện trạng hệ thống.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');

const SECTIONS = ['AgentGuide', 'FunctionDescription', 'Architecture'];
const TARGETS = ['dist', 'dist-prod'];

let copied = 0;

for (const target of TARGETS) {
  const targetRoot = path.join(apiRoot, target);
  if (!fs.existsSync(targetRoot)) continue;

  for (const section of SECTIONS) {
    const from = path.join(repoRoot, 'documents', section);
    if (!fs.existsSync(from)) continue;

    const to = path.join(targetRoot, 'agent-docs', section);
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      if (!name.endsWith('.md')) continue;
      fs.copyFileSync(path.join(from, name), path.join(to, name));
      copied += 1;
    }
  }
}

console.log(`[copy-agent-docs] đã chép ${copied} file tài liệu vào bản build`);

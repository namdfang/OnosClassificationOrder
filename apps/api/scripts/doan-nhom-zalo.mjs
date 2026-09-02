/**
 * Đoán chủ nhóm Zalo cho các nhóm CHƯA DUYỆT, bằng MÃ ĐƠN xuất hiện trong chat.
 *
 * Vì sao cần: gợi ý sẵn có chỉ khớp theo TÊN nhóm. Nhóm nào tên không mang mã
 * seller thì chịu. Nhưng trong chat hỗ trợ, khách và sale luôn nhắc mã đơn —
 * tra mã đó ra `userSku` là biết nhóm của ai, chắc hơn đoán theo tên.
 *
 * Chốt riêng tư: script CHỈ trích các CHUỖI MÃ khớp regex rồi vứt phần còn lại.
 * Không in, không gửi, không lưu nội dung chat. Nhóm không có mã đơn nào thì
 * gần như chắc chắn KHÔNG phải nhóm khách — đúng thứ cần lọc ra.
 *
 *   node scripts/doan-nhom-zalo.mjs --api <url> --token <jwt>
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const lay = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const API = lay('--api', 'http://localhost:3007/api/v1');
const TOKEN = lay('--token', '');
const MAX_TIN = Number(lay('--max-tin', 400));

// Mã sản xuất `XX-#####-#####` và mã sàn 15-20 chữ số.
const RE_SX = /\b[A-Z]{1,3}-\d{4,6}-\d{4,6}\b/g;
const RE_SAN = /\b\d{15,20}\b/g;

const sql = (q) =>
  execFileSync('ssh', ['-o','BatchMode=yes','onosceo',
    `docker exec zalo-onos-zalo-db-1 psql -U zalo -d zalo -At -F'|' -c ${JSON.stringify(q)}`],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const goi = async (duong, opt = {}) => {
  const r = await fetch(`${API}${duong}`, {
    ...opt,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(opt.headers || {}) },
  });
  if (!r.ok) throw new Error(`${duong} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

const ds = (await goi('/zalo-groups?page=1&limit=500')).data.filter((g) => g.kind === 'unreviewed');
console.log(`Nhóm chưa duyệt: ${ds.length}\n`);

const ketQua = [];
for (const [i, g] of ds.entries()) {
  // MỘT DÒNG: JSON.stringify biến xuống dòng thành ký tự \\n, psql hiểu là lỗi
  // cú pháp rồi trả rỗng — mà rỗng lại trông y hệt "nhóm không có mã đơn nào".
  const gid = String(g.groupGlobalId).replace(/'/g, "''");
  const q = `SELECT replace(replace(coalesce(m.content,''),chr(10),' '),chr(13),' ') FROM zalo_messages m JOIN zalo_conversations c ON c.id=m.conversation_id WHERE c.group_global_id='${gid}' AND m.is_deleted=false AND coalesce(m.content,'')<>'' ORDER BY m.sent_at DESC LIMIT ${MAX_TIN}`;
  let text = '';
  try { text = sql(q); } catch { /* nhóm không đọc được thì bỏ qua */ }

  // Chỉ giữ MÃ, phần chat còn lại rơi khỏi bộ nhớ ngay sau dòng này.
  const ma = [...new Set([...(text.match(RE_SX) || []), ...(text.match(RE_SAN) || [])])].slice(0, 300);
  ketQua.push({ groupGlobalId: g.groupGlobalId, title: g.title, soMa: ma.length, ma });
  process.stdout.write(`\r  quét ${i + 1}/${ds.length}`);
}
console.log('\n');
console.log(JSON.stringify(ketQua));

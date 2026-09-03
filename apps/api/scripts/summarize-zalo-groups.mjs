/**
 * Tóm tắt tình hình các nhóm Zalo.
 *
 * Chạy TỪ MỘT MÁY CÓ SSH tới `onosceo` (nơi có tin nhắn) và gọi được API
 * OnosFactory. Ba bước cho mỗi lượt:
 *
 *   1. Hỏi API nhóm nào đang chờ tóm tắt + mốc tin cần lấy từ
 *   2. Sang `onosceo` kéo tin nhắn MỚI của đúng những nhóm đó
 *   3. Đẩy về API — mô hình chạy phía server, khoá API không rời server
 *
 * Vì sao kéo theo mốc chứ không lấy "N tin gần nhất": đo trên 191 nhóm bên
 * `thghub`, cửa sổ "60 tin gần nhất" trải ra rất lệch — nhóm bận chỉ thấy 1,6
 * ngày lịch sử, nhóm im lại thấy 16,2 ngày. Tức NHÓM CÀNG BẬN CÀNG MÙ, mà đó
 * đúng là nhóm dễ có việc treo.
 *
 * Cách chạy (từ thư mục apps/api):
 *   node scripts/summarize-zalo-groups.mjs --dry-run
 *   node scripts/summarize-zalo-groups.mjs --yes --token <JWT> [--limit 10]
 *   node scripts/summarize-zalo-groups.mjs --yes --token <JWT> --group <groupGlobalId>
 *       ↑ ép tóm tắt lại MỘT nhóm từ đầu, bỏ qua hàng đợi — để kiểm một thay đổi
 *         trên nhóm đích danh mà không phải chờ cron.
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const args = process.argv.slice(2);
const apply = args.includes('--yes');
const argOf = (n) => {
  const i = args.indexOf(n);

  return i >= 0 ? args[i + 1] : undefined;
};

const SSH_HOST = argOf('--ssh') || 'onosceo';
const PG = argOf('--container') || 'zalo-onos-zalo-db-1';
const API = (argOf('--api') || 'http://127.0.0.1:3007/api/v1').replace(/\/+$/, '');
const TOKEN = argOf('--token') || process.env.ONOS_TOKEN;
const LIMIT = Number(argOf('--limit') || 0);
/** Ép một nhóm đọc lại từ đầu, bỏ qua hàng đợi (kiểm thử). */
const GROUP = argOf('--group');

/** Trần tin mỗi lượt — khớp trần của DTO phía API. */
const MAX_TIN = 400;
const SEP = '';

if (!TOKEN) {
  console.error('Thiếu token. Truyền --token <JWT> hoặc đặt ONOS_TOKEN.');
  process.exit(1);
}

const goiApi = async (duongDan, init = {}) => {
  const res = await fetch(`${API}${duongDan}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));

  return { ok: res.ok, status: res.status, body };
};

/** Kéo tin nhắn của MỘT nhóm, chỉ phần sau `tuMoc`. */
async function keoTin(groupGlobalId, tuMoc) {
  const dieuKienMoc = tuMoc ? `AND m.sent_at > '${new Date(tuMoc).toISOString()}'::timestamptz` : '';
  // Lấy N tin CUỐI (sắp xuôi lại sau) — nhóm dồn quá nhiều tin thì phần mới
  // nhất mới là phần đáng đọc.
  //
  // BA LỚP, không gộp được: `DISTINCT ON` (khử một tin lưu nhiều dòng theo
  // nick) ÉP `ORDER BY zalo_msg_id`, nên `LIMIT` đặt cùng lớp là cắt theo id —
  // nhóm >400 tin sẽ nhận 400 tin CŨ nhất và bỏ rơi tin mới (đã gặp: tin 31/08
  // không vào tóm tắt). `luc` là ISO cố định độ dài nên xếp chữ = xếp thời gian.
  const sql = `
    SELECT * FROM (
      SELECT * FROM (
        SELECT DISTINCT ON (m.zalo_msg_id)
               coalesce(m.sender_name,'') AS ten,
               coalesce(m.sender_uid,'')  AS uid,
               m.sender_type              AS phia,
               replace(replace(coalesce(m.content,''), chr(10), ' '), chr(13), ' ') AS noi_dung,
               to_char(m.sent_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS luc
        FROM zalo_messages m
        JOIN zalo_conversations c ON c.id = m.conversation_id
        WHERE c.group_global_id = '${groupGlobalId.replace(/'/g, "''")}'
          AND m.is_deleted = false
          AND coalesce(m.content,'') <> ''
          ${dieuKienMoc}
        ORDER BY m.zalo_msg_id, m.sent_at DESC
      ) khu_trung
      ORDER BY luc DESC
      LIMIT ${MAX_TIN}
    ) moi_nhat ORDER BY luc ASC
  `.replace(/\s+/g, ' ');

  const { stdout } = await execFile('ssh', [
    '-o',
    'BatchMode=yes',
    SSH_HOST,
    `docker exec ${PG} psql -U zalo -d zalo -At -F'${SEP}' -c ${JSON.stringify(sql)}`,
  ]);

  const tin = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [ten, uid, phia, noiDung, luc] = line.split(SEP);

      return {
        nguoiGui: ten || undefined,
        // Khoá tra vai trò. Vai trò do BẢNG ĐỊNH DANH quyết định, không suy từ
        // `sender_type`: engine chỉ đánh `self` cho 2 tài khoản công ty nối vào
        // nó, còn nhân viên dùng Zalo cá nhân rơi vào `contact` y như khách.
        zaloUid: uid || undefined,
        // Tin của chính tài khoản công ty không mang uid — nhận diện bằng cờ này.
        laTroLyAi: phia === 'self',
        noiDung: (noiDung || '').slice(0, 4000),
        luc: luc || undefined,
      };
    })
    .filter((m) => m.noiDung.trim() !== '');

  if (tin.length >= MAX_TIN) console.log(`    (đã cắt: chỉ ${MAX_TIN} tin mới nhất)`);

  return tin;
}

let hangDoi;
if (GROUP) {
  // Kiểm thử: không hỏi hàng đợi, ép đúng một nhóm đọc lại toàn bộ.
  hangDoi = [{ groupGlobalId: GROUP, title: GROUP, tuMoc: null, docLaiTuDau: true }];
} else {
  const q = await goiApi('/zalo-groups/summary-queue');
  if (!q.ok) {
    console.error(`Không lấy được hàng đợi (HTTP ${q.status}):`, JSON.stringify(q.body).slice(0, 300));
    process.exit(1);
  }
  hangDoi = q.body.data ?? [];
}
if (LIMIT > 0) hangDoi = hangDoi.slice(0, LIMIT);

console.log(`Nguồn  : ssh ${SSH_HOST} → ${PG}`);
console.log(`Đích   : ${API}`);
console.log(`Hàng đợi: ${hangDoi.length} nhóm chờ tóm tắt`);
console.log(`Chế độ : ${apply ? 'CHẠY THẬT (--yes)' : 'DRY-RUN (thêm --yes để gọi mô hình)'}`);
console.log('');

if (hangDoi.length === 0) {
  console.log('Không có nhóm nào cần tóm tắt.');
  process.exit(0);
}

let ok = 0;
let bo = 0;
const loi = [];

for (const [i, item] of hangDoi.entries()) {
  const ten = (item.title || item.groupGlobalId).slice(0, 44);
  const tin = await keoTin(item.groupGlobalId, item.tuMoc);

  if (tin.length === 0) {
    bo += 1;
    console.log(`  [${i + 1}/${hangDoi.length}] ${ten.padEnd(46)} bỏ qua (không có tin mới)`);
    continue;
  }

  if (!apply) {
    console.log(
      `  [${i + 1}/${hangDoi.length}] ${ten.padEnd(46)} ${String(tin.length).padStart(3)} tin${
        item.docLaiTuDau ? '  (đọc lại từ đầu)' : ''
      }`,
    );
    continue;
  }

  const res = await goiApi('/zalo-groups/summarize', {
    method: 'POST',
    body: JSON.stringify({
      groupGlobalId: item.groupGlobalId,
      messages: tin,
      docLaiTuDau: item.docLaiTuDau,
    }),
  });

  if (res.ok) {
    ok += 1;
    console.log(`  [${i + 1}/${hangDoi.length}] ${ten.padEnd(46)} ${String(tin.length).padStart(3)} tin → đã xếp hàng`);
  } else {
    const msg = res.body?.message ?? `HTTP ${res.status}`;
    loi.push({ ten, msg });
    console.log(`  [${i + 1}/${hangDoi.length}] ${ten.padEnd(46)} LỖI: ${String(msg).slice(0, 70)}`);
    // Lỗi cấu hình (thiếu khoá, quá tải) sẽ lặp lại ở mọi nhóm — dừng sớm thay
    // vì chạy hết hàng đợi để nhận cùng một lỗi hàng trăm lần.
    if (res.status === 503) {
      console.log('\nDừng sớm: lỗi này sẽ lặp lại ở mọi nhóm.');
      break;
    }
  }
}

console.log('');
if (apply) {
  console.log(`Đã xếp hàng ${ok} nhóm · bỏ qua ${bo} · lỗi ${loi.length}`);
  console.log('');
  // Endpoint chỉ xếp hàng rồi trả về ngay — việc thật do worker chạy nền, nên
  // script không còn là nơi biết kết quả. Nói rõ chỗ xem thay vì để người chạy
  // tưởng đã xong.
  console.log('Worker đang chạy nền (2 nhóm cùng lúc, ~40 giây/nhóm).');
  console.log('Xem tiến độ: tab "Tình hình" ở /adm/zalo-groups, hoặc');
  console.log('  journalctl -u onos-api-dev -f | grep zalo-summary');
} else {
  console.log(`Dry-run xong. ${hangDoi.length - bo} nhóm sẽ được xếp hàng.`);
}

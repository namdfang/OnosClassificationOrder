/**
 * Bật đường NGHE tin Zalo cho agent: khai uid Chủ tịch, đăng ký webhook với
 * engine, và khai bên nhận sự kiện đã lọc.
 *
 * Vì sao là script chứ không phải màn hình cấu hình: ba giá trị này khai MỘT
 * LẦN rồi gần như không đổi, và hai trong ba là bí mật — dựng UI cho chúng là
 * tạo thêm một chỗ để bí mật rò ra mà không đổi lại được tiện lợi gì.
 *
 * Chạy TRÊN MÁY CÓ ENGINE (engine chỉ nghe loopback), từ `apps/api`:
 *   node scripts/setup-zalo-inbound.mjs --show
 *   node scripts/setup-zalo-inbound.mjs --chairman 3249459352357127954 \
 *        --subscriber https://may-agent/hook --subscriber-secret <bí mật>
 *   node scripts/setup-zalo-inbound.mjs --callback https://api.onosfactory.com/api/v1/agent/zalo/inbound
 *
 * Idempotent: chạy lại chỉ cập nhật phần truyền vào, giữ nguyên phần còn lại,
 * và không tạo đăng ký engine thứ hai cho cùng một URL.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import mongoose from 'mongoose';

const KEY = 'agent_zalo_inbound_config';
const args = process.argv.slice(2);
const co = (n) => args.includes(n);
const val = (n) => {
  const i = args.indexOf(n);

  return i >= 0 ? args[i + 1] : undefined;
};

const envFile = co('--dev') ? '.env.development' : '.env.production';
const env = readFileSync(envFile, 'utf8');
const doc = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim() || '';

const uri = doc('DB_URI');
const engineUrl = doc('ZALO_ENGINE_URL');
const engineSecret = doc('ZALO_ENGINE_SECRET');
if (!uri || !engineUrl || !engineSecret) throw new Error(`Thiếu DB_URI/ZALO_ENGINE_URL/ZALO_ENGINE_SECRET trong ${envFile}`);

const headerEngine = () => {
  const ts = String(Date.now());

  return {
    'content-type': 'application/json',
    'x-service-token': `${ts}.${createHmac('sha256', engineSecret).update(ts).digest('base64url')}`,
    'x-user-id': 'agent-api',
    'x-user-name': 'Agent',
    'x-user-role': 'owner',
    'x-user-scopes': '[]',
  };
};

await mongoose.connect(uri);
const col = mongoose.connection.db.collection('system_configs');
const hienTai = (await col.findOne({ key: KEY }))?.value ?? {};

if (co('--show')) {
  console.log('Cấu hình hiện tại:');
  console.log('  chairmanZaloUid   :', hienTai.chairmanZaloUid ?? '(chưa khai)');
  console.log('  engineWebhookSecret:', hienTai.engineWebhookSecret ? '(đã có, ẩn)' : '(chưa khai)');
  console.log('  subscribers       :', (hienTai.subscribers ?? []).map((s) => s.url).join(', ') || '(chưa có)');
  const r = await fetch(`${engineUrl}/api/zalo-multi/webhooks`, { headers: headerEngine() });
  const j = await r.json();
  console.log('Đăng ký bên engine :', (j.subscriptions ?? []).map((s) => `${s.url} [${s.events}] ${s.enabled ? 'bật' : 'tắt'}`).join(' | ') || '(chưa có)');
  await mongoose.disconnect();
  process.exit(0);
}

const moi = { ...hienTai };
if (val('--chairman')) moi.chairmanZaloUid = val('--chairman');

if (val('--subscriber')) {
  const url = val('--subscriber');
  const secret = val('--subscriber-secret');
  const ds = (moi.subscribers ?? []).filter((s) => s.url !== url);
  ds.push({ url, secret, enabled: true, description: val('--subscriber-note') });
  moi.subscribers = ds;
}

const callback = val('--callback');
if (callback) {
  // Bí mật sinh một lần rồi giữ: đổi nó mà quên cập nhật bên engine thì mọi lượt
  // giao sau đó trượt chữ ký, và triệu chứng là "agent im lặng" chứ không phải lỗi.
  moi.engineWebhookSecret = moi.engineWebhookSecret || randomBytes(32).toString('hex');

  const dsRes = await fetch(`${engineUrl}/api/zalo-multi/webhooks`, { headers: headerEngine() });
  const ds = (await dsRes.json()).subscriptions ?? [];
  const cu = ds.find((s) => s.url === callback);

  const than = JSON.stringify({ url: callback, events: ['message.received'], secret: moi.engineWebhookSecret, enabled: true, description: 'Agent inbound (đã lọc phía OnosFactory)' });
  const r = cu
    ? await fetch(`${engineUrl}/api/zalo-multi/webhooks/${cu.id}`, { method: 'PATCH', headers: headerEngine(), body: than })
    : await fetch(`${engineUrl}/api/zalo-multi/webhooks`, { method: 'POST', headers: headerEngine(), body: than });

  console.log(`${cu ? 'Cập nhật' : 'Tạo'} đăng ký engine → ${r.status} ${(await r.text()).slice(0, 200)}`);
}

await col.updateOne(
  { key: KEY },
  { $set: { key: KEY, value: moi, description: 'Nghe tin Zalo cho agent: uid Chủ tịch + bên nhận webhook', updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
  { upsert: true },
);

console.log('Đã lưu. Chạy lại với --show để xem.');
await mongoose.disconnect();

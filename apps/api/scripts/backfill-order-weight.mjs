/**
 * Điền cân nặng + kích thước kiện cho đơn sản xuất CŨ, lấy từ biến thể sản phẩm.
 *
 * Vì sao cần (08/09/2026): nút "Mua vận đơn" ở `/hub/orders*` đòi `weightGram`,
 * mà cân nặng chỉ được chép vào `OrderEntity` từ lúc `pushToProduction` biết
 * đọc biến thể — mọi đơn đẩy TRƯỚC mốc đó để trống, ops bấm mua là phải gõ tay
 * từng đơn. Đo prod 08/09/2026: 30.628/52.764 đơn trống cân nặng, nhưng chỉ
 * **2.402 đơn còn mở** (chưa xong fulfillment, chưa hủy) là thực sự cần —
 * đơn đã xong thì hàng đã đi rồi.
 *
 * Cách khớp: ĐÚNG luật của `CustomerOrderService.pickVariation` — lọc biến thể
 * đang bật theo `size` rồi `color` (label khớp regex `size|kích`, `color|colour|màu`),
 * và **chỉ nhận khi còn đúng 1 ứng viên**. Mơ hồ thì bỏ qua: điền cân sai còn
 * tệ hơn để trống, vì cước tính theo cân và hãng cân lại lúc nhận hàng.
 *
 * Chỉ ghi vào đơn ĐANG TRỐNG trường đó (không đè số ai đã sửa tay), và không
 * bao giờ đụng đơn đã hoàn thành hay đã hủy.
 *
 * Cách chạy (từ thư mục apps/api):
 *   node scripts/backfill-order-weight.mjs                 # thử khô, chỉ in thống kê
 *   node scripts/backfill-order-weight.mjs --yes           # ghi thật
 *   node scripts/backfill-order-weight.mjs --yes --all     # gồm cả đơn đã hoàn thành
 *   node scripts/backfill-order-weight.mjs --uri "mongodb://..."
 */
import fs from 'node:fs';
import path from 'node:path';

import mongoose from 'mongoose';

const args = process.argv.slice(2);
const apply = args.includes('--yes');
const includeDone = args.includes('--all');
const argOf = (name) => {
  const i = args.indexOf(name);

  return i >= 0 ? args[i + 1] : undefined;
};

/** Đọc `DB_URI` từ .env của app khi không truyền `--uri` (không in ra màn hình). */
function resolveUri() {
  const explicit = argOf('--uri') || process.env.DB_URI;
  if (explicit) return explicit;
  for (const file of ['.env', '.env.development']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    const hit = fs
      .readFileSync(p, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DB_URI='));
    if (hit) return hit.slice('DB_URI='.length).trim();
  }
  throw new Error('Không tìm thấy DB_URI — truyền --uri hoặc chạy từ thư mục apps/api');
}

const SIZE_LABEL = /size|kích/i;
const COLOR_LABEL = /color|colour|màu/i;
const attrValue = (attributes, pattern) => attributes?.find((a) => pattern.test(a.label))?.value;
const eq = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** Cùng luật với `pickVariation` ở customer-order.service.ts — mơ hồ thì trả undefined. */
function pickVariation(variations, size, color) {
  const active = (variations ?? []).filter((v) => v.status !== '0');
  if (active.length === 1) return active[0];
  let candidates = active;
  if (size) candidates = candidates.filter((v) => eq(attrValue(v.attributes, SIZE_LABEL), size));
  if (color) candidates = candidates.filter((v) => eq(attrValue(v.attributes, COLOR_LABEL), color));

  return candidates.length === 1 ? candidates[0] : undefined;
}

await mongoose.connect(resolveUri());
const db = mongoose.connection.db;

const scope = includeDone
  ? { weight: { $in: [null, undefined] } }
  : { weight: { $in: [null, undefined] }, fulfillmentCompletedAt: null, cancelledAt: null };

const orders = await db
  .collection('orders')
  .find(scope, { projection: { productionId: 1, productConfigId: 1, size: 1, color: 1, type: 1 } })
  .toArray();
console.log(`Đơn thiếu cân nặng trong phạm vi: ${orders.length}${includeDone ? ' (gồm cả đơn đã xong)' : ' (đơn còn mở)'}`);

const configIds = [...new Set(orders.map((o) => o.productConfigId).filter(Boolean).map(String))];
const configs = await db
  .collection('productConfigs')
  .find({ _id: { $in: configIds } }, { projection: { fullName: 1, variations: 1 } })
  .toArray();
const byId = new Map(configs.map((c) => [String(c._id), c]));
console.log(`Sản phẩm liên quan: ${configIds.length}, đọc được ${configs.length}`);

const stat = { filled: 0, noConfig: 0, noVariation: 0, noWeight: 0 };
const writes = [];
for (const o of orders) {
  const config = o.productConfigId ? byId.get(String(o.productConfigId)) : undefined;
  if (!config) {
    stat.noConfig++;
    continue;
  }
  const v = pickVariation(config.variations, o.size, o.color);
  if (!v) {
    stat.noVariation++;
    continue;
  }
  if (!v.weight || v.weight <= 0) {
    stat.noWeight++;
    continue;
  }
  const set = { weight: v.weight };
  for (const k of ['width', 'height', 'length']) if (typeof v[k] === 'number' && v[k] > 0) set[k] = v[k];
  writes.push({ updateOne: { filter: { _id: o._id, weight: { $in: [null, undefined] } }, update: { $set: set } } });
  stat.filled++;
}

console.log(
  `Điền được: ${stat.filled} · không có product config: ${stat.noConfig} · biến thể mơ hồ/không khớp: ${stat.noVariation} · biến thể chưa có cân nặng: ${stat.noWeight}`,
);

if (!apply) {
  console.log('\nThử khô — chưa ghi gì. Thêm --yes để ghi thật.');
  console.log('Ví dụ 5 đơn sẽ điền:');
  for (const w of writes.slice(0, 5)) console.log(' ', w.updateOne.filter._id, JSON.stringify(w.updateOne.update.$set));
} else if (writes.length) {
  // Chia lô để không dựng một lệnh khổng lồ khi chạy trên prod.
  let done = 0;
  for (let i = 0; i < writes.length; i += 500) {
    const res = await db.collection('orders').bulkWrite(writes.slice(i, i + 500), { ordered: false });
    done += res.modifiedCount;
  }
  console.log(`Đã ghi ${done} đơn.`);
}

await mongoose.disconnect();

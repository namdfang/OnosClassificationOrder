/**
 * CÔNG CỤ CHỈ DÙNG CHO MÔI TRƯỜNG DEV/TEST — đặt mật khẩu mặc định cho các tài
 * khoản CHƯA CÓ mật khẩu, để tester đăng nhập được vào mọi tài khoản khi kiểm thử.
 *
 * Vì sao là script chạy tay chứ KHÔNG phải thay đổi luồng đăng nhập:
 * luồng đăng nhập (`AuthService` / `CustomerService.validateLogin`) giữ NGUYÊN,
 * nên bản build production không chứa bất kỳ đường vòng xác thực nào. Muốn dùng
 * thì phải chủ động chạy script này lên đúng DB test.
 *
 * Phạm vi tác động — CHỈ bản ghi có `password` thiếu / null / rỗng:
 *   - collection `users`     (nhân viên)
 *   - collection `customers` (khách hàng — bản ghi tạo qua sync/thêm tay có
 *     `password: ''`, xem CustomerPortal.md §2.1)
 * Tài khoản ĐÃ có mật khẩu thì KHÔNG bị đụng tới.
 *
 * Cách chạy (từ thư mục apps/api):
 *   node scripts/reset-empty-passwords.mjs --dry-run          # chỉ đếm, không ghi
 *   node scripts/reset-empty-passwords.mjs --yes              # ghi thật
 *   DB_URI=mongodb://... node scripts/reset-empty-passwords.mjs --yes
 *
 * Ba chốt chặn an toàn:
 *   1. Từ chối chạy khi NODE_ENV=production.
 *   2. Không ghi gì nếu thiếu cờ --yes (mặc định là dry-run).
 *   3. In rõ host + tên DB sắp ghi vào, để không lỡ tay trỏ nhầm DB thật.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { generateHash } from 'core';

const DEFAULT_PASSWORD = 'abc123456';
const TARGET_COLLECTIONS = ['users', 'customers'];
/** Bản ghi coi như CHƯA có mật khẩu. */
const EMPTY_PASSWORD_FILTER = { $or: [{ password: { $exists: false } }, { password: null }, { password: '' }] };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const apply = args.has('--yes');

// Nạp .env giống cách app chạy dev — biến môi trường sẵn có luôn thắng file.
dotenv.config({ path: path.join(__dirname, '../.env.development') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'production') {
  console.error('TỪ CHỐI CHẠY: NODE_ENV=production. Script này chỉ dành cho môi trường dev/test.');
  process.exit(1);
}

const uri = process.env.DB_URI;
if (!uri) {
  console.error('Thiếu DB_URI (đọc từ apps/api/.env.development, apps/api/.env hoặc biến môi trường).');
  process.exit(1);
}

/** Che user:pass trong URI trước khi in ra log. */
function describeTarget(rawUri) {
  try {
    const u = new URL(rawUri);
    const db = u.pathname.replace(/^\//, '') || '(mặc định)';
    return `${u.protocol}//${u.host} · db=${db}`;
  } catch {
    return '(không parse được URI)';
  }
}

console.log(`NODE_ENV : ${nodeEnv}`);
console.log(`MongoDB  : ${describeTarget(uri)}`);
console.log(`Chế độ   : ${apply ? 'GHI THẬT (--yes)' : 'DRY-RUN (thêm --yes để ghi)'}`);
console.log('');

await mongoose.connect(uri);

try {
  // Hash 1 lần rồi dùng lại: bcrypt cùng chuỗi vẫn ra hash khác nhau (salt ngẫu
  // nhiên) nhưng đều verify được — không cần hash riêng cho từng bản ghi.
  const passwordHash = generateHash(DEFAULT_PASSWORD);
  let grandTotal = 0;

  for (const name of TARGET_COLLECTIONS) {
    const collection = mongoose.connection.db.collection(name);
    const count = await collection.countDocuments(EMPTY_PASSWORD_FILTER);
    grandTotal += count;

    if (!apply) {
      console.log(`${name}: ${count} tài khoản chưa có mật khẩu (dry-run, chưa ghi)`);
      continue;
    }
    if (count === 0) {
      console.log(`${name}: 0 tài khoản chưa có mật khẩu — bỏ qua`);
      continue;
    }
    const res = await collection.updateMany(EMPTY_PASSWORD_FILTER, { $set: { password: passwordHash } });
    console.log(`${name}: đã đặt mật khẩu cho ${res.modifiedCount}/${count} tài khoản`);
  }

  console.log('');
  if (apply) {
    console.log(`XONG. Mật khẩu của các tài khoản trên là: ${DEFAULT_PASSWORD}`);
    console.log('Tài khoản vốn ĐÃ có mật khẩu thì giữ nguyên, script không đụng tới.');
  } else {
    console.log(`Tổng ${grandTotal} tài khoản sẽ bị đổi mật khẩu. Chạy lại với --yes để thực hiện.`);
  }
} finally {
  await mongoose.disconnect();
}

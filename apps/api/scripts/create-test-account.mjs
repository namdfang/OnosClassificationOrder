/**
 * CÔNG CỤ CHỈ DÙNG CHO MÔI TRƯỜNG DEV/TEST — tạo MỘT tài khoản nhân viên dùng
 * riêng cho kiểm thử (`ORD-1` AC-03: cần đăng nhập bằng role hẹp hơn để đối
 * chiếu action giữa 2 role có quyền khác nhau).
 *
 * Vì sao là script chạy tay chứ không phải seed tự động: nó GHI vào bảng `users`,
 * nên phải là hành động chủ động có người bấm, không phải thứ chạy kèm lúc khởi động.
 *
 * Ba chốt chặn an toàn — giống `reset-empty-passwords.mjs`:
 *   1. Từ chối chạy khi NODE_ENV=production.
 *   2. Không ghi gì nếu thiếu cờ --yes (mặc định là dry-run).
 *   3. In rõ host + tên DB trước khi ghi.
 *
 * KHÔNG đụng bất kỳ tài khoản nào đang tồn tại. Chạy lại lần hai thì bỏ qua
 * (email đã có) chứ không ghi đè.
 *
 * Cách chạy (từ thư mục apps/api):
 *   node scripts/create-test-account.mjs --dry-run
 *   node scripts/create-test-account.mjs --yes
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { generateHash } from 'core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const apply = args.has('--yes');

dotenv.config({ path: path.join(__dirname, '../.env.development') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'production') {
  console.error('TỪ CHỐI CHẠY: NODE_ENV=production. Script này chỉ dành cho môi trường dev/test.');
  process.exit(1);
}

const uri = process.env.DB_URI;
if (!uri) {
  console.error('Thiếu DB_URI.');
  process.exit(1);
}

/**
 * Tài khoản cần tạo. Email + tên CỐ TÌNH dễ nhận ra là tài khoản kiểm thử để
 * không ai nhầm với người thật khi nhìn danh sách người dùng.
 *
 * Mật khẩu KHÔNG dùng chuỗi mặc định của luồng mạo danh — chuỗi đó đã ghi công
 * khai trong tài liệu task nên không được dùng lại cho tài khoản đăng nhập được.
 */
const ACCOUNT = {
  email: 'qa.designer@test.local',
  fullName: '[TEST] QA Designer',
  password: 'Qa!Design#2026$onos',
  roleName: 'Designer',
};

function describeTarget(rawUri) {
  try {
    const u = new URL(rawUri);

    return `${u.protocol}//${u.host} · db=${u.pathname.replace(/^\//, '') || '(mặc định)'}`;
  } catch {
    return '(không parse được URI)';
  }
}

/** Mã người dùng — cùng bảng chữ cái/độ dài với `genCode(CODE_LENGTH)` của app. */
function genCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Bản sao của `myId()` (`packages/shared/utils/myId.ts`) — cùng bảng chữ cái và
 * ID_LENGTH=16. Viết lại tại chỗ chứ không import `shared`: gói đó là ESM kéo
 * theo dayjs plugin không resolve được từ script `.mjs` chạy tay.
 */
function myId(length = 16) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

console.log(`NODE_ENV : ${nodeEnv}`);
console.log(`MongoDB  : ${describeTarget(uri)}`);
console.log(`Chế độ   : ${apply ? 'GHI THẬT (--yes)' : 'DRY-RUN (thêm --yes để ghi)'}`);
console.log('');

await mongoose.connect(uri);

try {
  const users = mongoose.connection.db.collection('users');
  const roles = mongoose.connection.db.collection('roles');

  const role = await roles.findOne({ name: ACCOUNT.roleName });
  if (!role) {
    console.error(`Không tìm thấy role '${ACCOUNT.roleName}' trong collection roles.`);
    process.exit(1);
  }

  const existing = await users.findOne({ email: ACCOUNT.email });
  if (existing) {
    console.log(`Đã tồn tại ${ACCOUNT.email} — KHÔNG ghi đè, không đụng gì.`);
  } else if (!apply) {
    console.log(`Sẽ tạo: ${ACCOUNT.email} · role=${ACCOUNT.roleName} (${role._id}) · ${ACCOUNT.fullName}`);
    console.log('Chạy lại với --yes để thực hiện.');
  } else {
    // `status: '1'` dạng CHUỖI — khớp với 27/38 tài khoản hiện có. Trong DB này
    // `status` đang lưu lẫn kiểu (có bản ghi là số nguyên), nên chọn dạng phổ
    // biến nhất để tài khoản test không thành ca biệt lệ thứ hai.
    await users.insertOne({
      // `_id` PHẢI tự sinh bằng myId(). Toàn hệ thống dùng `_id` dạng CHUỖI
      // nanoid 16 ký tự (`DatabaseEntityAbstract`), trong khi `insertOne` bỏ
      // trống `_id` thì MongoDB tự gán ObjectId. Hậu quả không lộ ra lúc đăng
      // nhập — `validateUser` tra theo `email` nên vẫn trả token — mà lộ ở
      // request kế tiếp: `UserService.getUserById` chạy aggregation
      // `$match: { _id: id }` với `id` là chuỗi lấy từ JWT, chuỗi không bao giờ
      // khớp ObjectId, nên ném UserNotFound → 401 → giao diện đá về màn hình
      // đăng nhập ngay sau khi báo đăng nhập thành công.
      _id: myId(),
      email: ACCOUNT.email,
      fullName: ACCOUNT.fullName,
      password: generateHash(ACCOUNT.password),
      roleId: String(role._id),
      userCode: genCode(),
      status: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`ĐÃ TẠO ${ACCOUNT.email} · role=${ACCOUNT.roleName}`);
    console.log(`Mật khẩu: ${ACCOUNT.password}`);
  }
} finally {
  await mongoose.disconnect();
}

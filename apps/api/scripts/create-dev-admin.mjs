/**
 * CÔNG CỤ CHỈ DÙNG CHO MÔI TRƯỜNG DEV/TEST — tạo MỘT tài khoản SuperAdmin để
 * đăng nhập vào dev server (`dev-onos.autonow.vn`).
 *
 * Vì sao cần script riêng thay vì đổi mật khẩu một tài khoản có sẵn: DB dev là
 * bản sao của prod, nên mọi tài khoản trong đó là NGƯỜI THẬT. Đổi mật khẩu của
 * họ trên dev thì bản sao lần sau lại mất, mà lỡ tay chạy nhầm vào prod là khoá
 * mất tài khoản của người đang làm việc. Tài khoản riêng, tên cố tình dễ nhận
 * ra là đồ kiểm thử, thì không lẫn được với ai.
 *
 * Mỗi lần nạp lại dump từ prod là tài khoản này biến mất — chạy lại script.
 *
 * Ba chốt chặn an toàn — giống `create-test-account.mjs` và `reset-empty-passwords.mjs`:
 *   1. Từ chối chạy khi NODE_ENV=production.
 *   2. Không ghi gì nếu thiếu cờ --yes (mặc định là dry-run).
 *   3. In rõ host + tên DB trước khi ghi.
 *
 * KHÔNG đụng bất kỳ tài khoản nào đang tồn tại. Chạy lại lần hai thì đặt lại
 * mật khẩu cho đúng tài khoản này (không tạo trùng, không động vào ai khác).
 *
 * Cách chạy (từ thư mục apps/api):
 *   node scripts/create-dev-admin.mjs --dry-run
 *   node scripts/create-dev-admin.mjs --yes
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
 * Tên và email CỐ TÌNH dễ nhận ra là tài khoản kiểm thử, để khi nhìn danh sách
 * người dùng không ai nhầm nó với người thật.
 */
const ACCOUNT = {
  email: 'dev.admin@test.local',
  fullName: '[DEV] Admin',
  password: 'Dev!Admin#2026$onos',
  roleName: 'SuperAdmin',
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
 * theo dayjs plugin không resolve được từ script `.mjs` chạy tay. Cùng lý do
 * `genCode` ở trên cũng được viết lại thay vì import.
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

  if (!apply) {
    console.log(
      existing
        ? `Sẽ đặt lại mật khẩu cho ${ACCOUNT.email} (đã tồn tại) · role=${ACCOUNT.roleName}`
        : `Sẽ tạo: ${ACCOUNT.email} · role=${ACCOUNT.roleName} (${role._id}) · ${ACCOUNT.fullName}`,
    );
    console.log('Chạy lại với --yes để thực hiện.');
  } else if (existing) {
    // Đặt lại mật khẩu thay vì bỏ qua: tài khoản kiểm thử mà quên mật khẩu thì
    // vô dụng, và đây là tài khoản do chính script này tạo nên không giẫm lên ai.
    await users.updateOne(
      { _id: existing._id },
      {
        $set: {
          password: generateHash(ACCOUNT.password),
          roleId: String(role._id),
          status: '1',
          updatedAt: new Date(),
        },
      },
    );
    console.log(`ĐÃ ĐẶT LẠI mật khẩu cho ${ACCOUNT.email} · role=${ACCOUNT.roleName}`);
    console.log(`Mật khẩu: ${ACCOUNT.password}`);
  } else {
    // `status: '1'` dạng CHUỖI — khớp với đa số tài khoản hiện có. Trong DB này
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

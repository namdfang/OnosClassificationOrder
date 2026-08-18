import { ActionType } from 'shared';

/**
 * AUTH-1 — hai quy tắc dễ làm hỏng nhất, tách ra kiểm bằng hàm thuần vì bản thân
 * `ImpersonationService` cần cả Mongo lẫn JWT nên không unit-test trực tiếp được
 * trong hạ tầng test hiện có của repo.
 *
 * Hai quy tắc này là logic, không phải chi tiết cài đặt: nếu ai đó sửa service
 * theo cách vi phạm chúng thì AC-12 hoặc AC-14 hỏng, và hậu quả là **khoá khách
 * khỏi tài khoản của chính họ** hoặc **mở tài khoản khách cho người lạ**.
 * Kiểm thử đầu-cuối vẫn do TESTER làm theo Test Plan (TS-11..TS-14).
 */

/**
 * MIRROR điều kiện claim ở `CustomerService.register()` (AC-14/BR-15).
 *
 * Sửa hàm này thì PHẢI sửa `register()` và ngược lại.
 */
const isClaimable = (customer: { password?: string; passwordSource?: 'self' | 'system' }): boolean =>
  !customer.password || customer.passwordSource === 'system';

describe('AC-14/BR-15 — chính chủ vẫn tự đăng ký được sau khi bị mạo danh', () => {
  it('tài khoản chưa có mật khẩu (sync/thêm tay) thì claim được — hành vi cũ giữ nguyên', () => {
    expect(isClaimable({ password: '' })).toBe(true);
    expect(isClaimable({})).toBe(true);
  });

  it('mật khẩu do hệ thống đặt khi mạo danh thì VẪN claim được', () => {
    expect(isClaimable({ password: '$2a$10$hash', passwordSource: 'system' })).toBe(true);
  });

  it('khách tự đặt mật khẩu thì KHÔNG claim được — chặn người lạ đăng ký đè', () => {
    expect(isClaimable({ password: '$2a$10$hash', passwordSource: 'self' })).toBe(false);
  });

  it('bản ghi CŨ (chưa có field) mà đã có mật khẩu thì KHÔNG claim được', () => {
    // Tương thích ngược: mọi mật khẩu tồn tại trước AUTH-1 đều do khách tự đặt.
    // Đọc nhầm thành claim-được sẽ mở toàn bộ tệp khách cũ cho người lạ.
    expect(isClaimable({ password: '$2a$10$hash' })).toBe(false);
  });

  it('KHÔNG nhận biết bằng giá trị mật khẩu — khách tự chọn đúng chuỗi mặc định vẫn được bảo vệ', () => {
    // Đây là ràng buộc BA cấm tường minh. Cách sửa "dễ" là so
    // password === hash('abc123456') rồi cho claim; cách đó pass các case trên
    // nhưng SAI ở đây, và hậu quả là tài khoản của khách bị người khác đăng ký đè.
    const selfChosenSameString = { password: '$2a$10$hash-cua-abc123456', passwordSource: 'self' as const };
    expect(isClaimable(selfChosenSameString)).toBe(false);
  });
});

/**
 * MIRROR filter đặt mật khẩu ở `ImpersonationService.ensurePassword()` (AC-11/AC-12).
 *
 * Điểm cốt tử: điều kiện "chưa có mật khẩu" phải nằm NGAY TRONG FILTER của lệnh
 * update. Đọc-rồi-ghi có khe đua — giữa lúc đọc và lúc ghi, chính chủ có thể vừa
 * đặt mật khẩu, và ghi đè lên là khoá họ khỏi tài khoản của chính họ.
 */
const EMPTY_PASSWORD_CLAUSE = [{ password: { $exists: false } }, { password: null }, { password: '' }];
const buildEnsurePasswordFilter = (targetId: string) => ({ _id: targetId, $or: EMPTY_PASSWORD_CLAUSE });

describe('AC-11/AC-12 — đặt mật khẩu mặc định phải là thao tác NGUYÊN TỬ', () => {
  it('điều kiện "chưa có mật khẩu" nằm trong chính filter, không phải kiểm tra rời', () => {
    const filter = buildEnsurePasswordFilter('abc');
    expect(filter._id).toBe('abc');
    expect(filter.$or).toEqual(EMPTY_PASSWORD_CLAUSE);
  });

  it('phủ đủ 3 dạng "chưa có mật khẩu": thiếu field, null, chuỗi rỗng', () => {
    // Thiếu bất kỳ dạng nào thì một phần tài khoản sẽ không được đặt mật khẩu và
    // AC-11 trượt lặng lẽ trên đúng nhóm đó.
    expect(EMPTY_PASSWORD_CLAUSE).toHaveLength(3);
    expect(EMPTY_PASSWORD_CLAUSE).toContainEqual({ password: { $exists: false } });
    expect(EMPTY_PASSWORD_CLAUSE).toContainEqual({ password: null });
    expect(EMPTY_PASSWORD_CLAUSE).toContainEqual({ password: '' });
  });
});

describe('AC-05/BR-11/BR-13 — có đủ loại sự kiện để ghi vết', () => {
  it('4 giá trị ActionType mới đều tồn tại', () => {
    // Ghi vết phiên mạo danh tái dùng collection `actions` sẵn có thay vì bảng
    // mới; thiếu giá trị enum nào thì sự kiện tương ứng không ghi được.
    expect(ActionType.Impersonate).toBe('Impersonate');
    expect(ActionType.ImpersonateStop).toBe('Impersonate Stop');
    expect(ActionType.ImpersonateRejected).toBe('Impersonate Rejected');
    expect(ActionType.ImpersonatePasswordSet).toBe('Impersonate Password Set');
  });
});

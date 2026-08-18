export const Status = {
  Active: '1',
  Inactive: '0',
  Pending: '-1',
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const Gender = {
  Male: 'Male',
  Female: 'Female',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

export const StoreType = {
  Manual: 'Manual',
  API: 'API',
  Tiktok: 'Tiktok',
} as const;
export type StoreType = (typeof StoreType)[keyof typeof StoreType];

export const ActionType = {
  Login: 'Login',
  ResetPassword: 'Reset Password',
  ChangePassword: 'Change Password',
  // AUTH-1 — mạo danh tài khoản. Ghi vào CÙNG collection `actions` với Login
  // thay vì dựng bảng mới: nó đã có sẵn ip/userAgent/sessionId/active và chính
  // `clearTokens()` đang dùng `active` để đánh dấu phiên kết thúc.
  Impersonate: 'Impersonate',
  ImpersonateStop: 'Impersonate Stop',
  /** Lần gọi endpoint mạo danh bị từ chối vì không đủ quyền (AC-02). */
  ImpersonateRejected: 'Impersonate Rejected',
  /** Đặt mật khẩu mặc định cho tài khoản chưa có mật khẩu (BR-8/BR-13). */
  ImpersonatePasswordSet: 'Impersonate Password Set',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

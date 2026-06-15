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
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

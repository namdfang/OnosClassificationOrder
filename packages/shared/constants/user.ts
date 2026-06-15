export const UserLogType = {
  Create: 'Create',
  Update: 'Update',
  ResetPassword: 'Reset Password',
  ChangePassword: 'Change Password',
  Delete: 'Delete',
} as const;
export type UserLogType = (typeof UserLogType)[keyof typeof UserLogType];

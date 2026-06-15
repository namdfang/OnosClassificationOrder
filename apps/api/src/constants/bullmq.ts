/* eslint-disable no-redeclare */
export const BullQueue = {
  RefreshTrackingStatus: 'RefreshTrackingStatus',
  ScanTransactionEmail: 'ScanTransactionEmail',
  SendMail: 'SendMail',
};
export type BullQueue = (typeof BullQueue)[keyof typeof BullQueue];

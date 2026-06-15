export const DEFAULT_CURRENCY = 'USD';

export enum TransactionMethod {
  Wallet = 'Wallet',
  CreditCard = 'CreditCard',
  Paypal = 'Paypal',
  // DirectPayoneer = 'DirectPayoneer',
}

export enum PaymentPlatform {
  Payoneer = 'Payoneer',
  Pingpong = 'Pingpong',
  LianLian = 'LianLian',
  WorldFirst = 'WorldFirst',
  Paypal = 'Paypal',
  BankTransfer = 'BankTransfer',
  AutoBankTransfer = 'AutoBankTransfer',
}

export enum TopupType {
  Payoneer = 'Payoneer',
  Pingpong = 'Pingpong',
  LianLian = 'LianLian',
  WorldFirst = 'WorldFirst',
  Paypal = 'Paypal',
  BankTransfer = 'BankTransfer',
  AutoBankTransfer = 'AutoBankTransfer',
}

export enum TransactionType {
  Topup = 'Topup',
  DirectTopup = 'DirectTopup',
  Charge = 'Charge',
  Withdraw = 'Withdraw',
  CreditTopup = 'CreditTopup',
  PartiallyRefund = 'PartiallyRefund',
  Refund = 'Refund',
}

export enum TransactionStatus {
  Pending = 'Pending',
  Processing = 'Processing',
  Failed = 'Failed',
  Completed = 'Completed',
  Rejected = 'Rejected',
}

export const TRANSACTION_EXPORT_HEADERS = {
  code: 'Code',
  sellerNote: 'Seller Note',
  systemNote: 'System Note',
  externalId: 'External Id',
  amount: 'Amount',
  balanceBefore: 'Balance Before',
  balanceAfter: 'Balance After',
  imageId: 'Image Id',
  orderIds: 'Order Ids',
  storeCode: 'Store Code',
  status: 'Status',
  method: 'Method',
  type: 'Type',
  topupType: 'Topup Type',
  currency: 'Currency',
  userId: 'User Id',
  email: 'Email',
  processById: 'Process By Id',
  createdAt: 'Created At',
  updatedAt: 'Updated At',
};
export const REVERSED_TRANSACTION_EXPORT_HEADERS = {};
for (const key in TRANSACTION_EXPORT_HEADERS) {
  // @ts-expect-error types
  const value = TRANSACTION_EXPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_TRANSACTION_EXPORT_HEADERS[value] = key;
}

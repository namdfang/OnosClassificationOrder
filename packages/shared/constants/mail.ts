export const MailType = {
  Payment: 'Payment',
  Custom: 'Custom',
} as const;
export type MailType = (typeof MailType)[keyof typeof MailType];

export const MailStatus = {
  Pending: 'Pending',
  Sending: 'Sending',
  Done: 'Done',
  Error: 'Error',
};
export type MailStatus = (typeof MailStatus)[keyof typeof MailStatus];

export const MAIL_IMPORT_HEADERS = {
  email: 'Mail',
  name: 'Tên seller',
  subject: 'Tiêu đề',
  body: 'Nội dung',
};

export const REVERSE_MAIL_IMPORT_HEADERS = {};

for (const key in MAIL_IMPORT_HEADERS) {
  // @ts-expect-error types
  const value = MAIL_IMPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSE_MAIL_IMPORT_HEADERS[value] = key;
}

import { ExcelImportTracking } from '..';
export const TrackingType = {
  Manual: 'Manual',
  Import: 'Import',
  Bulk: 'Bulk',
} as const;
export type TrackingType = (typeof TrackingType)[keyof typeof TrackingType];

export const TRACKING_IMPORT_HEADERS: Record<keyof ExcelImportTracking, string> = {
  trackingNumber: 'Tracking Number',
  department: 'PKD',
  shippingLabelUrl: 'Shipping Label URL',
  orderId: 'Order ID',
  startDate: 'Start Date',
  provider: 'Provider',
  weight: 'Weight',

  result: 'Result',
} as const;

export const REVERSED_TRACKING_IMPORT_HEADERS: Record<string, string> = {};
for (const key in TRACKING_IMPORT_HEADERS) {
  const value = TRACKING_IMPORT_HEADERS[key as keyof typeof TRACKING_IMPORT_HEADERS];
  REVERSED_TRACKING_IMPORT_HEADERS[value] = key;
}

export const TRACKING_EXPORT_HEADERS = {
  trackingNumber: 'Tracking Number',
  department: 'PKD',
  shippingLabelUrl: 'Shipping Label URL',
  orderId: 'Order ID',
  status: 'Status',
  startDate: 'Start Date',
  detail: 'Detail',
  lastFetchedAt: 'Last Fetched At',
  carrier: 'Carrier',
  userId: 'User ID',
  providerId: 'Provider Id',
  weight: 'Weight',
  note: 'Note',
  price: 'Price',
};

export const REVERSED_TRACKING_EXPORT_HEADERS = {};
for (const key in TRACKING_EXPORT_HEADERS) {
  // @ts-expect-error types
  const value = TRACKING_EXPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_TRACKING_EXPORT_HEADERS[value] = key;
}

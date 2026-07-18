import { ExcelImportDropShipOrder } from '..';

export const DROPSHIP_ORDER_CODE_PREFIX = 'PS_';

export const DEFAULT_DROPSHIP_ORDER_LABEL_FEE = 0; // 0.5;

export enum DropshipOrderStatus {
  Pending = 'Pending',
  Confirmed = 'Confirmed',
  Processing = 'Processing',
  ShipOut = 'ShipOut',
  ShipmentReceived = 'ShipmentReceived',
  Adjustment = 'Adjustment',
  AdjustmentCompleted = 'AdjustmentCompleted',
  Fulfillment = 'Fulfillment',
  // Placed = 'Placed',
  Manifest = 'Manifest',
  USArrival = 'USArrival',
  CarrierReceived = 'CarrierReceived',
  InTransit = 'InTransit',

  OutForDelivery = 'OutForDelivery',
  Delivered = 'Delivered',
  TrackingHold = 'TrackingHold',
  Completed = 'Completed',

  Refunded = 'Refunded',
  Canceled = 'Canceled',

  TrackingMissing = 'TrackingMissing',
  ScanMissing = 'ScanMissing',
}

export const DropshipOrderType = {
  Manual: 'Manual',
  Import: 'Import',
  Bulk: 'Bulk',
} as const;
export type DropshipOrderType = (typeof DropshipOrderType)[keyof typeof DropshipOrderType];

// Download front, back artworks, label files

// Partial: schema đã thêm `marketplace`/`marketplaceOrderIds` sau khi bảng
// header này được viết — data giữ nguyên, chỉ nới type cho khớp.
export const DROPSHIP_ORDER_IMPORT_HEADERS: Partial<Record<keyof ExcelImportDropShipOrder, string>> = {
  orderId: 'Order ID',
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  addressLine1: 'Address Line 1',
  addressLine2: 'Address Line 2',
  city: 'City',
  region: 'Region',
  zip: 'Zip',
  country: 'Country',
  providerName: 'Provider',
  externalLink: 'Link Product',
  imageLink: 'Link Picture',
  title: 'Title',
  sellerNote: 'Seller Note',
  color: 'Color',
  size: 'Size',
  createdDate: 'Date',
  quantity: 'Quantity',
  trackingNumber: 'Tracking Number',
  shippingLabelUrl: 'Link Label',
  scanTracking: 'Scan active tracking 48h (1.5$)',
  localTracking: 'Local Tracking number',
  weight: 'Weight',
  type: 'Type',
  result: 'Result',
} as const;

export const REVERSED_DROPSHIP_ORDER_IMPORT_HEADERS = {};
for (const key in DROPSHIP_ORDER_IMPORT_HEADERS) {
  // @ts-expect-error types
  const value = DROPSHIP_ORDER_IMPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_DROPSHIP_ORDER_IMPORT_HEADERS[value] = key;
}

export const DROPSHIP_ORDER_EXPORT_HEADERS = {
  orderId: 'Order ID',
  // marketplaceOrderIds: 'Marketplace Order IDs',
  // marketplace: 'Marketplace',
  variantId: 'Variant ID',
  title: 'Title',
  // items: 'Items',
  status: 'Status',
  productPrice: 'Product Price',
  idPaid: 'Paid',
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  country: 'Country',
  region: 'Region',
  addressLine1: 'Address Line 1',
  addressLine2: 'Address Line 2',
  city: 'City',
  zip: 'Zip',
  // provider: 'Provider',
  quantity: 'Quantity',
  shippingLabelUrl: 'Shipping Label Url',
  trackingNumber: 'Tracking Number',
  sellerNote: 'Seller Note',
  createdAt: 'Upload Date',
  updatedAt: 'Updated Date',
  imageLink: 'Image Link',
  externalLink: 'Product Link',
  weight: 'Weight',
  dimensions: 'Dimensions',
  shipFee: 'Ship Fee',
  localTracking: 'Local Tracking',
  sku: 'SKU',
  color: 'Color',
  size: 'Size',
  baseCost: 'Base Cost',
  orderTotal: 'Order Total',
  refundAmount: 'Refund Amount',
  labelFee: 'Label Fee',
  scanFee: 'Scan Fee',
  createdDate: 'Created Date',
  fulfillmentFee: 'Fulfillment Fee',
  department: 'Department',
  erpUser: 'ERP User',
  erpShopCode: 'ERP Shop Code',
  erpDepartment: 'ERP Department',
  cnyPrice: 'CNY Price (¥)',
  type: 'Type',
  sellerEmail: 'Seller Email',
  shipOutDate: 'Ship Out Date',
  shipmentReceivedDate: 'Shipment Received Date',
  fulfillDate: 'Fulfill Date',
  inTransitDate: 'In Transit Date',
  deliveredDate: 'Delivered Date',
  manifestDate: 'Manifest Date',
  usArrivalDate: 'US Arrival Date',
  carrierReceiveDate: 'Carrier Receive Date',
  cancelDate: 'Cancel Date',
  refundDate: 'Refund Date',
  processingDate: 'Processing Date',
  purchaseAccount: 'Purchase Account',
  purchaseOrderId: 'Purchase Order ID',
} as const;

export const REVERSED_DROPSHIP_ORDER_EXPORT_HEADERS = {};
for (const key in DROPSHIP_ORDER_EXPORT_HEADERS) {
  // @ts-expect-error types
  const value = DROPSHIP_ORDER_EXPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_DROPSHIP_ORDER_EXPORT_HEADERS[value] = key;
}

export const DropshipOrderStatisticChartType = {
  Week: 'Week',
  Month: 'Month',
  ThreeMonth: 'Three Month',
  Year: 'Year',
} as const;

export const DropshipOrderStatisticChartGroupBy = {
  Day: 'Day',
  Week: 'Week',
  Month: 'Month',
} as const;

// DropshipOrder Tracking
export const DROPSHIP_ORDER_PRICE_IMPORT_HEADERS = {
  orderId: 'Order ID',
  variant: 'Variant ID',
  // price: 'Price',
  weight: 'Weight (g)',
  dimension: 'Dimension (cm x cm x cm)',

  // sku: 'SKU',
  baseCost: 'Base cost ($)',
  shipFee: 'Ship fee ($)',
  cnyPrice: 'CNY Price (¥)',
  // after formatted
  result: 'Result',
  purchaseAccount: 'Purchase Account',
  purchaseOrderId: 'Purchase Order ID',
} as const;

export const REVERSED_DROPSHIP_ORDER_PRICE_IMPORT_HEADERS = {};
for (const key in DROPSHIP_ORDER_PRICE_IMPORT_HEADERS) {
  // @ts-expect-error types
  const value = DROPSHIP_ORDER_PRICE_IMPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_DROPSHIP_ORDER_PRICE_IMPORT_HEADERS[value] = key;
}

// Bulk Ship Out DropshipOrders
export const BULK_UPDATE_STATUS_DROPSHIP_ORDERS_HEADERS = {
  orderId: 'Order ID',
  trackingNumber: 'Tracking Number',
  status: 'Status',
  date: 'Date',

  // after formatted
  result: 'Result',
} as const;

// @ts-expect-error type
export const REVERSED_BULK_UPDATE_STATUS_DROPSHIP_ORDERS_HEADERS: Record<
  (typeof BULK_UPDATE_STATUS_DROPSHIP_ORDERS_HEADERS)[keyof typeof BULK_UPDATE_STATUS_DROPSHIP_ORDERS_HEADERS],
  string
> = {};
for (const key in BULK_UPDATE_STATUS_DROPSHIP_ORDERS_HEADERS) {
  // @ts-expect-error types
  const value = BULK_UPDATE_STATUS_DROPSHIP_ORDERS_HEADERS[key];
  // @ts-expect-error types
  REVERSED_BULK_UPDATE_STATUS_DROPSHIP_ORDERS_HEADERS[value] = key;
}

export const BulkImportUpdateDropshipOrderType = {
  ShipOut: 'Ship Out',
  Manifest: 'Manifest',
  USArrival: 'US Arrival',
  CarrierReceived: 'Carrier Received',
};

export type BulkImportUpdateDropshipOrderType =
  (typeof BulkImportUpdateDropshipOrderType)[keyof typeof BulkImportUpdateDropshipOrderType];

export const BulkImportUpdateDropshipOrderTypeMap = {
  [BulkImportUpdateDropshipOrderType.Manifest]: DropshipOrderStatus.Manifest,
  [BulkImportUpdateDropshipOrderType.USArrival]: DropshipOrderStatus.USArrival,
  [BulkImportUpdateDropshipOrderType.CarrierReceived]: DropshipOrderStatus.CarrierReceived,
};

// Provider
// export const FlashshipDropshipOrderStatus = {
//   Confirmed: 'Confirmed',
//   Grouped: 'Grouped',
//   InProducing: 'InProducing', // 'Producing',
//   WaitToShip: 'Wait to ship',
//   Completed: 'Completed',
//   Rejected: 'Rejected',
//   RequestToReject: 'Request to reject',
//   Hold: 'Hold',
// } as const;
// export type FlashshipDropshipOrderStatus =
//   (typeof FlashshipDropshipOrderStatus)[keyof typeof FlashshipDropshipOrderStatus];

// export const BeefunDropshipOrderStatus = {
//   Created: 'Created', // DropshipOrder is created manually.
//   Imported: 'Imported', // DropshipOrder is imported by csv
//   Paid: 'Paid', // DropshipOrder is paid
//   InProduction: 'InProduction', // Start manufacturing.
//   Produced: 'Produced', // Fulfill Dropship order, then waiting to get tracking number.
//   Canceled: 'Canceled',
//   Completed: 'Completed', // Yêu cầu hủy đơn cho "R240513040106" đã được chấp thuận.
// } as const;
// export type BeefunDropshipOrderStatus = (typeof BeefunDropshipOrderStatus)[keyof typeof BeefunDropshipOrderStatus];

// export const BurgerPrintsPaidStatus = {
//   Incompleted: 'Incompleted',
//   Paid: 'Paid',
//   Refunded: 'Refunded',
// } as const;
// export type BurgerPrintsPaidStatus = (typeof BurgerPrintsPaidStatus)[keyof typeof BurgerPrintsPaidStatus];

// export const BurgerPrintsDropshipOrderStatus = {
//   Unfulfilled: 'Unfulfilled',
//   Scheduled: 'Scheduled',
//   Fulfilled: 'Fulfilled',
// } as const;
// export type BurgerPrintsDropshipOrderStatus =
//   (typeof BurgerPrintsDropshipOrderStatus)[keyof typeof BurgerPrintsDropshipOrderStatus];

// export const OnosPodDropshipOrderStatus = {
//   Pending: 'Pending',
//   Processing: 'Processing',
//   InProduction: 'InProduction',
//   Fulfilled: 'Fulfilled',
//   Completed: 'Completed',
//   Refunded: 'Refunded',
//   Canceled: 'Canceled',
//   Trashed: 'Trashed',
// } as const;
// export type OnosPodDropshipOrderStatus = (typeof OnosPodDropshipOrderStatus)[keyof typeof OnosPodDropshipOrderStatus];

// export const ProviderDropshipOrderStatus = {
//   ...BeefunDropshipOrderStatus,
//   ...FlashshipDropshipOrderStatus,
//   ...BurgerPrintsDropshipOrderStatus,
//   ...OnosPodDropshipOrderStatus,
// } as const;
// export type ProviderDropshipOrderStatus =
//   (typeof ProviderDropshipOrderStatus)[keyof typeof ProviderDropshipOrderStatus];

export const DROPSHIP_ORDER_ITEM_INFO_IMPORT_HEADERS = {
  orderId: 'Order ID',
  variant: 'Variant ID',
  // price: 'Price',
  productLink: 'Product Link',
  sku: 'SKU',

  localTracking: 'Local Tracking number',
  purchaseAccount: 'Purchase Account',
  purchaseOrderId: 'Purchase Order ID',
  cnyPrice: 'CNY Price',
  // after formatted
  result: 'Result',
} as const;

export const REVERSED_DROPSHIP_ORDER_ITEM_INFO_IMPORT_HEADERS = {};
for (const key in DROPSHIP_ORDER_ITEM_INFO_IMPORT_HEADERS) {
  // @ts-expect-error types
  const value = DROPSHIP_ORDER_ITEM_INFO_IMPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_DROPSHIP_ORDER_ITEM_INFO_IMPORT_HEADERS[value] = key;
}

export const DROPSHIP_ORDER_ITEM_WEIGHT_IMPORT_HEADERS = {
  orderId: 'Order ID',
  variant: 'Variant ID',
  weight: 'Weight (g)',
  result: 'Result',
} as const;

export const REVERSED_DROPSHIP_ORDER_ITEM_WEIGHT_IMPORT_HEADERS = {};
for (const key in DROPSHIP_ORDER_ITEM_WEIGHT_IMPORT_HEADERS) {
  // @ts-expect-error types
  const value = DROPSHIP_ORDER_ITEM_WEIGHT_IMPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_DROPSHIP_ORDER_ITEM_WEIGHT_IMPORT_HEADERS[value] = key;
}

export const BETA_SHIP_FEE = 13; //1000g
export const UAT_SHIP_FEE = 11; //1000g

export const BETA_FULFILLMENT_FEE = 1.5;
export const UAT_FULFILLMENT_FEE = 0.7;

export const DROPSHIP_ORDER_TYPE = {
  CUSTOM: 'Custom',
  SYSTEM: 'System',
} as const;
export type DROPSHIP_ORDER_TYPE = (typeof DROPSHIP_ORDER_TYPE)[keyof typeof DROPSHIP_ORDER_TYPE];

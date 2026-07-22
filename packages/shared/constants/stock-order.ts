import type { ExcelImportStockOrder } from '../dtos/stock-order.dto';

export const STOCK_ORDER_CODE_PREFIX = 'PS_';

export const DEFAULT_STOCK_ORDER_LABEL_FEE = 0; // 0.5;

export enum StockOrderStatus {
  Pending = 'Pending',
  ShipmentReceived = 'ShipmentReceived',
  Fulfillment = 'Fulfillment',
  // Placed = 'Placed',
  Manifest = 'Manifest',
  USArrival = 'USArrival',
  InTransit = 'InTransit',

  Delivered = 'Delivered',
  TrackingHold = 'TrackingHold',
  Completed = 'Completed',

  Refunded = 'Refunded',
  Canceled = 'Canceled',

  TrackingMissing = 'TrackingMissing',
  ScanMissing = 'ScanMissing',
}

export const StockOrderType = {
  Manual: 'Manual',
  Import: 'Import',
  Bulk: 'Bulk',
} as const;
export type StockOrderType = (typeof StockOrderType)[keyof typeof StockOrderType];

// Download front, back artworks, label files

// `| 'weight'`: cột Weight vẫn nằm trong sheet import nhưng key `weight` đã
// rời khỏi ExcelImportStockOrder — data giữ nguyên, chỉ nới type cho khớp.
export const STOCK_ORDER_IMPORT_HEADERS: Partial<Record<keyof ExcelImportStockOrder | 'weight', string>> = {
  seller: 'Seller',
  orderId: 'Order ID',
  name: 'shipping name',
  phone: 'Phone',
  addressLine1: 'shipping address_1',
  city: 'shipping city',
  region: 'shipping state',
  zip: 'shipping zipcode',
  country: 'shipping country',
  providerName: 'Provider',
  externalLink: 'Link Product',
  mockupUrl: 'Mockup url 1',
  sku: 'Variant ID',
  imageLink: 'Link Picture',
  title: 'Title',
  color: 'Color',
  size: 'Size',
  createdDate: 'Date',
  quantity: 'Quantity',
  trackingNumber: 'Tracking Number',
  shippingLabelUrl: 'Link Label',
  scanTracking: 'Scan active tracking 48h (1.5$)',
  localTracking: 'Local Tracking number',
  weight: 'Weight (gram)',
  type: 'Type',
  result: 'Result',
} as const;

export const REVERSED_STOCK_ORDER_IMPORT_HEADERS = {};
for (const key in STOCK_ORDER_IMPORT_HEADERS) {
  // @ts-expect-error types
  const value = STOCK_ORDER_IMPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_STOCK_ORDER_IMPORT_HEADERS[value] = key;
}

export const STOCK_ORDER_EXPORT_HEADERS = {
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
  type: 'Type',
  sellerEmail: 'Seller Email',
} as const;

export const REVERSED_STOCK_ORDER_EXPORT_HEADERS = {};
for (const key in STOCK_ORDER_EXPORT_HEADERS) {
  // @ts-expect-error types
  const value = STOCK_ORDER_EXPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_STOCK_ORDER_EXPORT_HEADERS[value] = key;
}

export const StockOrderStatisticChartType = {
  Week: 'Week',
  Month: 'Month',
  ThreeMonth: 'Three Month',
  Year: 'Year',
} as const;

export const StockOrderStatisticChartGroupBy = {
  Day: 'Day',
  Week: 'Week',
  Month: 'Month',
} as const;

// StockOrder Tracking
export const STOCK_ORDER_PRICE_IMPORT_HEADERS = {
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
} as const;

export const REVERSED_STOCK_ORDER_PRICE_IMPORT_HEADERS = {};
for (const key in STOCK_ORDER_PRICE_IMPORT_HEADERS) {
  // @ts-expect-error types
  const value = STOCK_ORDER_PRICE_IMPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_STOCK_ORDER_PRICE_IMPORT_HEADERS[value] = key;
}

// Bulk Ship Out StockOrders
export const BULK_UPDATE_STATUS_STOCK_ORDERS_HEADERS = {
  orderId: 'Order ID',
  trackingNumber: 'Tracking Number',
  status: 'Status',
  date: 'Date',

  // after formatted
  result: 'Result',
} as const;

// @ts-expect-error type
export const REVERSED_BULK_UPDATE_STATUS_STOCK_ORDERS_HEADERS: Record<
  (typeof BULK_UPDATE_STATUS_STOCK_ORDERS_HEADERS)[keyof typeof BULK_UPDATE_STATUS_STOCK_ORDERS_HEADERS],
  string
> = {};
for (const key in BULK_UPDATE_STATUS_STOCK_ORDERS_HEADERS) {
  // @ts-expect-error types
  const value = BULK_UPDATE_STATUS_STOCK_ORDERS_HEADERS[key];
  // @ts-expect-error types
  REVERSED_BULK_UPDATE_STATUS_STOCK_ORDERS_HEADERS[value] = key;
}

export const BulkImportUpdateStockOrderType = {
  ShipOut: 'Ship Out',
  Manifest: 'Manifest',
  USArrival: 'US Arrival',
  CarrierReceived: 'Carrier Received',
};

export type BulkImportUpdateStockOrderType =
  (typeof BulkImportUpdateStockOrderType)[keyof typeof BulkImportUpdateStockOrderType];

export const BulkImportUpdateStockOrderTypeMap = {
  [BulkImportUpdateStockOrderType.Manifest]: StockOrderStatus.Manifest,
  [BulkImportUpdateStockOrderType.USArrival]: StockOrderStatus.USArrival,
};

// Provider
// export const FlashshipStockOrderStatus = {
//   Confirmed: 'Confirmed',
//   Grouped: 'Grouped',
//   InProducing: 'InProducing', // 'Producing',
//   WaitToShip: 'Wait to ship',
//   Completed: 'Completed',
//   Rejected: 'Rejected',
//   RequestToReject: 'Request to reject',
//   Hold: 'Hold',
// } as const;
// export type FlashshipStockOrderStatus =
//   (typeof FlashshipStockOrderStatus)[keyof typeof FlashshipStockOrderStatus];

// export const BeefunStockOrderStatus = {
//   Created: 'Created', // StockOrder is created manually.
//   Imported: 'Imported', // StockOrder is imported by csv
//   Paid: 'Paid', // StockOrder is paid
//   InProduction: 'InProduction', // Start manufacturing.
//   Produced: 'Produced', // Fulfill Stock order, then waiting to get tracking number.
//   Canceled: 'Canceled',
//   Completed: 'Completed', // Yêu cầu hủy đơn cho "R240513040106" đã được chấp thuận.
// } as const;
// export type BeefunStockOrderStatus = (typeof BeefunStockOrderStatus)[keyof typeof BeefunStockOrderStatus];

// export const BurgerPrintsPaidStatus = {
//   Incompleted: 'Incompleted',
//   Paid: 'Paid',
//   Refunded: 'Refunded',
// } as const;
// export type BurgerPrintsPaidStatus = (typeof BurgerPrintsPaidStatus)[keyof typeof BurgerPrintsPaidStatus];

// export const BurgerPrintsStockOrderStatus = {
//   Unfulfilled: 'Unfulfilled',
//   Scheduled: 'Scheduled',
//   Fulfilled: 'Fulfilled',
// } as const;
// export type BurgerPrintsStockOrderStatus =
//   (typeof BurgerPrintsStockOrderStatus)[keyof typeof BurgerPrintsStockOrderStatus];

// export const OnosPodStockOrderStatus = {
//   Pending: 'Pending',
//   Processing: 'Processing',
//   InProduction: 'InProduction',
//   Fulfilled: 'Fulfilled',
//   Completed: 'Completed',
//   Refunded: 'Refunded',
//   Canceled: 'Canceled',
//   Trashed: 'Trashed',
// } as const;
// export type OnosPodStockOrderStatus = (typeof OnosPodStockOrderStatus)[keyof typeof OnosPodStockOrderStatus];

// export const ProviderStockOrderStatus = {
//   ...BeefunStockOrderStatus,
//   ...FlashshipStockOrderStatus,
//   ...BurgerPrintsStockOrderStatus,
//   ...OnosPodStockOrderStatus,
// } as const;
// export type ProviderStockOrderStatus =
//   (typeof ProviderStockOrderStatus)[keyof typeof ProviderStockOrderStatus];

export const STOCK_ORDER_ITEM_INFO_IMPORT_HEADERS = {
  orderId: 'Order ID',
  variant: 'Variant ID',
  // price: 'Price',
  productLink: 'Product Link',
  sku: 'SKU',

  localTracking: 'Local Tracking number',

  // after formatted
  result: 'Result',
} as const;

export const REVERSED_STOCK_ORDER_ITEM_INFO_IMPORT_HEADERS = {};
for (const key in STOCK_ORDER_ITEM_INFO_IMPORT_HEADERS) {
  // @ts-expect-error types
  const value = STOCK_ORDER_ITEM_INFO_IMPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_STOCK_ORDER_ITEM_INFO_IMPORT_HEADERS[value] = key;
}

export const STOCK_ORDER_ITEM_WEIGHT_IMPORT_HEADERS = {
  orderId: 'Order ID',
  variant: 'Variant ID',
  weight: 'Weight (g)',
  result: 'Result',
} as const;

export const REVERSED_STOCK_ORDER_ITEM_WEIGHT_IMPORT_HEADERS = {};
for (const key in STOCK_ORDER_ITEM_WEIGHT_IMPORT_HEADERS) {
  // @ts-expect-error types
  const value = STOCK_ORDER_ITEM_WEIGHT_IMPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_STOCK_ORDER_ITEM_WEIGHT_IMPORT_HEADERS[value] = key;
}

export const BETA_STOCK_SHIP_FEE = 13; //1000g
export const UAT_STOCK_SHIP_FEE = 11; //1000g

export const BETA_STOCK_FULFILLMENT_FEE = 1.5;
export const UAT_STOCK_FULFILLMENT_FEE = 1;

export const STOCK_ORDER_TYPE = {
  CUSTOM: 'Custom',
  SYSTEM: 'System',
} as const;
export type STOCK_ORDER_TYPE = (typeof STOCK_ORDER_TYPE)[keyof typeof STOCK_ORDER_TYPE];

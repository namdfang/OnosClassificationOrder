import type { ExcelImportOrder } from '@shared/dtos';

import { getObjectValues } from '../utils/getObjectValues';

export const ORDER_CODE_PREFIX = 'PE_';

export const DEFAULT_ORDER_LABEL_FEE = 0; // 0.5;

export const MAX_LIMIT = 1000000000;

export const ShippingCarrier = {
  DHL: 'DHL',
  USPS: 'USPS',
  UPS: 'UPS',
  FEDEX: 'FEDEX',
} as const;
export type ShippingCarrier = (typeof ShippingCarrier)[keyof typeof ShippingCarrier];
export const SHIPPING_CARRIERS = getObjectValues(ShippingCarrier);

export enum OrderStatus {
  Created = 'Created',
  Imported = 'Imported',
  NoArtwork = 'NoArtwork',
  Unmatched = 'Unmatched',

  Pending = 'Pending',
  OnHold = 'OnHold',
  Processing = 'Processing',
  // ! special case
  TrackingMissing = 'TrackingMissing',
  // ! special case
  InProduction = 'InProduction',
  Produced = 'Produced',
  Packaging = 'Packaging',
  PickupReady = 'PickupReady',
  PickedUp = 'PickedUp',
  PreTransit = 'PreTransit',
  InTransit = 'InTransit',
  PartiallyDelivered = 'PartiallyDelivered',
  OutForDelivery = 'OutForDelivery',
  Delivered = 'Delivered',
  TrackingHold = 'TrackingHold',
  Completed = 'Completed',

  ShipOut = 'ShipOut',
  ShipmentReceived = 'ShipmentReceived',
  Manifest = 'Manifest',
  USArrival = 'USArrival',
  CarrierReceived = 'CarrierReceived',
  Pickup = 'Pickup',

  Canceled = 'Canceled',
  Rejected = 'Rejected',
  Refunded = 'Refunded',
  PartiallyRefunded = 'PartiallyRefunded',
  Returned = 'Returned',
  ArtworkError = 'ArtworkError',
}

export const ShippingMethod = {
  Standard: 'Standard',
  Expedited: 'Expedited',
  FlashShipLine1: 'FlashShipLine1',
  FlashShipLine3: 'FlashShipLine3',
  FlashShipLine6: 'FlashShipLine6',
} as const;
export type ShippingMethod = (typeof ShippingMethod)[keyof typeof ShippingMethod];

export const ProductionLine = {
  Standard: 'Standard', // FlashShipLine1
  FlashShipLine3: 'FlashShipLine3',
  FlashShipLine6: 'FlashShipLine6',
} as const;
export type ProductionLine = (typeof ProductionLine)[keyof typeof ProductionLine];

export enum LineItemStatus {
  Created = 'Created',
  Imported = 'Imported',
  NoArtwork = 'NoArtwork',
  Unmatched = 'Unmatched',

  Pending = 'Pending',
  OnHold = 'OnHold',
  Processing = 'Processing',
  InProduction = 'InProduction',
  Produced = 'Produced',
  PickupReady = 'PickupReady',
  PickedUp = 'PickedUp',
  PreTransit = 'PreTransit',
  InTransit = 'InTransit',
  Delivered = 'Delivered',
  Completed = 'Completed',

  Canceled = 'Canceled',
  Rejected = 'Rejected',
  Refunded = 'Refunded',
  PartiallyRefunded = 'PartiallyRefunded',
  Returned = 'Returned',
  ArtworkError = 'ArtworkError',
}

export const OrderType = {
  Manual: 'Manual',
  Import: 'Import',
  Bulk: 'Bulk',
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const ShippingType = {
  Normal: 'Normal',
  Label: 'Label',
  FBA: 'FBA',
} as const;
export type ShippingType = (typeof ShippingType)[keyof typeof ShippingType];

export const LabelService = {
  None: 'None',
  Tiktok: 'Tiktok',
  Amazon: 'Amazon',
  Etsy: 'Etsy',
} as const;
export type LabelService = (typeof LabelService)[keyof typeof LabelService];

// For local factory but 3rd shipping service
export const ThirdShippingService = {
  None: 'None',
  ISO: 'ISO',
  ONOS: 'ONOS',
  HPW: 'HPW',
} as const;
export type ThirdShippingService = (typeof ThirdShippingService)[keyof typeof ThirdShippingService];

export enum ShippingStatus {
  None = 'None',
  Pending = 'Pending',
  PickedUp = 'PickedUp',
  Awaiting = 'Awaiting',
  InTransit = 'InTransit',
  PartiallyDelivered = 'PartiallyDelivered',
  Delivered = 'Delivered',
  AddressError = 'AddressError',
}

// Download front, back artworks, label files
export enum DownloadStatus {
  None = 'None',
  Pending = 'Pending',
  Downloading = 'Downloading',
  Completed = 'Completed',
  Error = 'Error',
}

export const ORDER_IMPORT_HEADERS: Record<keyof ExcelImportOrder, string> = {
  externalId: 'Order ID',
  marketplaceOrderIds: 'Marketplace Order IDs',
  marketplace: 'Marketplace',
  labelService: 'Platform',
  shippingMethod: 'Shipping Method',
  productionLine: 'Production Line',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  addressLine1: 'Address line 1',
  addressLine2: 'Address line 2',
  city: 'City',
  region: 'Region',
  zip: 'Zip',
  country: 'Country',
  storeName: 'Store name',
  providerName: 'Provider',
  providerCode: 'Provider Code',
  productName: 'Product name',
  variantLabel: 'Variant Label',
  variantOption1: 'Variant Option 1',
  variantOption2: 'Variant Option 2',
  variantOption3: 'Variant Option 3',
  variantOption4: 'Variant Option 4',
  variantOption5: 'Variant Option 5',

  sellerNote: 'Seller Note',
  color: 'Color',
  size: 'Size',

  variantId: 'Variant ID',
  // name: 'Product name',
  printArea: 'Print area',
  quantity: 'Quantity',
  frontArtworkUrl: 'Front artwork url',
  backArtworkUrl: 'Back artwork url',
  leftArtworkUrl: 'Left artwork url',
  rightArtworkUrl: 'Right artwork url',
  collarArtworkUrl: 'Collar artwork url',
  mockupUrl1: 'Mockup url 1',
  mockupUrl2: 'Mockup url 2',
  shippingLabelUrl: 'Shipping label url',
  trackingNumber: 'Tracking number',

  // for provider
  providerOptionalSku: 'Provider Optional SKU',

  // after formatted
  shippingType: 'Shipping Type',
  productCode: 'Product Code',
  mockupUrls: 'Mockup Urls',
  result: 'Result',
  index: 'Index',
} as const;

export const REVERSED_ORDER_IMPORT_HEADERS = {};
for (const key in ORDER_IMPORT_HEADERS) {
  // @ts-expect-error types
  const value = ORDER_IMPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_ORDER_IMPORT_HEADERS[value] = key;
}

export const ORDER_EXPORT_HEADERS = {
  externalId: 'Order ID',
  orderCode: 'Order Code',
  store: 'Store Name',
  labelService: 'Platform',
  shippingMethod: 'Shipping Method',
  shippingType: 'Shipping Type',
  status: 'Status',
  trackingStatus: 'Tracking Status',
  idPaid: 'Paid',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  country: 'Country',
  region: 'Region',
  addressLine1: 'Address line 1',
  addressLine2: 'Address line 2',
  city: 'City',
  zip: 'Zip',
  provider: 'Provider',
  providerCode: 'Provider Code',
  productName: 'Product name',
  variantId: 'Variant ID',
  variantSku: 'Variant SKU',
  variantLabel: 'Variant Label',
  // variantOption1: 'Variant Option 1',
  // variantOption2: 'Variant Option 2',
  // variantOption3: 'Variant Option 3',
  // variantOption4: 'Variant Option 4',
  // variantOption5: 'Variant Option 5',
  printArea: 'Print area',
  quantity: 'Quantity',
  frontArtworkUrl: 'Front artwork url',
  backArtworkUrl: 'Back artwork url',
  leftArtworkUrl: 'Left artwork url',
  rightArtworkUrl: 'Right artwork url',
  collarArtworkUrl: 'Collar artwork url',
  mockupUrl1: 'Mockup url 1',
  mockupUrl2: 'Mockup url 2',
  shippingLabelUrl: 'Shipping label url',
  trackingNumber: 'Tracking number',
  sellerNote: 'Seller Note',
  orderTotal: 'Order Total',
  itemTotal: 'Item Total',
  refundAmount: 'Refund Amount',
  refundPercentage: 'Refund Percentage',
  providerPrice: 'Provider Price',
  extraItemFee: 'Extra Item Fee',
  expeditedFee: 'Expedited Fee',
  shippingFee: 'Shipping Fee',
  variantShippingFee: 'Variant Shipping Fee',
  variantBasePrice: 'Variant Base Price',
  variantOriginalPrice: 'Variant Original Price',
  barCodeUrl: 'Barcode Url',
  qrCodeUrl: 'QRCode Url',
  createdAt: 'Created Date',
  updatedAt: 'Updated Date',
  sellerEmail: 'Seller Email',
  sellerName: 'Seller Name',
  erpUser: 'ERP User',
  erpShopCode: 'ERP Shop Code',
  erpDepartment: 'ERP Department',
  department: 'Department',

  // for provider
  providerOptionalSku: 'Provider Optional SKU',

  // for Folinas accountant
  date: 'Date',

  // for Logistics
  shipOutDate: 'Ship Out Date',
  shipmentReceivedDate: 'Shipment Received Date',
  manifestDate: 'Manifest Date',
  usArrivalDate: 'US Arrival Date',
  carrierReceiveDate: 'Carrier Received Date',
  pendingDate: 'Pending Date',
  deliveryDate: 'Delivery Date',
  cancelDate: 'Cancel Date',
  client: 'Client',
  // for variant
  // color: 'Color',
  // size: 'Size',
  // printArea: 'Print Area',
} as const;

export const REVERSED_ORDER_EXPORT_HEADERS = {};
for (const key in ORDER_EXPORT_HEADERS) {
  // @ts-expect-error types
  const value = ORDER_EXPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_ORDER_EXPORT_HEADERS[value] = key;
}

export const OrderStatisticChartType = {
  Week: 'Week',
  Month: 'Month',
  ThreeMonth: 'Three Month',
  Year: 'Year',
} as const;

export const OrderStatisticChartGroupBy = {
  Day: 'Day',
  Week: 'Week',
  Month: 'Month',
} as const;

// Order Tracking
export const ORDER_TRACKING_IMPORT_HEADERS = {
  orderId: 'Order ID',
  shippingLabelUrl: 'Shipping Label URL',
  trackingNumber: 'Tracking Number',

  // after formatted
  result: 'Result',
} as const;

export const REVERSED_ORDER_TRACKING_IMPORT_HEADERS = {};
for (const key in ORDER_TRACKING_IMPORT_HEADERS) {
  // @ts-expect-error types
  const value = ORDER_TRACKING_IMPORT_HEADERS[key];
  // @ts-expect-error types
  REVERSED_ORDER_TRACKING_IMPORT_HEADERS[value] = key;
}

// Bulk Ship Out Orders
export const BULK_SHIP_OUT_ORDERS_HEADERS = {
  // orderId: 'Order ID',
  trackingNumber: 'Tracking Number',
  type: 'Type',
  date: 'Date',
  boxSku: 'Box SKU',

  // after formatted
  result: 'Result',
} as const;

// @ts-expect-error type
export const REVERSED_BULK_SHIP_OUT_ORDERS_HEADERS: Record<
  (typeof BULK_SHIP_OUT_ORDERS_HEADERS)[keyof typeof BULK_SHIP_OUT_ORDERS_HEADERS],
  string
> = {};
for (const key in BULK_SHIP_OUT_ORDERS_HEADERS) {
  // @ts-expect-error types
  const value = BULK_SHIP_OUT_ORDERS_HEADERS[key];
  // @ts-expect-error types
  REVERSED_BULK_SHIP_OUT_ORDERS_HEADERS[value] = key;
}

export const BulkImportUpdateOrderType = {
  ShipOut: 'Ship Out',
  UpdateShipOutDate: 'Update Ship Out Date',
  ShipmentReceived: 'Shipment Received',
  Manifest: 'Manifest',
  USArrival: 'US Arrival',
  CarrierReceived: 'Carrier Received',
};
export type BulkImportUpdateOrderType = (typeof BulkImportUpdateOrderType)[keyof typeof BulkImportUpdateOrderType];

export const BulkImportUpdateOrderTypeMap = {
  [BulkImportUpdateOrderType.ShipOut]: OrderStatus.ShipOut,
  [BulkImportUpdateOrderType.ShipmentReceived]: OrderStatus.ShipmentReceived,
  [BulkImportUpdateOrderType.Manifest]: OrderStatus.Manifest,
  [BulkImportUpdateOrderType.USArrival]: OrderStatus.USArrival,
  [BulkImportUpdateOrderType.CarrierReceived]: OrderStatus.CarrierReceived,
};

// Provider
export const FlashshipOrderStatus = {
  Confirmed: 'Confirmed',
  Grouped: 'Grouped',
  InProducing: 'InProducing', // 'Producing',
  WaitToShip: 'Wait to ship',
  Completed: 'Completed',
  Rejected: 'Rejected',
  RequestToReject: 'Request to reject',
  Hold: 'Hold',
} as const;
export type FlashshipOrderStatus = (typeof FlashshipOrderStatus)[keyof typeof FlashshipOrderStatus];

export const BeefunOrderStatus = {
  Created: 'Created', // Order is created manually.
  Imported: 'Imported', // Order is imported by csv
  Paid: 'Paid', // Order is paid
  InProduction: 'InProduction', // Start manufacturing.
  Produced: 'Produced', // Fulfill order, then waiting to get tracking number.
  Canceled: 'Canceled',
  Completed: 'Completed', // Yêu cầu hủy đơn cho "R240513040106" đã được chấp thuận.
} as const;
export type BeefunOrderStatus = (typeof BeefunOrderStatus)[keyof typeof BeefunOrderStatus];

export const BurgerPrintsPaidStatus = {
  Incompleted: 'Incompleted',
  Paid: 'Paid',
  Refunded: 'Refunded',
} as const;
export type BurgerPrintsPaidStatus = (typeof BurgerPrintsPaidStatus)[keyof typeof BurgerPrintsPaidStatus];

export const BurgerPrintsOrderStatus = {
  draft: 'draft',
  processed: 'processed',
  shipped: 'shipped',
} as const;
export type BurgerPrintsOrderStatus = (typeof BurgerPrintsOrderStatus)[keyof typeof BurgerPrintsOrderStatus];

export const OnosPodOrderStatus = {
  Pending: 'Pending',
  Processing: 'Processing',
  InProduction: 'InProduction',
  Fulfilled: 'Fulfilled',
  Completed: 'Completed',
  Refunded: 'Refunded',
  Canceled: 'Canceled',
  Trashed: 'Trashed',
} as const;
export type OnosPodOrderStatus = (typeof OnosPodOrderStatus)[keyof typeof OnosPodOrderStatus];

export const UsFulfillOrderStatus = {
  New: 'New',
  Shipped: 'Shipped',
} as const;
export type UsFulfillOrderStatus = (typeof UsFulfillOrderStatus)[keyof typeof UsFulfillOrderStatus];

export const GearmentOrderStatus = {
  Processing: 'processing',
  Completed: 'completed',
  Canceled: 'canceled',
} as const;
export type GearmentOrderStatus = (typeof GearmentOrderStatus)[keyof typeof GearmentOrderStatus];

export const PrintCareOrderStatus = {
  AwaitingForApproval: 'Awaiting for Approval',
  OnHold: 'On Hold',
  Paid: 'Paid',
  InProduction: 'In Production',
  Fulfilled: 'Fulfilled',
  InTransit: 'In Transit',
  OutForDelivery: 'Out for delivery',
  Delivered: 'Delivered',
  Closed: 'Closed',
  Canceled: 'Canceled',
} as const;
export type PrintCareOrderStatus = (typeof PrintCareOrderStatus)[keyof typeof PrintCareOrderStatus];

export const ProviderOrderStatus = {
  ...BeefunOrderStatus,
  ...FlashshipOrderStatus,
  ...BurgerPrintsOrderStatus,
  ...OnosPodOrderStatus,
  ...UsFulfillOrderStatus,
} as const;
export type ProviderOrderStatus = (typeof ProviderOrderStatus)[keyof typeof ProviderOrderStatus];

export const TIME_RANGES: Record<string, { min?: number; max?: number; label: string }> = {
  RANGE_1_7: { min: 1, max: 7, label: '1-7 days' },
  RANGE_7_15: { min: 7, max: 15, label: '7-15 days' },
  RANGE_15_30: { min: 15, max: 30, label: '15-30 days' },
  RANGE_30_PLUS: { min: 30, label: '30+ days' },
  RANGE_0_1: { min: 0, max: 1, label: '0-1 days' },
  RANGE_1_PLUS: { min: 1, label: '1+ days' },
} as const;

// Partial: chỉ define cho 6 status có tracking time-range — data giữ nguyên.
export const STATUS_TIME_RANGES: Partial<Record<OrderStatus, typeof TIME_RANGES>> = {
  [OrderStatus.InProduction]: {
    RANGE_3_7: { min: 3, max: 7, label: '3-7 days' },
    RANGE_7_15: { min: 7, max: 15, label: '7-15 days' },
    RANGE_15_30: { min: 15, max: 30, label: '15-30 days' },
    RANGE_30_PLUS: { min: 30, label: '30+ days' },
    // Pie Chart
    RANGE_0_3: { min: 0, max: 3, label: '0-3 days' },
    RANGE_3_PLUS: { min: 3, label: '3+ days' },
  },
  [OrderStatus.ShipOut]: {
    RANGE_3_7: { min: 3, max: 7, label: '3-7 days' },
    RANGE_7_15: { min: 7, max: 15, label: '7-15 days' },
    RANGE_15_30: { min: 15, max: 30, label: '15-30 days' },
    RANGE_30_PLUS: { min: 30, label: '30+ days' },
    // Pie Chart
    RANGE_0_3: { min: 0, max: 3, label: '0-3 days' },
    RANGE_3_PLUS: { min: 3, label: '3+ days' },
  },
  [OrderStatus.ShipmentReceived]: {
    RANGE_2_7: { min: 2, max: 7, label: '3-7 days' },
    RANGE_7_15: { min: 7, max: 15, label: '7-15 days' },
    RANGE_15_30: { min: 15, max: 30, label: '15-30 days' },
    RANGE_30_PLUS: { min: 30, label: '30+ days' },
    // Pie Chart
    RANGE_0_2: { min: 0, max: 2, label: '0-2 days' },
    RANGE_2_PLUS: { min: 2, label: '2+ days' },
  },
  [OrderStatus.Manifest]: {
    RANGE_3_7: { min: 3, max: 7, label: '3-7 days' },
    RANGE_7_15: { min: 7, max: 15, label: '7-15 days' },
    RANGE_15_30: { min: 15, max: 30, label: '15-30 days' },
    RANGE_30_PLUS: { min: 30, label: '30+ days' },
    // Pie Chart
    RANGE_0_3: { min: 0, max: 3, label: '0-3 days' },
    RANGE_3_PLUS: { min: 3, label: '3+ days' },
  },
  [OrderStatus.USArrival]: {
    RANGE_3_7: { min: 3, max: 7, label: '3-7 days' },
    RANGE_7_15: { min: 7, max: 15, label: '7-15 days' },
    RANGE_15_30: { min: 15, max: 30, label: '15-30 days' },
    RANGE_30_PLUS: { min: 30, label: '30+ days' },
    // Pie Chart
    RANGE_0_3: { min: 0, max: 3, label: '0-3 days' },
    RANGE_3_PLUS: { min: 3, label: '3+ days' },
  },
  [OrderStatus.CarrierReceived]: {
    RANGE_7_15: { min: 7, max: 15, label: '7-15 days' },
    RANGE_15_21: { min: 15, max: 21, label: '15-21 days' },
    RANGE_21_30: { min: 21, max: 30, label: '21-30 days' },
    RANGE_30_PLUS: { min: 30, label: '30+ days' },
    // Pie Chart
    RANGE_0_7: { min: 0, max: 7, label: '0-7 days' },
    RANGE_7_PLUS: { min: 7, label: '7+ days' },
  },
} as const;

// Partial: chỉ define transition cho các status trong flow chính — data giữ nguyên.
export const NEXT_ORDER_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.Pending]: [OrderStatus.Processing],
  [OrderStatus.Processing]: [OrderStatus.InProduction],
  [OrderStatus.InProduction]: [OrderStatus.ShipOut],
  [OrderStatus.ShipOut]: [OrderStatus.ShipmentReceived, OrderStatus.Manifest],
  [OrderStatus.ShipmentReceived]: [OrderStatus.Manifest],
  [OrderStatus.Manifest]: [OrderStatus.USArrival],
  [OrderStatus.USArrival]: [OrderStatus.CarrierReceived],
  [OrderStatus.CarrierReceived]: [OrderStatus.Delivered],
} as const;

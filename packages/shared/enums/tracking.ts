export const TrackingStatus = {
  Pending: 'Pending',
  Created: 'Created',
  InTransit: 'InTransit',
  OutForDelivery: 'OutForDelivery',
  Delivered: 'Delivered',
  NotDelivered: 'Not Delivered',
  PickupHeld: 'PickupHeld',
  Returned: 'ReturnedToSender',
  AdditionalActions: 'AdditionalActions', // may be pickup held
  Error: 'Error',
  NotFound: 'NotFound',
  NotAvailable: 'NotAvailable',
  // ! virtual
  TrackingNumberMissing: 'Tracking Number Missing',
} as const;
export type TrackingStatus = (typeof TrackingStatus)[keyof typeof TrackingStatus];

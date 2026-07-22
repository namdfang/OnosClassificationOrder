import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { CODE_LENGTH, DESCRIPTION_MAX_LENGTH, EXTERNAL_ID_MAX_LENGTH, ID_LENGTH, NAME_MAX_LENGTH, NAME_MIN_LENGTH, NOTE_MAX_LENGTH, NOTE_MIN_LENGTH, PRIORITY_MAX, PRIORITY_MIN, QUANTITY_MAX } from '../constants/common-length';
import { BooleanZod, CodeZod, ExternalIDZod, IDZod, NameZod, optionalStringTransform, OptionalURLZod, TrackingNumberZod, URLZod } from '../constants/common-zod';
import { Marketplace } from '../constants/marketplace';
import { BulkImportUpdateOrderType, DownloadStatus, LabelService, OrderStatisticChartGroupBy, OrderStatisticChartType, OrderStatus, OrderType, ProductionLine, ShippingMethod, ShippingStatus, ShippingType, ThirdShippingService } from '../constants/order';
import { TransactionZod } from './transaction.dto';
import { PrintArea } from '../enums/product';
import { ProviderCode } from '../enums/provider-code';
import { TrackingStatus } from '../enums/tracking';
import { getObjectValues } from '../utils/getObjectValues';
import { CreateLineItemZod } from './order-item.dto';

export const ShippingAddressZod = z.object({
  firstName: NameZod,
  lastName: z.string().min(0).optional(),
  email: z.string().min(0).optional(),
  phone: z.string().min(0).max(NAME_MAX_LENGTH).trim().optional(),
  addressLine1: z.string().min(0).max(DESCRIPTION_MAX_LENGTH).trim(),
  addressLine2: z.string().min(0).max(DESCRIPTION_MAX_LENGTH).trim().optional(),
  city: NameZod,
  zip: z.string().max(NAME_MAX_LENGTH).trim(),
  region: NameZod,
  country: NameZod,
});
export type ShippingAddress = z.infer<typeof ShippingAddressZod>;

export const OrderTrackingZod = z.object({
  trackingNumber: TrackingNumberZod,
  // carrierName: z.string().default('USPS'),
  carrierCode: z.string().default('USPS'),
  trackingUrl: z.string().trim().optional(),
  shippingLabelUrl: URLZod.optional(),
});
export type OrderTracking = z.infer<typeof OrderTrackingZod>;

export const OrderLogZod = z.object({
  status: z.nativeEnum(OrderStatus),
  date: z.date(),
  message: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).trim().optional(),
  statusChanged: z.boolean().default(true),
  updatedById: IDZod,
  hidden: z.boolean().optional(),
  actionType: z.string().optional(),
});
export type OrderLog = z.infer<typeof OrderLogZod>;

export const OrderZod = BaseEntityZod.extend({
  externalId: ExternalIDZod,
  code: z.string(),
  shippingAddress: ShippingAddressZod.optional(),
  shippingMethod: z.enum(getObjectValues(ShippingMethod)).default(ShippingMethod.Standard),
  providerOrderId: z.string().optional(),
  providerOrderStatus: z.string().optional(),
  providerId: IDZod,
  providerOrderFetchedAt: z.date().optional(),
  type: z.enum(getObjectValues(OrderType)),
  userId: IDZod,
  status: z.nativeEnum(OrderStatus).default(OrderStatus.Pending),
  priority: z.number().min(PRIORITY_MIN).max(PRIORITY_MAX),
  shippingStatus: z.nativeEnum(ShippingStatus).default(ShippingStatus.None),
  tracking: OrderTrackingZod.optional(),
  cancelCode: z.string().length(4).optional(),
  lineItemIds: z.array(IDZod),
  quantity: z.number(),
  logs: z.array(OrderLogZod),
  isPaid: z.boolean().default(false),
  storeId: IDZod,
  subTotal: z.number(),
  total: z.number(),
  providerTotal: z.number().optional(),
  labelFee: z.number().optional(),
  shippingFee: z.number().optional(),
  extraItemFee: z.number().optional(),
  shippingType: z.nativeEnum(ShippingType).default(ShippingType.Label),
  labelService: z.enum(getObjectValues(LabelService)).default(LabelService.Tiktok),
  productionLine: z.enum(getObjectValues(ProductionLine)).default(ProductionLine.Standard),
  thirdShippingService: z.enum(getObjectValues(ThirdShippingService)).default(ThirdShippingService.None),
  labelFileId: IDZod.nullable(),
  downloadStatus: z.nativeEnum(DownloadStatus),
  downloadErrors: z.string().nullable(),
  sellerNote: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).optional(),
  systemNote: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).optional(),
  cancelNote: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).optional(),
  refundPercentage: z.number().optional(),
  refundAmount: z.number().optional(),
  refundNote: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).optional(),
  personalization: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).optional(),
  //
  shipOutDate: z.coerce.date().optional(),
  shipmentReceivedDate: z.coerce.date().optional(),
  manifestDate: z.coerce.date().optional(),
  usArrivalDate: z.coerce.date().optional(),
  carrierReceiveDate: z.coerce.date().optional(),
  deliveredDate: z.coerce.date().optional(),
  // externalLink: z.string().min(NAME_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).trim().optional(),
  archived: z.boolean().optional(),
  trackingStatus: z.nativeEnum(TrackingStatus).optional(),
  referrerId: z.string().optional(),
  referrerEmail: z.string().email().trim().optional(),
  isCombined: z.boolean().optional(),

  marketplace: z.enum(getObjectValues(Marketplace)).optional(),
  marketplaceOrderIds: z.array(ExternalIDZod).optional(),
  erpUserId: IDZod.optional(),
  erpUser: z.string().optional(),
  erpDepartment: z.string().optional(),

  // Partner API tagging — set when order created via /api/v1/partner/orders
  apiKeyId: z.string().optional(),
  partnerEnv: z.enum(['test', 'live']).optional(),
  partnerExternalRef: z.string().optional(),
});
export type Order = z.infer<typeof OrderZod>;

//
export const GetOrdersZod = PageQueryZod.extend({
  status: OrderZod.shape.status.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  singleItem: z.string().optional(),
  storeId: z.string().optional(),
  externalId: z.string().optional(),
  productCode: z.string().optional(),
  productId: IDZod.optional(),
  variantCode: CodeZod.optional(),
  providerId: IDZod.optional(),
  departmentId: IDZod.optional(),
  trackingNumber: TrackingNumberZod.optional(),
  trackingNumberIn: z.string().optional(),
  email: z.string().optional(),
  shippingType: OrderZod.shape.shippingType.optional(),
  archived: z.string().optional(),
  providerOrderId: z.string().optional(),
  trackingStatus: z.enum(getObjectValues(TrackingStatus)).optional(),
  isReferrerOrder: z.coerce.boolean().optional(),
  externalIds: z.string().optional(),
  country: z.string().optional(),
  shippingMethod: z.string().optional(),
  scan: z.coerce.boolean().optional(),
  cacheKey: z.string().optional(),
  referrerId: IDZod.optional(),
  referrerEmail: z.string().email().trim().optional(),
  isExport: z.coerce.boolean().optional(),
});
export class GetOrdersDto extends createZodDto(extendApi(GetOrdersZod)) {}
export const GetOrdersResZod = PageResZod.extend({
  data: OrderZod.partial().array(),
});
export class GetOrdersResDto extends createZodDto(extendApi(GetOrdersResZod)) {}

//
export const CreateOrderZod = z.object({
  externalId: OrderZod.shape.externalId,
  sellerNote: OrderZod.shape.sellerNote.optional(),
  shippingAddress: ShippingAddressZod.optional(),
  lineItems: z.array(CreateLineItemZod),
  storeId: OrderZod.shape.storeId.optional(),
  // type: z.nativeEnum(OrderType),
  labelFileId: OrderZod.shape.labelFileId,
  shippingMethod: OrderZod.shape.shippingMethod,
  shippingType: OrderZod.shape.shippingType,
  labelService: OrderZod.shape.labelService,
  productionLine: OrderZod.shape.productionLine,
  // externalLink: OrderZod.shape.externalLink,
  personalization: OrderZod.shape.personalization,

  // for manual shipping
  firstName: ShippingAddressZod.shape.firstName.optional(),
  lastName: ShippingAddressZod.shape.lastName.optional(),
  phone: ShippingAddressZod.shape.phone.optional(),
  email: ShippingAddressZod.shape.email.optional(),
  addressLine1: ShippingAddressZod.shape.addressLine1.optional(),
  addressLine2: ShippingAddressZod.shape.addressLine2.optional(),
  city: ShippingAddressZod.shape.city.optional(),
  zip: ShippingAddressZod.shape.zip.optional(),
  region: ShippingAddressZod.shape.region.optional(),
  country: ShippingAddressZod.shape.country.optional(),
  isCombined: z.boolean().optional(),
  marketplace: z.enum(getObjectValues(Marketplace)).optional(),
  marketplaceOrderIds: z.array(ExternalIDZod).optional(),
  erpUserId: IDZod.optional(),
  erpUser: z.string().optional(),
  erpDepartment: z.string().optional(),
  erpShopCode: z.string().optional(),
});
export class CreateOrderDto extends createZodDto(extendApi(CreateOrderZod)) {}
export const CreateOrderResZod = ResZod.extend({
  data: OrderZod,
});
export class CreateOrderResDto extends createZodDto(extendApi(CreateOrderResZod)) {}

//
export const UpdateOrderZod = z.object({
  status: OrderZod.shape.status.optional(),
});
export class UpdateOrderDto extends createZodDto(extendApi(UpdateOrderZod)) {}
export const UpdateOrderResZod = ResZod.extend({
  data: z.boolean(),
});
export class UpdateOrderResDto extends createZodDto(extendApi(UpdateOrderResZod)) {}

//
export const GetStatisticsZod = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export const GetOrderStatisticsZod = GetStatisticsZod.extend({
  archived: BooleanZod.optional(),
  status: OrderZod.shape.status.optional(),
  shippingType: z.string().optional(),
  trackingStatus: z.enum(getObjectValues(TrackingStatus)).optional(),
  search: z.string().trim().optional(),
  externalId: z.string().optional(),
  productId: IDZod.optional(),
  trackingNumber: TrackingNumberZod.optional(),
  storeId: z.string().optional(),
  email: z.string().email().optional(),
  providerId: z.string().optional(),
  departmentId: z.string().optional(),
  providerOrderId: z.string().optional(),
  lastFetchedAt: z.coerce.date().optional(),
  isReferrerOrder: z.coerce.boolean().optional(),
  externalIds: z.string().optional(),
  country: z.string().optional(),
  shippingMethod: z.string().optional(),
  cacheKey: z.string().optional(),
  referrerId: z.string().optional(),
  referrerEmail: z.string().email().trim().optional(),
});

export class GetStatisticsDto extends createZodDto(extendApi(GetStatisticsZod)) {}

export class GetOrderStatisticsDto extends createZodDto(extendApi(GetOrderStatisticsZod)) {}
export const GetOrderStatisticsResZod = ResZod;
export class GetOrderStatisticsResDto extends createZodDto(extendApi(GetOrderStatisticsResZod)) {}

//
export const UpdateNoteZod = z.object({
  note: OrderZod.shape.sellerNote,
});
export class UpdateNoteDto extends createZodDto(extendApi(UpdateNoteZod)) {}

export const UpdateOrderTrackingZod = z.object({
  trackingNumber: OrderTrackingZod.shape.trackingNumber,
  shippingLabelUrl: URLZod.optional(),
});
export class UpdateOrderTrackingDto extends createZodDto(extendApi(UpdateOrderTrackingZod)) {}
export type UpdateOrderTrackingValues = z.infer<typeof UpdateOrderTrackingZod>;

//
export const CalculateOrdersPaymentZod = z.object({
  orderIds: z.array(IDZod),
});
export const CalculateOrderPaymentResultZod = z.object({
  orderId: IDZod,
  total: z.number().optional(),
  storeName: z.string().optional(),
  message: z.string().optional(),
});
export type CalculateOrderPaymentResult = z.infer<typeof CalculateOrderPaymentResultZod>;
export class CalculateOrdersPaymentDto extends createZodDto(extendApi(CalculateOrdersPaymentZod)) {}
export const CalculateOrdersPaymentResZod = ResZod.extend({
  data: z.object({
    totalAmount: z.number(),
    orders: z.array(CalculateOrderPaymentResultZod),
  }),
});
export class CalculateOrdersPaymentResDto extends createZodDto(extendApi(CalculateOrdersPaymentResZod)) {}

//
export const PayOrdersZod = z.object({
  orderIds: z.array(IDZod),
});
export class PayOrdersDto extends createZodDto(extendApi(PayOrdersZod)) {}
export const PayOrdersResZod = ResZod.extend({
  data: z.object({
    totalAmount: z.number(),
    orders: z.array(CalculateOrderPaymentResultZod),
    transaction: TransactionZod,
  }),
});
export class PayOrdersResDto extends createZodDto(extendApi(PayOrdersResZod)) {}

//
export const UpdateArtworkErrorZod = z.object({
  orderId: IDZod,
  lineItemId: IDZod,
  error: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).trim(),
});
export class UpdateArtworkErrorDto extends createZodDto(UpdateArtworkErrorZod) {}

//
export const ExcelImportOrderZod = z
  .object({
    externalId: OrderZod.shape.externalId,
    storeName: z.string().trim().optional().transform(optionalStringTransform),
    labelService: OrderZod.shape.labelService,
    shippingMethod: z
      .enum([ShippingMethod.Standard, ShippingMethod.Expedited, '1', '3', '6']) // 6
      .default(ShippingMethod.Standard)
      .optional(),
    productionLine: OrderZod.shape.productionLine,
    quantity: z.coerce.number().min(1).max(QUANTITY_MAX),
    printArea: z.string().trim().toLowerCase().default(PrintArea.OneSide).optional(),
    variantId: z.string().trim().min(CODE_LENGTH).max(ID_LENGTH),
    frontArtworkUrl: OptionalURLZod, // z.string().trim().min(0).max(DESCRIPTION_MAX_LENGTH).optional(),
    backArtworkUrl: OptionalURLZod,
    leftArtworkUrl: OptionalURLZod,
    rightArtworkUrl: OptionalURLZod,
    collarArtworkUrl: OptionalURLZod,
    mockupUrl1: OptionalURLZod,
    mockupUrl2: OptionalURLZod,
    // personalization: OrderZod.shape.personalization.optional().transform(optionalStringTransform),

    productName: z.string().trim().optional().transform(optionalStringTransform),
    variantLabel: z.string().trim().optional().transform(optionalStringTransform),
    variantOption1: z.string().trim().optional().transform(optionalStringTransform),
    variantOption2: z.string().trim().optional().transform(optionalStringTransform),
    variantOption3: z.string().trim().optional().transform(optionalStringTransform),
    variantOption4: z.string().trim().optional().transform(optionalStringTransform),
    variantOption5: z.string().trim().optional().transform(optionalStringTransform),

    // provider
    providerName: z.string().trim().optional().transform(optionalStringTransform),
    providerCode: z.string().trim().optional().transform(optionalStringTransform),
    // for label shipping
    shippingLabelUrl: OptionalURLZod,
    trackingNumber: TrackingNumberZod.optional(),

    // for manual shipping
    firstName: ShippingAddressZod.shape.firstName.optional(),
    lastName: ShippingAddressZod.shape.lastName.optional(),
    phone: ShippingAddressZod.shape.phone.optional().transform(optionalStringTransform),
    email: ShippingAddressZod.shape.email.optional().transform(optionalStringTransform),
    addressLine1: ShippingAddressZod.shape.addressLine1.optional(),
    addressLine2: ShippingAddressZod.shape.addressLine2.optional().transform(optionalStringTransform),
    city: ShippingAddressZod.shape.city.optional(),
    zip: ShippingAddressZod.shape.zip.optional(),
    region: ShippingAddressZod.shape.region.optional(),
    country: ShippingAddressZod.shape.country.optional(),

    sellerNote: z.string().trim().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).optional(),
    color: z.string().trim().min(0).max(NOTE_MAX_LENGTH).optional(),
    size: z.string().trim().min(0).max(NOTE_MAX_LENGTH).optional(),

    // for provider
    providerOptionalSku: z.string().trim().optional().transform(optionalStringTransform),

    // after formatted
    index: z.number().optional(),
    productCode: z.string().trim().optional(),
    result: z.string().optional(),
    shippingType: z.enum(getObjectValues(ShippingType)).optional(),
    marketplace: z.enum(getObjectValues(Marketplace)).optional(),
    marketplaceOrderIds: z.string().optional(),

    // user email
    // userEmail: z.string().email().optional(),
  })
  .superRefine((data, ctx) => {
    const isLabelShipping = data.shippingLabelUrl || data.trackingNumber;
    const isNormalShipping = !isLabelShipping;

    if (data.frontArtworkUrl) {
      try {
        new URL(data.frontArtworkUrl);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Front artwork URL is not valid.',
          path: ['frontArtworkUrl'],
        });
      }
    }

    if (data.backArtworkUrl) {
      try {
        new URL(data.backArtworkUrl);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Back artwork URL is not valid.',
          path: ['backArtworkUrl'],
        });
      }
    }

    if (data.mockupUrl1) {
      try {
        new URL(data.mockupUrl1);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Mockup URL 1 is not valid.',
          path: ['mockupUrl1'],
        });
      }
    }

    if (data.mockupUrl2) {
      try {
        new URL(data.mockupUrl2);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Mockup URL 2 is not valid.',
          path: ['mockupUrl2'],
        });
      }
    }

    if (data.externalId.includes('+')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'External ID cannot contain "+" symbol.',
        path: ['externalId'],
      });
    }

    if (!data.frontArtworkUrl && !data.backArtworkUrl) {
      ctx.addIssue({
        code: 'custom',
        message: 'Either Front or Back artwork url is required',
      });
    }

    if (data.printArea !== PrintArea.OneSide && data.printArea !== PrintArea.TwoSide) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Print area must be `1 side` or `2 side`.',
        path: ['printArea'],
      });
    }

    if (data.trackingNumber && data.trackingNumber.includes('+')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tracking Number cannot contain "+" symbol.',
        path: ['trackingNumber'],
      });
    }

    if (data.providerName === ProviderCode.FLASHSHIP) {
      if (data.printArea === PrintArea.TwoSide) {
        if (!data.mockupUrl1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Mockup URL 1 is required when print area is 2 side for this provider.',
            path: ['mockupUrl1'],
          });
        }

        if (!data.mockupUrl2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Mockup URL 2 is required when print area is 2 side for this provider.',
            path: ['mockupUrl2'],
          });
        }
      } else {
        if (!data.mockupUrl1 && !data.mockupUrl2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Mockup URL is required for this provider.',
            path: ['mockupUrl1'],
          });
        }
      }
    }

    if (data.providerName === ProviderCode.ONOS) {
      if (!data.mockupUrl1 && !data.mockupUrl2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Mockup URL is required for this provider.',
          path: ['mockupUrl1'],
        });
      }
      if (data.mockupUrl1 && data.mockupUrl2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'This provider does not support 2 mockups.',
          path: ['mockupUrl2'],
        });
      }
    }

    if (data.providerName && data.leftArtworkUrl) {
      if (
        data.providerName !== ProviderCode.ZBear &&
        data.providerName !== ProviderCode.HongPhuc &&
        data.providerName !== ProviderCode.Sunshine
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'This provider does not support left artwork.',
          path: ['leftArtworkUrl'],
        });
      }
    }

    if (data.providerName && data.rightArtworkUrl) {
      if (
        data.providerName !== ProviderCode.ZBear &&
        data.providerName !== ProviderCode.HongPhuc &&
        data.providerName !== ProviderCode.Sunshine
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'This provider does not support right artwork.',
          path: ['rightArtworkUrl'],
        });
      }
    }

    if (data.collarArtworkUrl && data.productCode !== 'BJ1JJ1002') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'This product does not support collar artwork.',
        path: ['collarArtworkUrl'],
      });
    }

    if (data.printArea === PrintArea.TwoSide) {
      if (!data.frontArtworkUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Front artwork URL is required when print area is 2 side.',
          path: ['frontArtworkUrl'],
        });
      }
      if (!data.backArtworkUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Back artwork URL is required when print area is 2 side.',
          path: ['backArtworkUrl'],
        });
      }
    }

    if (isLabelShipping && !data.trackingNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tracking number is required when a shipping label URL is provided.',
        path: ['trackingNumber'],
      });
    }

    if (isLabelShipping && !data.shippingLabelUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shipping label URL is required when a tracking number is provided.',
        path: ['shippingLabelUrl'],
      });
    }

    // if (!data.storeName) {
    //   ctx.addIssue({
    //     code: z.ZodIssueCode.custom,
    //     message: 'Store name is required for normal shipping.',
    //     path: ['storeName'],
    //   });
    // }

    if (!data.frontArtworkUrl && !data.backArtworkUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Design cannot be empty.',
        path: ['frontArtworkUrl', 'backArtworkUrl'],
      });
    }

    if (!data.trackingNumber && data.shippingLabelUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'This field is required',
        path: ['trackingNumber'],
      });
    }

    if (isNormalShipping) {
      if (!data.firstName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'First name is required for normal shipping.',
          path: ['firstName'],
        });
      }
      if (!data.addressLine1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Address line 1 is required for normal shipping.',
          path: ['addressLine1'],
        });
      }
      if (!data.city) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'City is required for normal shipping.',
          path: ['city'],
        });
      }
      if (!data.zip) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Zip code is required for normal shipping.',
          path: ['zip'],
        });
      }
      if (!data.region) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Region is required for normal shipping.',
          path: ['region'],
        });
      }
      if (!data.country) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Country is required for normal shipping.',
          path: ['country'],
        });
      }
    }

    // if (
    //   // ![
    //   //   'PKD1',
    //   //   'PKD2',
    //   //   'PKD3',
    //   //   'PKD4',
    //   //   'PKD5',
    //   //   'PKD6',
    //   //   'PKD7',
    //   //   'PKD8',
    //   //   'PKD9',
    //   //   'PKD10',
    //   //   'PKD11',
    //   //   'PKD12',
    //   //   'PKD13',
    //   // ].includes(data.sellerNote)
    //   !data.sellerNote.includes('PKD')
    // ) {
    //   ctx.addIssue({
    //     code: z.ZodIssueCode.custom,
    //     message: 'Invalid seller note - must has PKD.',
    //     path: ['sellerNote'],
    //   });
    // }
  })
  .transform((data) => {
    // const marketplaceOrderIds = formatMarketplaceOrderIds(data as ExcelImportOrder) as string;
    return {
      ...data,
      // marketplaceOrderIds,
      // sellerNote: data.sellerNote?.split('-')[0]?.trim(),
      shippingType: data.shippingLabelUrl ? ShippingType.Label : ShippingType.Normal,
      mockupUrls: data.mockupUrl1 ? [data.mockupUrl1] : [],
      shippingMethod: data.shippingMethod ? data.shippingMethod : ShippingMethod.Standard,
    };
  });
export type ExcelImportOrder = z.infer<typeof ExcelImportOrderZod>;
export class ExcelImportOrderDto extends createZodDto(ExcelImportOrderZod) {}

export const ExcelImportOrderTrackingZod = z
  .object({
    orderId: ExternalIDZod,
    trackingNumber: TrackingNumberZod.optional(),
    shippingLabelUrl: URLZod,
    result: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.trackingNumber || data.trackingNumber === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tracking number is required.',
        path: ['trackingNumber'],
      });
    }
    if (!data.shippingLabelUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shipping Label URL is required.',
        path: ['shippingLabelUrl'],
      });
    }
    if (!data.orderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Order ID is required.',
        path: ['orderId'],
      });
    }
  });
export type ExcelImportOrderTracking = z.infer<typeof ExcelImportOrderTrackingZod>;
export class ExcelImportOrderTrackingDto extends createZodDto(extendApi(ExcelImportOrderTrackingZod)) {}

export const ExcelImportOrderFeeZod = z
  .object({
    orderId: ExternalIDZod,
    shippingLabelUrl: URLZod,
    result: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.shippingLabelUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shipping Label URL is required.',
      });
    }
    if (!data.orderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Order ID is required.',
      });
    }
  });
export type ExcelImportOrderFee = z.infer<typeof ExcelImportOrderFeeZod>;
export class ExcelImportOrderFeeDto extends createZodDto(extendApi(ExcelImportOrderFeeZod)) {}

export const ExcelImportBulkShipOutOrderZod = z
  .object({
    orderId: ExternalIDZod.optional(),
    trackingNumber: TrackingNumberZod.optional(),
    type: z.enum(getObjectValues(BulkImportUpdateOrderType)),
    date: z
      .string()
      .trim()
      .superRefine((val, ctx) => {
        const parts = val.split('/');
        if (parts.length !== 3) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid date format. Must be DD/MM/YYYY',
          });
        }

        const date = new Date(`${parts[2]}/${parts[1]}/${parts[0]}`);

        if (isNaN(date.getTime())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid date format. Must be DD/MM/YYYY',
          });
        }
      })
      .transform((val) => {
        const parts = val.split('/');

        return new Date(`${parts[2]}/${parts[1]}/${parts[0]}`);
      }),
    boxSku: z.coerce.string().optional(),
    result: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.orderId && !data.trackingNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either Order ID or Tracking Number is required.',
        path: ['trackingNumber'],
      });
    }

    if (data.type === BulkImportUpdateOrderType.Manifest && !data.boxSku) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Box SKU is required for Manifest',
        path: ['boxSku'],
      });
    }
  })
  .transform((data) => {
    return {
      ...data,
      trackingNumber: data.trackingNumber?.startsWith('4') ? data.trackingNumber.slice(8) : data.trackingNumber,
    };
  });
export type ExcelImportOrderShipOuts = z.infer<typeof ExcelImportBulkShipOutOrderZod>;
export class ExcelImportOrderShipOutsDto extends createZodDto(extendApi(ExcelImportBulkShipOutOrderZod)) {}

//
export const ImportOrdersZod = z.object({
  fileContent: z.string().max(5000000),
});
export class ImportOrdersDto extends createZodDto(extendApi(ImportOrdersZod)) {}

export const ImportOrderTrackingsZod = z.object({
  fileContent: z.string().max(5000000),
});
export class ImportOrderTrackingsDto extends createZodDto(extendApi(ImportOrderTrackingsZod)) {}

//
export const SendToProviderZod = z.object({
  orderIds: z.array(IDZod),
});
export class SendToProviderDto extends createZodDto(extendApi(SendToProviderZod)) {}

export const ManualSendToProviderZod = z.object({
  orderId: IDZod,
  providerOrderId: ExternalIDZod,
  // providerCode: z.enum(getObjectValues(ProviderCode)),
  // providerId: IDZod,
});
export class ManualSendToProviderDto extends createZodDto(extendApi(ManualSendToProviderZod)) {}

export const IdMessageZod = z.object({
  id: IDZod,
  message: z.string().optional(),
  code: z.number().optional(),
});
export class IdMessageDto extends createZodDto(extendApi(IdMessageZod)) {}
export const CancelOrdersZod = z.object({
  refund: z.boolean().default(false),
  orderIds: z.array(IDZod),
  note: z.string().optional(),
  refundPercentage: z.coerce.number().min(5).max(100).optional(),
  refundAmount: z.coerce.number().optional(),
});
export class CancelOrdersDto extends createZodDto(extendApi(CancelOrdersZod)) {}

export const getStatisticDashboardZod = z.object({
  type: z.enum(getObjectValues(OrderStatisticChartType)),
  departmentId: z.string().optional(),
});
export class GetStatisticDashboardDto extends createZodDto(extendApi(getStatisticDashboardZod)) {}

export const UpdateLineItemsZod = z.object({
  mockupIds: z.array(z.string()),
  lineItemId: IDZod,
  variantId: IDZod,
  frontArtworkId: z.string().optional(),
  backArtworkId: z.string().optional(),
  leftArtworkId: z.string().optional(),
  rightArtworkId: z.string().optional(),
  collarArtworkId: z.string().optional(),
  quantity: z.number().min(1).max(QUANTITY_MAX),
});

export type UpdateLineItems = z.infer<typeof UpdateLineItemsZod>;

export const MatchOrderZod = z.object({
  orderId: IDZod,
  lineItems: z.array(UpdateLineItemsZod),
});
export class MatchOrderDto extends createZodDto(extendApi(MatchOrderZod)) {}
export const DuplicateOrderZod = MatchOrderZod.extend({
  externalId: z
    .string()
    .min(NAME_MIN_LENGTH)
    .max(EXTERNAL_ID_MAX_LENGTH)
    .refine((value) => /^\S+$/.test(value), "External ID can't have space"),
});
export class DuplicateOrderDto extends createZodDto(extendApi(DuplicateOrderZod)) {}
export const StatisticZod = z.object({
  name: z.string(),
  orders: z.number(),
});
export class StatisticDto extends createZodDto(extendApi(StatisticZod)) {}

export const ArchivedOrdersZod = z.object({
  orderIds: z.array(z.string()),
  archived: z.boolean(),
});
export class ArchivedOrdersDto extends createZodDto(extendApi(ArchivedOrdersZod)) {}

export const DeleteOrdersZod = z.object({
  orderIds: z.array(z.string()),
});
export class DeleteOrdersDto extends createZodDto(extendApi(DeleteOrdersZod)) {}

export const GetTopSellingProductsZod = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  storeId: z.string().optional(),
});

export class GetTopSellingProductsDto extends createZodDto(extendApi(GetTopSellingProductsZod)) {}

export const GetTopSellingProductsResZod = ResZod.extend({
  data: z.array(
    z.object({
      productId: z.string(),
      productName: z.string(),
      categoryName: z.string(),
      totalItems: z.number(),
      totalQuantity: z.number(),
      totalRevenue: z.number(),
    }),
  ),
});

export class GetTopSellingProductsResDto extends createZodDto(extendApi(GetTopSellingProductsResZod)) {}

export class GetOrderCountByProviderDto extends createZodDto(extendApi(GetTopSellingProductsZod)) {}

export const GetOrderCountByProviderResZod = ResZod.extend({
  data: z.array(
    z.object({
      productId: z.string(),
      itemCount: z.number(),
      providerName: z.array(z.string()),
      totalQuantity: z.number(),
      totalCost: z.number(),
    }),
  ),
});

export class GetOrderCountByProviderResDto extends createZodDto(extendApi(GetOrderCountByProviderResZod)) {}

export const GetTotalPaidOrdersByDayZod = GetTopSellingProductsZod.extend({
  type: z.enum(getObjectValues(OrderStatisticChartType)),
  groupBy: z.enum(getObjectValues(OrderStatisticChartGroupBy)),
});
export class GetTotalPaidOrdersByDayDto extends createZodDto(extendApi(GetTotalPaidOrdersByDayZod)) {}

export const GetTotalPaidOrdersByDayResZod = ResZod.extend({
  data: z.array(
    z.object({
      productId: z.string(),
      orderCount: z.number(),
      providerName: z.array(z.string()),
    }),
  ),
});

export class GetTotalPaidOrdersByDayResDto extends createZodDto(extendApi(GetTotalPaidOrdersByDayResZod)) {}

export const UpdateShippingAddressZod = z.object({
  orderId: IDZod,
  shippingAddress: ShippingAddressZod,
});

export class UpdateShippingAddressDto extends createZodDto(extendApi(UpdateShippingAddressZod)) {}

export const TrackingsZod = z.object({
  trackings: z.array(z.string()),
});
export class TrackingsDto extends createZodDto(extendApi(TrackingsZod)) {}

export const GetSummaryZod = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export class GetSummaryDto extends createZodDto(extendApi(GetSummaryZod)) {}

export const ImportOrderBaseCostZod = z.object({
  fileContent: z.string().max(5000000),
});
export class ImportOrderBaseCostDto extends createZodDto(extendApi(ImportOrderBaseCostZod)) {}

export const ExcelImportOrderBaseCostZod = z.object({
  orderId: ExternalIDZod,
  baseCost: z.number(),
  // providerBaseCost: z.number(),

  //
  result: z.string().optional(),
});
export type ExcelImportOrderBaseCost = z.infer<typeof ExcelImportOrderBaseCostZod>;
export class ExcelImportOrderBaseCostDto extends createZodDto(extendApi(ExcelImportOrderBaseCostZod)) {}

export const GetStatsChartRangeZod = z.object({
  status: z.enum(getObjectValues(OrderStatus)).default(OrderStatus.Processing),
  from: z.coerce.date().transform((date) => {
    const d = date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    d.setHours(0, 0, 0, 0);
    return d;
  }),
  to: z.coerce.date().transform((date) => {
    const d = date || new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }),
  departmentId: z.string().optional(),
  providerId: z.string().optional(),
});
export class GetStatsChartRangeDto extends createZodDto(extendApi(GetStatsChartRangeZod)) {}

export const GetTotalOrderBeforeDateZod = z.object({
  date: z.coerce.date().transform((date) => {
    const d = date || new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }),
  departmentId: z.string().optional(),
  providerId: z.string().optional(),
});
export class GetTotalOrderBeforeDateDto extends createZodDto(extendApi(GetTotalOrderBeforeDateZod)) {}

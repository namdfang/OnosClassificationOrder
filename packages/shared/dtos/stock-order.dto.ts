import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import Big from 'big.js';
import { z } from 'zod';

import { DESCRIPTION_MAX_LENGTH, EXTERNAL_ID_MAX_LENGTH, NAME_MAX_LENGTH, NAME_MIN_LENGTH, NOTE_MAX_LENGTH, NOTE_MIN_LENGTH, QUANTITY_MAX } from '../constants/common-length';
import { ExternalIDZod, IDZod, NameZod, optionalStringTransform, OptionalURLZod, TextZod, TrackingNumberZod, URLZod } from '../constants/common-zod';
import { UAT_SHIP_FEE } from '../constants/dropship-order';
import { Marketplace } from '../constants/marketplace';
import { BETA_STOCK_SHIP_FEE, STOCK_ORDER_TYPE, StockOrderStatus } from '../constants/stock-order';
import { GetStatisticsZod, OrderTrackingZod, SendToProviderZod, UpdateLineItemsZod } from './order.dto';
import { CreateStockLineItemZod } from './stock-order-item.dto';
import { TransactionZod } from './transaction.dto';
import { TrackingStatus } from '../enums/tracking';
import { getObjectValues } from '../utils/getObjectValues';
// import { CreateLineItemZod } from './StockOrder-item.dto';

export const ShippingAddressStockZod = z.object({
  name: NameZod,
  email: z.string().min(0).optional(),
  phone: z.string().min(0).max(NAME_MAX_LENGTH).trim().optional(),
  addressLine1: z.string().min(0).max(DESCRIPTION_MAX_LENGTH).trim(),
  addressLine2: z.string().min(0).max(DESCRIPTION_MAX_LENGTH).trim().optional(),
  city: NameZod,
  zip: z.string().max(NAME_MAX_LENGTH).trim(),
  region: NameZod,
  country: NameZod,
});

export const StockOrderTrackingZod = z.object({
  trackingNumber: NameZod,
  carrierName: z.string().default('USPS'),
  carrierCode: z.string().default('USPS'),
  trackingUrl: z.string().trim().optional(),
  shippingLabelUrl: URLZod.optional(),
});
export type StockOrderTracking = z.infer<typeof StockOrderTrackingZod>;

export const StockOrderLogZod = z.object({
  status: z.nativeEnum(StockOrderStatus),
  date: z.date(),
  message: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).trim().optional(),
  statusChanged: z.boolean().default(true),
  updatedById: IDZod,
  hidden: z.boolean().optional(),
});
export type StockOrderLog = z.infer<typeof StockOrderLogZod>;

export const StockOrderZod = BaseEntityZod.extend({
  seller: z.string().optional(),
  orderId: ExternalIDZod,
  providerId: IDZod.optional(),
  userId: IDZod,
  shippingAddress: ShippingAddressStockZod.optional(),
  status: z.nativeEnum(StockOrderStatus).default(StockOrderStatus.Pending),
  labelFileId: IDZod.nullable(),
  lineItemIds: z.array(IDZod),
  tracking: OrderTrackingZod.optional(),
  cancelCode: z.string().optional(),
  trackingStatus: z.nativeEnum(TrackingStatus).optional(),
  // Detail
  manifestDate: z.coerce.date().optional(),
  usArrivalDate: z.coerce.date().optional(),
  carrierReceivedDate: z.coerce.date().optional(),
  //
  isPaid: z.boolean().default(false),

  subTotal: z.number(),
  total: z.number(),
  //
  sellerNote: z.string().trim().min(1).max(NOTE_MAX_LENGTH),
  cancelNote: z.string().trim().min(1).max(NOTE_MAX_LENGTH).optional(),
  refundPercentage: z.number().optional(),
  refundAmount: z.number().optional(),
  refundNote: z.string().trim().min(1).max(NOTE_MAX_LENGTH).optional(),
  logs: z.array(StockOrderLogZod),
  lastFetchedAt: z.coerce.date().optional(),
  createdDate: z.coerce.date(),
  scanTracking: z.coerce.boolean().optional(),
  scanFee: z.number().optional(),

  sku: z.string().optional(),
  barcode: z.string().optional(),
  localTracking: z.string().optional(),
  labelFee: z.number().optional(),
  fulfillmentFee: z.number().optional(),
  type: z.enum(getObjectValues(STOCK_ORDER_TYPE)).optional(),
  referrerId: IDZod.optional(),

  isCombined: z.boolean().optional(),

  marketplace: z.enum(getObjectValues(Marketplace)).optional(),
  marketplaceOrderIds: z.array(ExternalIDZod).optional(),
  erpUserId: IDZod.optional(),
  erpUser: z.string().optional(),
  erpDepartment: z.string().optional(),
});
export type StockOrder = z.infer<typeof StockOrderZod>;

export const CreateStockOrderZod = z.object({
  orderId: StockOrderZod.shape.orderId,
  sellerNote: z.string().trim().min(1).max(NOTE_MAX_LENGTH),
  shippingAddress: ShippingAddressStockZod.optional(),
  trackingNumber: TextZod.optional(),
  lineItems: z.array(CreateStockLineItemZod),
  labelFileId: StockOrderZod.shape.labelFileId,
  name: z.string().optional(),
  phone: ShippingAddressStockZod.shape.phone.optional(),
  addressLine1: ShippingAddressStockZod.shape.addressLine1.optional(),
  city: ShippingAddressStockZod.shape.city.optional(),
  zip: ShippingAddressStockZod.shape.zip.optional(),
  region: ShippingAddressStockZod.shape.region.optional(),
  country: ShippingAddressStockZod.shape.country.optional(),
  createdDate: z.coerce.date(),
  scanTracking: z.coerce.boolean().optional(),
  scanFee: z.coerce.number().optional(),

  labelFee: z.coerce.number().optional(),
  total: z.coerce.number().optional(),
  fulfillmentFee: z.coerce.number().optional(),
  type: z.enum(getObjectValues(STOCK_ORDER_TYPE)).optional(),
  localTracking: z.string().optional(),
  referrerId: IDZod.optional(),

  isCombined: z.boolean().optional(),
  marketplace: z.enum(getObjectValues(Marketplace)).optional(),
  marketplaceOrderIds: z.array(ExternalIDZod).optional(),
  erpUserId: IDZod.optional(),
  erpUser: z.string().optional(),
  erpDepartment: z.string().optional(),
  erpShopCode: z.string().optional(),
});
export class CreateStockOrderDto extends createZodDto(extendApi(CreateStockOrderZod)) {}

//
export const GetStockOrdersZod = PageQueryZod.extend({
  status: StockOrderZod.shape.status.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  orderId: z.string().optional(),
  providerId: IDZod.optional(),
  departmentId: IDZod.optional(),
  email: z.string().optional(),
  trackingNumber: TrackingNumberZod.optional(),
  trackingNumberIn: z.string().optional(),
  trackingStatus: z.enum(getObjectValues(TrackingStatus)).optional(),
  orderIds: z.string().optional(),
  type: z.enum(getObjectValues(STOCK_ORDER_TYPE)).optional(),
  referrerId: IDZod.optional(),
  referrerEmail: z.string().optional(),
});
export class GetStockOrdersDto extends createZodDto(extendApi(GetStockOrdersZod)) {}
export const GetStockOrdersResZod = PageResZod.extend({
  data: StockOrderZod.partial().array(),
});
export class GetStockOrdersResDto extends createZodDto(extendApi(GetStockOrdersResZod)) {}

export const CreateStockOrderResZod = ResZod.extend({
  data: StockOrderZod,
});
export class CreateStockOrderResDto extends createZodDto(extendApi(CreateStockOrderResZod)) {}

//
export const UpdateStockOrderZod = z.object({
  status: StockOrderZod.shape.status.optional(),
});
export class UpdateStockOrderDto extends createZodDto(extendApi(UpdateStockOrderZod)) {}
export const UpdateStockOrderResZod = ResZod.extend({
  data: StockOrderZod.partial(),
});
export class UpdateStockOrderResDto extends createZodDto(extendApi(UpdateStockOrderResZod)) {}

//
export const GetStockOrderStatisticsZod = GetStatisticsZod.extend({
  status: StockOrderZod.shape.status.optional(),
  search: z.string().trim().optional(),
  orderId: z.string().optional(),
  email: z.string().email().optional(),
  providerId: z.string().optional(),
  departmentId: z.string().optional(),
  orderIds: z.string().optional(),
  trackingStatus: z.enum(getObjectValues(TrackingStatus)).optional(),
  trackingNumber: TrackingNumberZod.optional(),
  type: z.enum(getObjectValues(STOCK_ORDER_TYPE)).optional(),

  referrerId: IDZod.optional(),
});

export class GetStockOrderStatisticsDto extends createZodDto(extendApi(GetStockOrderStatisticsZod)) {}
export const GetStockOrderStatisticsResZod = ResZod;
export class GetStockOrderStatisticsResDto extends createZodDto(extendApi(GetStockOrderStatisticsResZod)) {}

//
export const CalculateStockOrdersPaymentZod = z.object({
  orderIds: z.array(IDZod),
});
export const CalculateStockOrderPaymentResultZod = z.object({
  orderId: IDZod,
  total: z.number().optional(),
  storeName: z.string().optional(),
  message: z.string().optional(),
});
export type CalculateStockOrderPaymentResult = z.infer<typeof CalculateStockOrderPaymentResultZod>;
export class CalculateStockOrdersPaymentDto extends createZodDto(extendApi(CalculateStockOrdersPaymentZod)) {}
export const CalculateStockOrdersPaymentResZod = ResZod.extend({
  data: z.object({
    totalAmount: z.number(),
    orders: z.array(CalculateStockOrderPaymentResultZod),
  }),
});
export class CalculateStockOrdersPaymentResDto extends createZodDto(extendApi(CalculateStockOrdersPaymentResZod)) {}

//
export const PayStockOrdersZod = z.object({
  orderIds: z.array(IDZod),
});
export class PayStockOrdersDto extends createZodDto(extendApi(PayStockOrdersZod)) {}
export const PayStockOrdersResZod = ResZod.extend({
  data: z.object({
    totalAmount: z.number(),
    orders: z.array(CalculateStockOrderPaymentResultZod),
    transaction: TransactionZod,
  }),
});
export class PayStockOrdersResDto extends createZodDto(extendApi(PayStockOrdersResZod)) {}

//
export const ExcelImportStockOrderZod = z
  .object({
    seller: StockOrderZod.shape.seller,
    orderId: StockOrderZod.shape.orderId,
    externalLink: z.string().trim().max(DESCRIPTION_MAX_LENGTH).optional(),
    quantity: z.coerce.number().min(1).max(QUANTITY_MAX),
    providerName: z.string().trim().optional().transform(optionalStringTransform),
    result: z.string().optional(),
    //
    trackingNumber: TextZod.optional(),
    shippingLabelUrl: OptionalURLZod.optional(),
    color: z.string(),
    size: z.string(),
    sku: StockOrderZod.shape.sku,
    createdDate: z
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
    imageLink: URLZod,
    mockupUrl: URLZod,
    title: TextZod.optional(),
    scanTracking: z.enum(['Yes', 'No']).transform((val) => (val === 'Yes' ? true : val === 'No' ? false : undefined)),
    //
    name: TextZod.optional(),
    phone: TextZod.optional().transform(optionalStringTransform),
    addressLine1: TextZod.optional(),
    city: TextZod.optional(),
    zip: TextZod.optional(),
    region: TextZod.optional(),
    country: TextZod.optional(),

    type: z.enum(getObjectValues(STOCK_ORDER_TYPE)).optional(),
    localTracking: z.string().optional(),
    marketplace: z.enum(getObjectValues(Marketplace)).optional(),
    marketplaceOrderIds: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.trackingNumber && data.trackingNumber.length > 0 && !data.shippingLabelUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shipping label url is required',
        path: ['shippingLabelUrl'],
      });
    }

    if (data.shippingLabelUrl && data.shippingLabelUrl.length > 0 && !data.trackingNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tracking number is required',
        path: ['trackingNumber'],
      });
    }

    if (
      (!data.trackingNumber || data.trackingNumber.length === 0) &&
      (!data.shippingLabelUrl || data.shippingLabelUrl.length === 0) &&
      (!data.name || data.name.length === 0) &&
      (!data.phone || data.phone.length === 0) &&
      (!data.addressLine1 || data.addressLine1.length === 0) &&
      (!data.city || data.city.length === 0) &&
      (!data.zip || data.zip.length === 0) &&
      (!data.region || data.region.length === 0) &&
      (!data.country || data.country.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shipping address and tracking can not be both empty',
        path: [
          'name',
          'phone',
          'addressLine1',
          'city',
          'zip',
          'region',
          'country',
          'trackingNumber',
          'shippingLabelUrl',
        ],
      });
    } else if (
      (!data.trackingNumber || data.trackingNumber.length === 0) &&
      (!data.shippingLabelUrl || data.shippingLabelUrl.length === 0)
    ) {
      const valid = ShippingAddressStockZod.safeParse({
        name: data.name,
        phone: data.phone,
        addressLine1: data.addressLine1,
        city: data.city,
        zip: data.zip,
        region: data.region,
        country: data.country,
      });
      console.log('valid: ', valid);

      if (!valid.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid shipping address',
          path: ['name', 'phone', 'addressLine1', 'city', 'zip', 'region', 'country'],
        });
      }
    } else if (data.name || data.phone || data.addressLine1 || data.city || data.zip || data.region || data.country) {
      const valid = ShippingAddressStockZod.safeParse({
        name: data.name,
        phone: data.phone,
        addressLine1: data.addressLine1,
        city: data.city,
        zip: data.zip,
        region: data.region,
        country: data.country,
      });

      if (!valid.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid shipping address',
        });
      }
    }
  });

export type ExcelImportStockOrder = z.infer<typeof ExcelImportStockOrderZod>;
export class ExcelImportStockOrderDto extends createZodDto(ExcelImportStockOrderZod) {}

export const ExcelImportBulkStatusStockOrderZod = z
  .object({
    orderId: ExternalIDZod.optional(),
    trackingNumber: TrackingNumberZod.optional(),
    status: z.enum(getObjectValues(StockOrderStatus)),
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
    result: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.trackingNumber && !data.orderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tracking number or order ID is required',
        path: ['trackingNumber', 'orderId'],
      });
    }
  });

export type ExcelImportStatusStockOrder = z.infer<typeof ExcelImportBulkStatusStockOrderZod>;
export class ExcelImportStatusStockOrderDto extends createZodDto(extendApi(ExcelImportBulkStatusStockOrderZod)) {}

//
export const ImportStockOrdersZod = z.object({
  fileContent: z.string().max(5000000),
});
export class ImportStockOrdersDto extends createZodDto(extendApi(ImportStockOrdersZod)) {}

export const ImportStockOrderTrackingsZod = z.object({
  fileContent: z.string().max(5000000),
});
export class ImportStockOrderTrackingsDto extends createZodDto(extendApi(ImportStockOrderTrackingsZod)) {}

//

export const CancelStockOrdersZod = SendToProviderZod.extend({
  refund: z.boolean().default(false),
  refundPercentage: z.coerce.number().min(5).max(100).optional(),
  refundAmount: z.coerce.number().optional(),
  refundNote: z.string().optional(),
});
export class CancelStockOrdersDto extends createZodDto(extendApi(CancelStockOrdersZod)) {}

export const MatchStockOrderZod = z.object({
  orderId: IDZod,
  lineItems: z.array(UpdateLineItemsZod),
});
export class MatchStockOrderDto extends createZodDto(extendApi(MatchStockOrderZod)) {}
export const DuplicateStockOrderZod = MatchStockOrderZod.extend({
  orderId: z
    .string()
    .min(NAME_MIN_LENGTH)
    .max(EXTERNAL_ID_MAX_LENGTH)
    .refine((value) => /^\S+$/.test(value), "External ID can't have space"),
});
export class DuplicateStockOrderDto extends createZodDto(extendApi(DuplicateStockOrderZod)) {}

export const ArchivedStockOrdersZod = z.object({
  orderIds: z.array(z.string()),
  archived: z.boolean(),
});
export class ArchivedStockOrdersDto extends createZodDto(extendApi(ArchivedStockOrdersZod)) {}

export const DeleteStockOrdersZod = z.object({
  orderIds: z.array(z.string()),
});
export class DeleteStockOrdersDto extends createZodDto(extendApi(DeleteStockOrdersZod)) {}

export const ExcelImportStockOrderPriceZod = z
  .object({
    orderId: ExternalIDZod,
    variant: z.string().trim().min(1),
    dimension: z.string().optional(),
    weight: z.coerce.number(),
    // sku: z.string(),
    baseCost: z.coerce.number(),
    productPrice: z.coerce.number().optional(),
    cnyPrice: z.coerce.number().optional(),
    shipFee: z.coerce.number().optional(),
    // total: z.coerce.number().optional(),

    isProd: z.boolean().optional(),

    result: z.string().optional(),
  })
  .transform((data) => {
    let productPrice = 0;
    let shipFee = 0;

    productPrice = new Big(data.baseCost).mul(new Big(1.05)).round(2, 3).toNumber();
    shipFee = new Big(data.weight)
      .div(1000)
      .mul(data.isProd ? BETA_STOCK_SHIP_FEE : UAT_SHIP_FEE)
      .round(2, 3)
      .toNumber();

    return {
      ...data,
      productPrice,
      shipFee,
    };
  });
// .superRefine((data, ctx) => {
//   if (!data.dimension && !data.weight) {
//     ctx.addIssue({
//       code: z.ZodIssueCode.custom,
//       message: 'Dimension or weight is required',
//       path: ['dimension', 'weight'],
//     });
//   }
// });

export type ExcelImportStockOrderPrice = z.infer<typeof ExcelImportStockOrderPriceZod>;
export class ExcelImportStockOrderPriceDto extends createZodDto(extendApi(ExcelImportStockOrderPriceZod)) {}

export const ExcelImportStockOrderItemInfoZod = z.object({
  orderId: ExternalIDZod,
  variant: z.string().trim().min(1),
  productLink: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  localTracking: z.string().trim().optional(),

  result: z.string().optional(),
});
export type ExcelImportStockOrderItemInfo = z.infer<typeof ExcelImportStockOrderItemInfoZod>;
export class ExcelImportStockOrderItemInfoDto extends createZodDto(extendApi(ExcelImportStockOrderItemInfoZod)) {}

export const ExcelImportStockOrderItemWeightZod = ExcelImportStockOrderItemInfoZod.extend({
  orderId: ExternalIDZod,
  variant: z.string().trim().min(1),
  weight: z.coerce.number(),
  result: z.string().optional(),
});
export type ExcelImportStockOrderItemWeight = z.infer<typeof ExcelImportStockOrderItemWeightZod>;
export class ExcelImportStockOrderItemWeightDto extends createZodDto(extendApi(ExcelImportStockOrderItemWeightZod)) {}

export const UpdateStockOrderInfoZos = z.object({
  sku: z.string().optional(),
  externalLink: z.string().optional(),
  barcode: z.string().optional(),
  localTracking: z.string().optional(),
});
export class UpdateStockOrderInfoDto extends createZodDto(extendApi(UpdateStockOrderInfoZos)) {}

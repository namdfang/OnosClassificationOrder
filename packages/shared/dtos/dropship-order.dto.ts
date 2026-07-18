import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import Big from 'big.js';
import { z } from 'zod';

import {
  BETA_SHIP_FEE,
  CreateDropShipLineItemZod,
  DESCRIPTION_MAX_LENGTH,
  DROPSHIP_ORDER_TYPE,
  DropshipOrderStatus,
  EXTERNAL_ID_MAX_LENGTH,
  ExternalIDZod,
  getObjectValues,
  GetStatisticsZod,
  IDZod,
  Marketplace,
  NAME_MIN_LENGTH,
  NameZod,
  NOTE_MAX_LENGTH,
  NOTE_MIN_LENGTH,
  optionalStringTransform,
  OptionalURLZod,
  OrderTrackingZod,
  QUANTITY_MAX,
  SendToProviderZod,
  ShippingAddressZod,
  TextZod,
  TrackingNumberZod,
  TrackingStatus,
  TransactionZod,
  UAT_SHIP_FEE,
  UpdateLineItemsZod,
  URLZod,
} from '..';
// import { CreateLineItemZod } from './DropShipOrder-item.dto';

export const DropShipOrderTrackingZod = z.object({
  trackingNumber: NameZod,
  carrierName: z.string().default('USPS'),
  carrierCode: z.string().default('USPS'),
  trackingUrl: z.string().trim().optional(),
  shippingLabelUrl: URLZod.optional(),
});
export type DropShipOrderTracking = z.infer<typeof DropShipOrderTrackingZod>;

export const DropShipOrderLogZod = z.object({
  status: z.nativeEnum(DropshipOrderStatus),
  date: z.date(),
  message: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).trim().optional(),
  statusChanged: z.boolean().default(true),
  updatedById: IDZod,
  hidden: z.boolean().optional(),
});
export type DropShipOrderLog = z.infer<typeof DropShipOrderLogZod>;

export const DropShipOrderZod = BaseEntityZod.extend({
  orderId: ExternalIDZod,
  providerId: IDZod.optional(),
  userId: IDZod,
  shippingAddress: ShippingAddressZod.optional(),
  status: z.nativeEnum(DropshipOrderStatus).default(DropshipOrderStatus.Pending),
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
  logs: z.array(DropShipOrderLogZod),
  lastFetchedAt: z.coerce.date().optional(),
  createdDate: z.coerce.date(),
  scanTracking: z.coerce.boolean().optional(),
  scanFee: z.number().optional(),

  sku: z.string().optional(),
  barcode: z.string().optional(),
  localTracking: z.string().optional(),
  labelFee: z.number().optional(),
  fulfillmentFee: z.number().optional(),
  type: z.enum(getObjectValues(DROPSHIP_ORDER_TYPE)).optional(),
  referrerId: IDZod.optional(),

  isCombined: z.boolean().optional(),

  marketplace: z.enum(getObjectValues(Marketplace)).optional(),
  marketplaceOrderIds: z.array(ExternalIDZod).optional(),
  erpUserId: IDZod.optional(),
  erpUser: z.string().optional(),
  erpDepartment: z.string().optional(),
});
export type DropShipOrder = z.infer<typeof DropShipOrderZod>;

export const CreateDropShipOrderZod = z.object({
  orderId: DropShipOrderZod.shape.orderId,
  sellerNote: z.string().trim().min(1).max(NOTE_MAX_LENGTH),
  shippingAddress: ShippingAddressZod.optional(),
  trackingNumber: TextZod.optional(),
  lineItems: z.array(CreateDropShipLineItemZod),
  labelFileId: DropShipOrderZod.shape.labelFileId,
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
  createdDate: z.coerce.date(),
  scanTracking: z.coerce.boolean().optional(),
  scanFee: z.coerce.number().optional(),

  labelFee: z.coerce.number().optional(),
  total: z.coerce.number().optional(),
  fulfillmentFee: z.coerce.number().optional(),
  type: z.enum(getObjectValues(DROPSHIP_ORDER_TYPE)).optional(),
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
export class CreateDropShipOrderDto extends createZodDto(extendApi(CreateDropShipOrderZod)) {}

//
export const GetDropShipOrdersZod = PageQueryZod.extend({
  status: DropShipOrderZod.shape.status.optional(),
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
  type: z.enum(getObjectValues(DROPSHIP_ORDER_TYPE)).optional(),
  referrerId: IDZod.optional(),
  referrerEmail: z.string().optional(),
});
export class GetDropShipOrdersDto extends createZodDto(extendApi(GetDropShipOrdersZod)) {}
export const GetDropShipOrdersResZod = PageResZod.extend({
  data: DropShipOrderZod.partial().array(),
});
export class GetDropShipOrdersResDto extends createZodDto(extendApi(GetDropShipOrdersResZod)) {}

export const CreateDropShipOrderResZod = ResZod.extend({
  data: DropShipOrderZod,
});
export class CreateDropShipOrderResDto extends createZodDto(extendApi(CreateDropShipOrderResZod)) {}

//
export const UpdateDropShipOrderZod = z.object({
  status: DropShipOrderZod.shape.status.optional(),
});
export class UpdateDropShipOrderDto extends createZodDto(extendApi(UpdateDropShipOrderZod)) {}
export const UpdateDropShipOrderResZod = ResZod.extend({
  data: DropShipOrderZod.partial(),
});
export class UpdateDropShipOrderResDto extends createZodDto(extendApi(UpdateDropShipOrderResZod)) {}

//
export const GetDropShipOrderStatisticsZod = GetStatisticsZod.extend({
  status: DropShipOrderZod.shape.status.optional(),
  search: z.string().trim().optional(),
  orderId: z.string().optional(),
  email: z.string().email().optional(),
  providerId: z.string().optional(),
  departmentId: z.string().optional(),
  orderIds: z.string().optional(),
  trackingStatus: z.enum(getObjectValues(TrackingStatus)).optional(),
  trackingNumber: TrackingNumberZod.optional(),
  type: z.enum(getObjectValues(DROPSHIP_ORDER_TYPE)).optional(),

  referrerId: IDZod.optional(),
});

export class GetDropShipOrderStatisticsDto extends createZodDto(extendApi(GetDropShipOrderStatisticsZod)) {}
export const GetDropShipOrderStatisticsResZod = ResZod;
export class GetDropShipOrderStatisticsResDto extends createZodDto(extendApi(GetDropShipOrderStatisticsResZod)) {}

//
export const CalculateDropShipOrdersPaymentZod = z.object({
  orderIds: z.array(IDZod),
});
export const CalculateDropShipOrderPaymentResultZod = z.object({
  orderId: IDZod,
  total: z.number().optional(),
  storeName: z.string().optional(),
  message: z.string().optional(),
});
export type CalculateDropShipOrderPaymentResult = z.infer<typeof CalculateDropShipOrderPaymentResultZod>;
export class CalculateDropShipOrdersPaymentDto extends createZodDto(extendApi(CalculateDropShipOrdersPaymentZod)) {}
export const CalculateDropShipOrdersPaymentResZod = ResZod.extend({
  data: z.object({
    totalAmount: z.number(),
    orders: z.array(CalculateDropShipOrderPaymentResultZod),
  }),
});
export class CalculateDropShipOrdersPaymentResDto extends createZodDto(
  extendApi(CalculateDropShipOrdersPaymentResZod),
) {}

//
export const PayDropShipOrdersZod = z.object({
  orderIds: z.array(IDZod),
});
export class PayDropShipOrdersDto extends createZodDto(extendApi(PayDropShipOrdersZod)) {}
export const PayDropShipOrdersResZod = ResZod.extend({
  data: z.object({
    totalAmount: z.number(),
    orders: z.array(CalculateDropShipOrderPaymentResultZod),
    transaction: TransactionZod,
  }),
});
export class PayDropShipOrdersResDto extends createZodDto(extendApi(PayDropShipOrdersResZod)) {}

//
export const ExcelImportDropShipOrderZod = z
  .object({
    orderId: DropShipOrderZod.shape.orderId,
    externalLink: z.string().trim().max(DESCRIPTION_MAX_LENGTH).optional(),
    quantity: z.coerce.number().min(1).max(QUANTITY_MAX),
    providerName: z.string().trim().optional().transform(optionalStringTransform),
    sellerNote: z.string().trim().min(1).max(NOTE_MAX_LENGTH),
    result: z.string().optional(),
    //
    trackingNumber: TextZod.optional(),
    shippingLabelUrl: OptionalURLZod.optional(),
    weight: z.coerce.number().optional(),
    color: z.string(),
    size: z.string(),
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
    title: TextZod.optional(),
    scanTracking: z.enum(['Yes', 'No']).transform((val) => (val === 'Yes' ? true : val === 'No' ? false : undefined)),
    //
    firstName: TextZod.optional(),
    lastName: TextZod.optional(),
    phone: TextZod.optional().transform(optionalStringTransform),
    email: TextZod.optional().transform(optionalStringTransform),
    addressLine1: TextZod.optional(),
    addressLine2: TextZod.optional().transform(optionalStringTransform),
    city: TextZod.optional(),
    zip: TextZod.optional(),
    region: TextZod.optional(),
    country: TextZod.optional(),

    type: z.enum(getObjectValues(DROPSHIP_ORDER_TYPE)).optional(),
    localTracking: z.string().optional(),
    marketplace: z.enum(getObjectValues(Marketplace)).optional(),
    marketplaceOrderIds: z.string().optional(),
  })
  .transform((data) => {
    if (data.type === DROPSHIP_ORDER_TYPE.SYSTEM && data.weight) {
      delete data.weight;
    }

    return data;
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
      (!data.firstName || data.firstName.length === 0) &&
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
          'firstName',
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
      const valid = ShippingAddressZod.safeParse({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        city: data.city,
        zip: data.zip,
        region: data.region,
        country: data.country,
      });

      if (!valid.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid shipping address',
          path: ['firstName', 'phone', 'addressLine1', 'city', 'zip', 'region', 'country'],
        });
      }
    } else if (
      data.firstName ||
      data.lastName ||
      data.phone ||
      data.email ||
      data.addressLine1 ||
      data.addressLine2 ||
      data.city ||
      data.zip ||
      data.region ||
      data.country
    ) {
      const valid = ShippingAddressZod.safeParse({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
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

    if (data.type === DROPSHIP_ORDER_TYPE.CUSTOM && !data.weight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Weight is required',
        path: ['weight'],
      });
    }
  });

export type ExcelImportDropShipOrder = z.infer<typeof ExcelImportDropShipOrderZod>;
export class ExcelImportDropShipOrderDto extends createZodDto(ExcelImportDropShipOrderZod) {}

export const ExcelImportBulkStatusDropShipOrderZod = z
  .object({
    orderId: ExternalIDZod.optional(),
    trackingNumber: TrackingNumberZod.optional(),
    status: z.enum(getObjectValues(DropshipOrderStatus)),
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

export type ExcelImportStatusDropShipOrder = z.infer<typeof ExcelImportBulkStatusDropShipOrderZod>;
export class ExcelImportStatusDropShipOrderDto extends createZodDto(extendApi(ExcelImportBulkStatusDropShipOrderZod)) {}

//
export const ImportDropShipOrdersZod = z.object({
  fileContent: z.string().max(5000000),
});
export class ImportDropShipOrdersDto extends createZodDto(extendApi(ImportDropShipOrdersZod)) {}

export const ImportDropShipOrderTrackingsZod = z.object({
  fileContent: z.string().max(5000000),
});
export class ImportDropShipOrderTrackingsDto extends createZodDto(extendApi(ImportDropShipOrderTrackingsZod)) {}

//

export const CancelDropShipOrdersZod = SendToProviderZod.extend({
  refund: z.boolean().default(false),
  refundPercentage: z.coerce.number().min(5).max(100).optional(),
  refundAmount: z.coerce.number().optional(),
  refundNote: z.string().optional(),
});
export class CancelDropShipOrdersDto extends createZodDto(extendApi(CancelDropShipOrdersZod)) {}

export const MatchDropShipOrderZod = z.object({
  orderId: IDZod,
  lineItems: z.array(UpdateLineItemsZod),
});
export class MatchDropShipOrderDto extends createZodDto(extendApi(MatchDropShipOrderZod)) {}
export const DuplicateDropShipOrderZod = MatchDropShipOrderZod.extend({
  orderId: z
    .string()
    .min(NAME_MIN_LENGTH)
    .max(EXTERNAL_ID_MAX_LENGTH)
    .refine((value) => /^\S+$/.test(value), "External ID can't have space"),
});
export class DuplicateDropShipOrderDto extends createZodDto(extendApi(DuplicateDropShipOrderZod)) {}

export const ArchivedDropShipOrdersZod = z.object({
  orderIds: z.array(z.string()),
  archived: z.boolean(),
});
export class ArchivedDropShipOrdersDto extends createZodDto(extendApi(ArchivedDropShipOrdersZod)) {}

export const DeleteDropShipOrdersZod = z.object({
  orderIds: z.array(z.string()),
});
export class DeleteDropShipOrdersDto extends createZodDto(extendApi(DeleteDropShipOrdersZod)) {}

export const ExcelImportOrderPriceZod = z
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
    purchaseAccount: z.string().trim().optional(),
    purchaseOrderId: z.string().trim().optional(),
    // total: z.coerce.number().optional(),

    isProd: z.boolean().optional(),

    result: z.string().optional(),
  })
  .transform((data) => {
    let productPrice = 0;
    let shipFee = 0;

    productPrice = new Big(data.baseCost)
      .mul(new Big(data.isProd ? 1.05 : 1.03))
      .round(2, 3)
      .toNumber();
    shipFee = new Big(data.weight)
      .div(1000)
      .mul(data.isProd ? BETA_SHIP_FEE : UAT_SHIP_FEE)
      .round(2, 3)
      .toNumber();

    return {
      ...data,
      productPrice,
      shipFee,
    };
  })
  .superRefine((data, ctx) => {
    if (!data.dimension && !data.weight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Dimension or weight is required',
        path: ['dimension', 'weight'],
      });
    }
  });

export type ExcelImportOrderPrice = z.infer<typeof ExcelImportOrderPriceZod>;
export class ExcelImportOrderPriceDto extends createZodDto(extendApi(ExcelImportOrderPriceZod)) {}

export const ExcelImportOrderItemInfoZod = z.object({
  orderId: ExternalIDZod,
  variant: z.string().trim().min(1),
  productLink: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  localTracking: z.string().trim().optional(),
  cnyPrice: z.coerce.number().optional(),
  purchaseAccount: z.string().trim().optional(),
  purchaseOrderId: z.string().trim().optional(),

  result: z.string().optional(),
});
export type ExcelImportOrderItemInfo = z.infer<typeof ExcelImportOrderItemInfoZod>;
export class ExcelImportOrderItemInfoDto extends createZodDto(extendApi(ExcelImportOrderItemInfoZod)) {}

export const ExcelImportOrderItemWeightZod = ExcelImportOrderItemInfoZod.extend({
  orderId: ExternalIDZod,
  variant: z.string().trim().min(1),
  weight: z.coerce.number(),
  result: z.string().optional(),
});
export type ExcelImportOrderItemWeight = z.infer<typeof ExcelImportOrderItemWeightZod>;
export class ExcelImportOrderItemWeightDto extends createZodDto(extendApi(ExcelImportOrderItemWeightZod)) {}

export const UpdateDropShipOrderInfoZod = z.object({
  sku: z.string().optional(),
  externalLink: z.string().optional(),
  barcode: z.string().optional(),
  localTracking: z.string().optional(),
  cnyPrice: z.coerce.number().optional(),
  purchaseOrderId: z.string().optional(),
  purchaseAccount: z.string().optional(),
});
export class UpdateDropShipOrderInfoDto extends createZodDto(extendApi(UpdateDropShipOrderInfoZod)) {}

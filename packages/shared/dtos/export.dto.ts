import { createZodDto } from '@anatine/zod-nestjs';
import {
  BaseEntityZod,
  ExportStatus,
  ExportType,
  getObjectValues,
  IDZod,
  NameZod,
  OrderZod,
  ResZod,
  TrackingNumberZod,
  TrackingStatus,
} from '..';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

export const ExportZod = BaseEntityZod.extend({
  url: z.string().optional(),
  total: z.number().optional(),
  status: z.nativeEnum(ExportStatus),
  type: z.nativeEnum(ExportType),
  from: z.string(),
  to: z.string(),
  userId: z.string(),
  meta: z.object({}).optional(),
  summary: z.string().optional(),
});
export class Export extends createZodDto(extendApi(ExportZod)) {}

export const GetExportZod = ResZod.extend({
  data: ExportZod.array(),
  total: z.number(),
});

export class GetExportDto extends createZodDto(extendApi(GetExportZod)) {}

export const ExportOrdersZod = z.object({
  search: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: OrderZod.shape.status.optional(),
  storeId: z.string().optional(),
  externalId: OrderZod.shape.externalId.optional(),
  productId: IDZod.optional(),
  providerId: IDZod.optional(),
  trackingNumber: TrackingNumberZod.optional(),
  archived: z.string().optional(),
  shippingType: z.string().optional(),
  externalIds: z.string().optional(),
  trackingStatus: z.enum(getObjectValues(TrackingStatus)).optional(),
  referrerId: IDZod.optional(),
  referrerEmail: z.string().email().trim().optional(),
});
export class ExportOrdersDto extends createZodDto(extendApi(ExportOrdersZod)) {}

export const ExportDropShipOrdersZod = z.object({
  search: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: OrderZod.shape.status.optional(),
  orderId: OrderZod.shape.externalId.optional(),
  trackingNumber: NameZod.optional(),
  orderIds: z.array(z.string()).optional(),
  trackingStatus: z.enum(getObjectValues(TrackingStatus)).optional(),
});
export class ExportDropShipOrdersDto extends createZodDto(extendApi(ExportDropShipOrdersZod)) {}

export const ExportStockOrdersZod = z.object({
  search: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: OrderZod.shape.status.optional(),
  orderId: OrderZod.shape.externalId.optional(),
  trackingNumber: NameZod.optional(),
  orderIds: z.array(z.string()).optional(),
  trackingStatus: z.enum(getObjectValues(TrackingStatus)).optional(),
});
export class ExportStockOrdersDto extends createZodDto(extendApi(ExportStockOrdersZod)) {}


export const ExportPaymentsZod = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});
export class ExportPaymentsDto extends createZodDto(extendApi(ExportPaymentsZod)) {}

export const ExportTopupsZod = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});
export class ExportTopupsDto extends createZodDto(extendApi(ExportTopupsZod)) {}

export const ExportTrackingsZod = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});
export class ExportTrackingsDto extends createZodDto(extendApi(ExportTrackingsZod)) {}

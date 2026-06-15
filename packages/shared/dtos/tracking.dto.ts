import { z } from 'zod';
import {
  BaseEntityZod,
  NameZod,
  PageResZod,
  PageQueryZod,
  ResZod,
  getObjectValues,
  TrackingStatus,
  EXTERNAL_ID_MAX_LENGTH,
  NAME_MIN_LENGTH,
  IDZod,
  NOTE_MIN_LENGTH,
  NOTE_MAX_LENGTH,
} from '..';
import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';

const TrackingLogZod = z.object({
  status: z.nativeEnum(TrackingStatus),
  date: z.date(),
  message: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).trim().optional(),
  statusChanged: z.boolean().default(true),
  updatedById: IDZod,
  hidden: z.boolean().optional(),
});
export type TrackingLog = z.infer<typeof TrackingLogZod>;

export const TrackingZod = BaseEntityZod.extend({
  trackingNumber: NameZod,
  orderId: z
    .string()
    .min(NAME_MIN_LENGTH)
    .max(EXTERNAL_ID_MAX_LENGTH)
    .refine((value) => /^\S+$/.test(value), "External ID can't have space"),
  status: z.enum(getObjectValues(TrackingStatus)),
  startDate: z.coerce.date().optional(),
  detail: z.string().optional(),
  lastFetchedAt: z.coerce.date().optional(),
  providerId: IDZod,
  userId: IDZod,
  departmentId: IDZod.optional(),
  shippingLabelUrl: z.string().optional(),
  weight: z.string().optional(),
  price: z.coerce.number().optional(),
  note: z.string().optional(),
  logs: z.array(TrackingLogZod).optional(),
});
export type Tracking = z.infer<typeof TrackingZod>;

export const GetTrackingsZod = PageQueryZod.extend({
  status: TrackingZod.shape.status.optional(),
  trackingNumber: TrackingZod.shape.trackingNumber.optional(),
  trackingNumberIn: z.string(TrackingZod.shape.trackingNumber).optional(),
  departmentId: IDZod.optional(),
  orderId: TrackingZod.shape.orderId.optional(),
  orderIdIn: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  archived: z.string().optional(),
  overdue3Days: z.coerce.boolean().optional(),
  overdue5Days: z.coerce.boolean().optional(),
  overdue30Days: z.coerce.boolean().optional(),
  providerId: IDZod.optional(),
  userId: IDZod.optional(),
});
export class GetTrackingsDto extends createZodDto(extendApi(GetTrackingsZod)) {}

export const GetTrackingsResZod = PageResZod.extend({
  data: TrackingZod.array(),
});
export class GetTrackingsResDto extends createZodDto(extendApi(GetTrackingsResZod)) {}

export const GetTrackStatisticsZod = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export const GetTrackingStatisticsZod = GetTrackStatisticsZod.extend({
  orderId: TrackingZod.shape.orderId.optional(),
  trackingNumber: TrackingZod.shape.trackingNumber.optional(),
  departmentId: IDZod.optional(),
  providerId: IDZod.optional(),
});

export class GetTrackingStatisticsDto extends createZodDto(extendApi(GetTrackingStatisticsZod)) {}
export const GetTrackingStatisticsResZod = ResZod;
export class GetTrackingStatisticsResDto extends createZodDto(extendApi(GetTrackingStatisticsResZod)) {}

export const CreateTrackingZod = z.object({
  trackingNumber: TrackingZod.shape.trackingNumber,
  shippingLabelUrl: z.string().optional(),
  departmentId: IDZod.optional(),
  orderId: TrackingZod.shape.orderId,
  startDate: z.coerce.date({ message: 'Start Date must be a valid date' }),
  status: TrackingZod.shape.status.optional(),
  detail: TrackingZod.shape.detail.optional(),
  lastFetchedAt: z.coerce.date().optional(),
  providerId: z.string(),
  weight: z.string({ message: 'Weight must be a string' }).optional(),
  price: z.coerce.number({ message: 'Price must be a number' }).min(0, 'Price must be a positive number').optional(),
  department: z.string({ message: 'Department must be a string' }),
});
export class CreateTrackingDto extends createZodDto(extendApi(CreateTrackingZod)) {}
export type CreateTrackingValues = z.infer<typeof CreateTrackingZod>;

export const CreateTrackingResZod = ResZod.extend({
  data: TrackingZod,
});
export class CreateTrackingResDto extends createZodDto(extendApi(CreateTrackingResZod)) {}

export const UpdateTrackingNoteZod = z.object({
  note: z.string({ message: 'Note cannot be empty' }).trim(),
});
export class UpdateTrackingNoteDto extends createZodDto(extendApi(UpdateTrackingNoteZod)) {}
//
export const ExcelImportTrackingZod = z
  .object({
    trackingNumber: NameZod,
    department: z.string().optional(),
    orderId: TrackingZod.shape.orderId,
    startDate: z.coerce.date(),
    provider: z.string(),
    weight: z.string(),
    shippingLabelUrl: z.string().optional(),
    result: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.trackingNumber.includes('+')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tracking number cannot contain "+" symbol.',
        path: ['trackingNumber'],
      });
    }

    if (data.orderId.includes('+')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Order ID cannot contain "+" symbol.',
        path: ['orderId'],
      });
    }

    if (data.shippingLabelUrl) {
      try {
        new URL(data.shippingLabelUrl);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Shipping URL is not valid.',
          path: ['shippingLabelUrl'],
        });
      }
    }
  })
  .transform((data) => {
    return {
      ...data,
    };
  });
export type ExcelImportTracking = z.infer<typeof ExcelImportTrackingZod>;
export class ExcelImportTrackingDto extends createZodDto(ExcelImportTrackingZod) {}

export const ImportTrackingsZod = z.object({
  fileContent: z.string().max(5000000),
});
export class ImportTrackingsDto extends createZodDto(extendApi(ImportTrackingsZod)) {}

export const UpdateTrackingZod = z.object({
  trackingNumber: TrackingZod.shape.trackingNumber.optional(),
  shippingLabelUrl: z.string().optional(),
  departmentId: IDZod.optional(),
  orderId: TrackingZod.shape.orderId.optional(),
  status: TrackingZod.shape.status.optional(),
  startDate: z.coerce.date().optional(),
  detail: TrackingZod.shape.detail.optional(),
  providerId: z.string(),
  lastFetchedAt: z.coerce.date().optional(),
  weight: z.string({ message: 'Weight must be a string' }).optional(),
  price: z.coerce.number({ message: 'Price must be a number' }).min(0, 'Price must be a positive number').optional(),
});
export class UpdateTrackingDto extends createZodDto(extendApi(UpdateTrackingZod)) {}

export const UpdateTrackingResZod = ResZod.extend({
  data: TrackingZod,
});
export class UpdateTrackingResDto extends createZodDto(extendApi(UpdateTrackingResZod)) {}

export const GetTrackingResZod = ResZod.extend({
  data: TrackingZod,
});
export class GetTrackingResDto extends createZodDto(extendApi(GetTrackingResZod)) {}

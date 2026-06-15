import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { ApiKeyEnv, ApiScope, PartnerApiErrorCode } from '../constants/api-key';
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH, NOTE_MAX_LENGTH, NOTE_MIN_LENGTH, QUANTITY_MAX } from '../constants/common-length';
import { IDZod } from '../constants/common-zod';
import { OrderStatus } from '../constants/order';

const PAGE_MAX = 100;

export const PartnerPaginationZod = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(20),
});

export const PartnerMetaZod = z.object({
  requestId: z.string().optional(),
});

export const PartnerSuccessZod = <T extends z.ZodTypeAny>(dataZod: T) =>
  z.object({
    success: z.literal(true),
    data: dataZod,
    meta: PartnerMetaZod.optional(),
  });

export const PartnerErrorBodyZod = z.object({
  code: z.nativeEnum(PartnerApiErrorCode),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export const PartnerErrorResZod = z.object({
  success: z.literal(false),
  error: PartnerErrorBodyZod,
  meta: PartnerMetaZod.optional(),
});
export type PartnerErrorRes = z.infer<typeof PartnerErrorResZod>;

export const PartnerAuthPingDataZod = z.object({
  name: z.string(),
  email: z.string(),
  env: z.nativeEnum(ApiKeyEnv),
  scopes: z.array(z.nativeEnum(ApiScope)),
});
export const PartnerAuthPingResZod = PartnerSuccessZod(PartnerAuthPingDataZod);
export class PartnerAuthPingResDto extends createZodDto(extendApi(PartnerAuthPingResZod)) {}

export const PartnerVariantZod = z.object({
  variantCode: z.string(),
  variantId: IDZod,
  productCode: z.string(),
  productTitle: z.string(),
  optionNames: z.array(z.string()).optional(),
  options: z.array(z.string()).optional(),
  price: z.number().nonnegative(),
  shippingFee: z.number().nonnegative().optional(),
  imageUrl: z.string().optional(),
});
export type PartnerVariant = z.infer<typeof PartnerVariantZod>;

export const ListPartnerVariantsQueryZod = PartnerPaginationZod.extend({
  search: z.string().optional(),
  productCode: z.string().optional(),
});
export class ListPartnerVariantsQueryDto extends createZodDto(extendApi(ListPartnerVariantsQueryZod)) {}

export const ListPartnerVariantsResZod = PartnerSuccessZod(
  z.object({
    items: PartnerVariantZod.array(),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
  }),
);
export class ListPartnerVariantsResDto extends createZodDto(extendApi(ListPartnerVariantsResZod)) {}

export const PartnerVariantResZod = PartnerSuccessZod(PartnerVariantZod);
export class PartnerVariantResDto extends createZodDto(extendApi(PartnerVariantResZod)) {}

// Bulk lookup — validate nhiều variants trước khi tạo order
export const LookupPartnerVariantsZod = z.object({
  variantCodes: z.array(z.string().min(1)).min(1, 'At least 1 variantCode required').max(100, 'Max 100 codes per call'),
});
export class LookupPartnerVariantsDto extends createZodDto(extendApi(LookupPartnerVariantsZod)) {}

export const PartnerVariantPreviewZod = PartnerVariantZod.extend({
  available: z.boolean(),
});
export type PartnerVariantPreview = z.infer<typeof PartnerVariantPreviewZod>;

export const LookupPartnerVariantsResZod = PartnerSuccessZod(
  z.object({
    found: PartnerVariantPreviewZod.array(),
    notFound: z.array(z.string()),
  }),
);
export class LookupPartnerVariantsResDto extends createZodDto(extendApi(LookupPartnerVariantsResZod)) {}

export const PartnerShippingAddressZod = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  region: z.string().min(1),
  country: z.string().min(2),
  zip: z.string().min(1),
  phone: z.string().optional(),
  // Optional, but if provided must be a valid email. Empty string treated as omitted.
  email: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().email().optional(),
  ),
});

export const PartnerLineItemInputZod = z
  .object({
    variantCode: z.string().min(1, 'variantCode is required'),
    quantity: z.coerce.number().int().min(1, 'quantity must be >= 1').max(QUANTITY_MAX, `quantity must be <= ${QUANTITY_MAX}`),
    frontArtworkUrl: z.string().url('frontArtworkUrl must be a valid URL').optional(),
    backArtworkUrl: z.string().url('backArtworkUrl must be a valid URL').optional(),
    leftArtworkUrl: z.string().url('leftArtworkUrl must be a valid URL').optional(),
    rightArtworkUrl: z.string().url('rightArtworkUrl must be a valid URL').optional(),
    collarArtworkUrl: z.string().url('collarArtworkUrl must be a valid URL').optional(),
    mockupUrls: z.array(z.string().url('mockupUrls items must be valid URLs')).max(2, 'Max 2 mockup URLs').optional(),
    sellerNote: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.frontArtworkUrl && !data.backArtworkUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['frontArtworkUrl'],
        message: 'Either frontArtworkUrl or backArtworkUrl is required',
      });
    }
  });

export const CreatePartnerOrderZod = z
  .object({
    externalRef: z.string().trim().min(1).max(100),
    lineItems: z.array(PartnerLineItemInputZod).min(1, 'At least 1 line item required').max(50, 'Max 50 line items per order'),
    shippingAddress: PartnerShippingAddressZod,
    shippingLabelUrl: z.string().url({ message: 'shippingLabelUrl must be a valid URL pointing to a PDF or image' }),
    trackingNumber: z
      .string()
      .trim()
      .min(NAME_MIN_LENGTH, `trackingNumber must be at least ${NAME_MIN_LENGTH} chars`)
      .max(NAME_MAX_LENGTH, `trackingNumber too long (max ${NAME_MAX_LENGTH})`)
      .transform((v) => v.replace(/\s/g, '')),
    shippingMethod: z.string().optional(),
    note: z.string().max(NOTE_MAX_LENGTH).optional(),
  })
  .superRefine((data, ctx) => {
    // externalRef không chứa ký tự nguy hiểm (theo ExcelImport rule)
    if (data.externalRef.includes('+')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['externalRef'],
        message: 'externalRef cannot contain "+" symbol',
      });
    }

    // trackingNumber không chứa "+" (giống ExcelImport rule)
    if (data.trackingNumber.includes('+')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trackingNumber'],
        message: 'trackingNumber cannot contain "+" symbol',
      });
    }

    // Duplicate variantCode trong cùng order (giống checkForDuplicateVariants)
    const seen = new Set<string>();

    data.lineItems.forEach((li, idx) => {
      if (seen.has(li.variantCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lineItems', idx, 'variantCode'],
          message: `Duplicate variantCode '${li.variantCode}' trong cùng order. Gộp quantity hoặc tách thành order khác.`,
        });
      } else {
        seen.add(li.variantCode);
      }
    });
  });
export class CreatePartnerOrderDto extends createZodDto(extendApi(CreatePartnerOrderZod)) {}

// Bulk: 1 hoặc nhiều order trong 1 call
export const CreatePartnerOrdersBulkZod = z.object({
  orders: z.array(CreatePartnerOrderZod).min(1).max(50),
});
export class CreatePartnerOrdersBulkDto extends createZodDto(extendApi(CreatePartnerOrdersBulkZod)) {}

// Per-order error structure
export const PartnerOrderErrorZod = z.object({
  index: z.number().int(),
  externalRef: z.string().optional(),
  issues: z.array(
    z.object({
      field: z.string(),
      code: z.string(),
      message: z.string(),
    }),
  ),
});

// Validation failed response (returned at top-level when any order fails)
export const CreatePartnerOrdersErrorResZod = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.literal('VALIDATION_ERROR'),
    message: z.string(),
    details: z.object({
      errors: z.array(PartnerOrderErrorZod),
    }),
  }),
});

// Success response — array of created orders
export const CreatePartnerOrdersBulkResZod = PartnerSuccessZod(
  z.object({
    created: z.array(
      z.object({
        index: z.number().int(),
        externalRef: z.string(),
        orderCode: z.string(),
        status: z.string(),
        isTest: z.literal(true).optional(),
      }),
    ),
  }),
);
export class CreatePartnerOrdersBulkResDto extends createZodDto(extendApi(CreatePartnerOrdersBulkResZod)) {}

export const PartnerLineItemOutZod = z.object({
  variantCode: z.string(),
  productTitle: z.string(),
  quantity: z.number().int(),
  frontArtworkUrl: z.string().optional(),
  backArtworkUrl: z.string().optional(),
});

export const PartnerOrderZod = z.object({
  orderCode: z.string(),
  externalRef: z.string().optional(),
  status: z.nativeEnum(OrderStatus),
  paymentStatus: z.enum(['paid', 'pending', 'failed']),
  total: z.number(),
  currency: z.string().default('USD'),
  shippingMethod: z.string().optional(),
  shippingAddress: PartnerShippingAddressZod.optional(),
  lineItems: PartnerLineItemOutZod.array(),
  trackingNumber: z.string().optional(),
  trackingStatus: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  // Set to true only when order was created via a test API key. Field is omitted for live orders.
  isTest: z.literal(true).optional(),
});
export type PartnerOrder = z.infer<typeof PartnerOrderZod>;

export const PartnerOrderResZod = PartnerSuccessZod(PartnerOrderZod);
export class PartnerOrderResDto extends createZodDto(extendApi(PartnerOrderResZod)) {}

export const ListPartnerOrdersQueryZod = PartnerPaginationZod.extend({
  status: z.nativeEnum(OrderStatus).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  externalRef: z.string().optional(),
});
export class ListPartnerOrdersQueryDto extends createZodDto(extendApi(ListPartnerOrdersQueryZod)) {}

export const ListPartnerOrdersResZod = PartnerSuccessZod(
  z.object({
    items: PartnerOrderZod.array(),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
  }),
);
export class ListPartnerOrdersResDto extends createZodDto(extendApi(ListPartnerOrdersResZod)) {}

export const CancelPartnerOrderResZod = PartnerSuccessZod(
  z.object({
    orderCode: z.string(),
    status: z.nativeEnum(OrderStatus),
    isTest: z.literal(true).optional(),
  }),
);
export class CancelPartnerOrderResDto extends createZodDto(extendApi(CancelPartnerOrderResZod)) {}

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { RefinementCtx } from 'zod';
import { z } from 'zod';

import { TIMEZONE } from '..';
import {
  CODE_LENGTH,
  EXTERNAL_ID_MAX_LENGTH,
  ID_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PRICE_MAX,
  PRICE_MIN,
} from './common-length';

dayjs.extend(utc);
dayjs.extend(timezone);

dayjs.extend(utc);
dayjs.extend(timezone);

const checkDecimalPlaces = (val: number, maxDecimalPlaces = 2) => {
  const parts = val.toString().split('.');

  if (parts[1]) {
    return parts[1].length <= maxDecimalPlaces;
  }

  return true;
};

export const refineDecimalPlaces = (val: number, ctx: RefinementCtx) => {
  if (!checkDecimalPlaces(val)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Value must have at most 2 decimal places',
    });
  }
};

export const optionalStringTransform = (value: string | undefined) => {
  if (value?.trim() === '') {
    return undefined;
  } else {
    return value;
  }
};

export const TextTrimZod = z.string().trim();
// export const TextZod = z.string().max(NORMAL_TEXT_MAX_LENGTH).trim();

export const ExternalIDZod = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH)
  .max(EXTERNAL_ID_MAX_LENGTH)
  .refine((value) => /^\S+$/.test(value), "Order ID can't have space")
  .refine((value) => !value.includes('__'), "Order ID can't contain '__'");

export const PriceZod = z.coerce.number().min(PRICE_MIN).max(PRICE_MAX).superRefine(refineDecimalPlaces);

export const IDZod = z.string().length(ID_LENGTH, `String must be exactly ${ID_LENGTH} characters long`);

export const CodeZod = z.string().length(CODE_LENGTH);

export const TextZod = z
  .string()
  .trim()
  .transform((value) => {
    if (value?.trim().length === 0) {
      return undefined;
    }
    return value;
  });

export const NameZod = z
  .string()
  .min(NAME_MIN_LENGTH, `String must be at least ${NAME_MIN_LENGTH} characters long`)
  .max(NAME_MAX_LENGTH, `String must be no more than ${NAME_MAX_LENGTH} characters long`)
  .trim();

export const URLZod = z
  .string()
  .trim()
  .refine((value) => /^(https?):\/\/(?=.*\.[a-z]{2,})[^\s$.?#].[^\s]*$/i.test(value), {
    message: 'Please enter a valid URL',
  });

export const OptionalURLZod = z
  .string()
  .trim()
  .optional()
  .transform(optionalStringTransform)
  .refine(
    (value) => {
      if (value?.trim()) {
        return /^(https?):\/\/(?=.*\.[a-z]{2,})[^\s$.?#].[^\s]*$/i.test(value);
      }

      return true;
    },
    {
      message: 'Please enter a valid URL',
    },
  );

export const BooleanZod = z.string().transform((value) => {
  if (value === 'true') {
    return true;
  } else if (value === 'false') {
    return false;
  } else {
    return value;
  }
});

export const TrackingNumberZod = z.coerce
  .string()
  .trim()
  .min(NAME_MIN_LENGTH)
  .max(NAME_MAX_LENGTH)
  .transform((val) => {
    if (val.trim() === '') {
      return undefined;
    }

    return val?.replace(/\s/g, '');
  })
  .refine(
    (val) => {
      if (val && val.includes('+')) {
        return false;
      }

      return true;
    },
    {
      message: 'Tracking Number cannot contain "+" symbol.',
    },
  )
  .refine((value) => !value?.includes('__'), "Order ID can't contain '__'");

export const VNDateZod = z
  .string()
  .refine(
    (value) => {
      const date = new Date(value);

      return !Number.isNaN(date.getTime());
    },
    {
      message: 'Please enter a valid date',
    },
  )
  .transform((value) => {
    const date = dayjs(value).tz(TIMEZONE, true);

    return date as dayjs.Dayjs;
  });

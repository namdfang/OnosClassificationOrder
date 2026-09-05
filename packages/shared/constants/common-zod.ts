import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { RefinementCtx } from 'zod';
import { z } from 'zod';

import { TIMEZONE } from './common';
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

/**
 * Id THAM CHIẾU tới bản ghi bảng khác (roleId, customRoleId…). KHÁC `IDZod`:
 * không ép đúng `ID_LENGTH` ký tự. Một số bản ghi hệ thống có `_id` là chuỗi
 * cố định đặt tay chứ không phải mã 16 ký tự sinh tự động — ví dụ `roles` có
 * `role_admin` (10) và `role_seller_manager` (19) — nên ràng buộc độ dài làm
 * KHÔNG tạo được user Admin/SellerManager qua giao diện dù dropdown vẫn liệt
 * kê 2 role đó. Sự tồn tại của bản ghi vẫn được service kiểm ở tầng dưới.
 */
export const RefIDZod = z.string().trim().min(1).max(64);

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


/**
 * Cờ boolean trên query string, phân giải ĐÚNG NGHĨA.
 *
 * `z.coerce.boolean()` KHÔNG dùng được cho query string: nó theo luật truthy
 * của JavaScript nên mọi chuỗi khác rỗng đều thành `true` — kể cả `'false'`,
 * `'0'`, `'no'`. Một tham số mà `false` lại có nghĩa `true` là bẫy đặt sẵn cho
 * người viết màn hình sau và cho chính người đang gỡ lỗi bằng cách sửa URL
 * (ORD-21).
 *
 * Luật:
 *   - bật  : `true` / `1` (và boolean `true` khi gọi từ trong mã)
 *   - tắt  : `false` / `0`
 *   - không gửi, hoặc chuỗi rỗng → `undefined` (giữ nguyên nghĩa optional)
 *   - giá trị không hiểu được (`no`, `abc`, `2`…) → `false`
 *
 * Chọn phía AN TOÀN khi không chắc: `false`, không ném lỗi 400. Ném lỗi sẽ làm
 * hỏng những nơi đang lỡ gửi giá trị lạ, còn `false` thì trở về đúng hành vi
 * mặc định vốn có.
 */
export const BooleanFlagZod = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['true', '1'].includes(value.trim().toLowerCase());
  return false;
}, z.boolean().optional());
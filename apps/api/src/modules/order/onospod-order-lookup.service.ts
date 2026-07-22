import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import type { DesignFields, ProductionOrderShippingAddress } from 'shared';
import { Logger } from 'winston';

import { ApiConfigService } from '@/shared/services';

// Gateway OnosPod chặn 403 nếu THIẾU header `origin` (verify bằng test gọi
// thật 2026-07-23: cùng token, có `origin` → 200, thiếu `origin` (kể cả có
// `referer`) → 403 "Forbidden"). KHÔNG phải lỗi token/password — token vẫn
// hợp lệ, gateway chỉ chặn request "không giống" gọi từ app.onospod.com.
const ONOSPOD_ORIGIN = 'https://app.onospod.com';

// Đồng bộ field với query thật của FE admin OnosPod (app.onospod.com) — chỉ
// giữ field cần cho design + shipping + key match (productions.increment_id),
// bỏ toàn bộ field billing/tracking/... không dùng tới.
const ORDER_LOOKUP_QUERY = `query OrderLookup($search: String!) {
  orders(
    search: $search
    _id: ""
    id: ""
    ids: []
    identity: ""
    status: "All"
    tracking_status: ""
    platform: ""
    store_id: ""
    product_id: ""
    product_name: ""
    buyer: ""
    start: ""
    end: ""
    auth_id: ""
    manufacture_id: ""
    ignoreReturn: true
  ) {
    _id
    line_items {
      order_line_item_id
      productions { increment_id }
      print {
        design_front { src }
        design_back { src }
        design_sleeve { src }
        design_hood { src }
        design_placket { src }
        design_left { src }
        design_right { src }
        design_chest_left { src }
        design_chest_right { src }
        design_sleeve_left { src }
        design_sleeve_right { src }
        design_upper_sleeve_left { src }
        design_upper_sleeve_right { src }
        design_left_cuff { src }
        design_right_cuff { src }
      }
    }
    shipping {
      first_name
      last_name
      company
      address_1
      address_2
      city
      state
      postcode
      country
      email
      phone
    }
  }
}`;

// `design_*` = file design KHÁCH ĐÃ UP, đã qua xử lý (asset thật hosted trên
// `cdn.onospod.com`) — KHÔNG phải field trần `front`/`back`/... (chỉ là link
// Drive gốc lúc khách paste, có thể chưa qua xử lý/hết hạn quyền xem).
type OnospodDesignKey =
  | 'design_front'
  | 'design_back'
  | 'design_sleeve'
  | 'design_hood'
  | 'design_placket'
  | 'design_left'
  | 'design_right'
  | 'design_chest_left'
  | 'design_chest_right'
  | 'design_sleeve_left'
  | 'design_sleeve_right'
  | 'design_upper_sleeve_left'
  | 'design_upper_sleeve_right'
  | 'design_left_cuff'
  | 'design_right_cuff';

type OnospodPrint = Partial<Record<OnospodDesignKey, { src?: string | null } | null>>;

type OnospodOrder = {
  _id: string;
  line_items: Array<{
    order_line_item_id: string;
    productions: Array<{ increment_id: string }> | null;
    print: OnospodPrint | null;
  }> | null;
  shipping: {
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
    address_1?: string | null;
    address_2?: string | null;
    city?: string | null;
    state?: string | null;
    postcode?: string | null;
    country?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

// camelCase (DesignFields) -> field `design_*` (OnosPod) — chỉ vị trí có
// tương ứng trực tiếp. `folder`/`frontEmbroidery`/`backEmbroidery` không có
// field `design_*` tương đương bên OnosPod nên KHÔNG map (giữ nguyên giá trị
// hiện có, không đụng tới).
const DESIGN_FIELD_MAP: Partial<Record<keyof DesignFields, OnospodDesignKey>> = {
  front: 'design_front',
  back: 'design_back',
  sleeve: 'design_sleeve',
  hood: 'design_hood',
  placket: 'design_placket',
  left: 'design_left',
  right: 'design_right',
  chestLeft: 'design_chest_left',
  chestRight: 'design_chest_right',
  sleeveLeft: 'design_sleeve_left',
  sleeveRight: 'design_sleeve_right',
  leftUpperSleeve: 'design_upper_sleeve_left',
  rightUpperSleeve: 'design_upper_sleeve_right',
  leftCuff: 'design_left_cuff',
  rightCuff: 'design_right_cuff',
};

export type OnospodLookupResult = {
  /** true nếu tìm thấy ĐÚNG 1 line_item khớp `productionId`. */
  matched: boolean;
  /** true nếu >1 line_item cùng khớp `productionId` — dữ liệu bất thường, KHÔNG áp dụng, cần review tay. */
  ambiguous: boolean;
  design?: Partial<DesignFields>;
  shipping?: ProductionOrderShippingAddress;
};

@Injectable()
export class OnospodOrderLookupService {
  constructor(
    private readonly apiConfigService: ApiConfigService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  /**
   * Tìm design + địa chỉ ship của 1 đơn qua OnosPod order API (api.onospod.com)
   * — match line_item bằng `line_items[].productions[].increment_id ===
   * productionId`. `increment_id` ở `productions` CHÍNH LÀ `productionId` nội
   * bộ — KHÔNG phải `line_items[].product_id` (khác định dạng hoàn toàn, đã
   * verify bằng test gọi thật 2026-07-22 — xem `Orders.md §9c`).
   *
   * `orderNumber` = `order.orderId` (mã đơn OnosPod dạng "NF-xxxxx-xxxxx") —
   * dùng làm search term để tìm đúng order cha trước khi soi từng line_item
   * (1 order OnosPod có thể có nhiều line_items ứng với nhiều size/màu, mỗi
   * line_item lại có thể có nhiều `productions` — bản re-print/rework).
   */
  async lookupByProductionId(orderNumber: string, productionId: string): Promise<OnospodLookupResult | null> {
    const config = this.apiConfigService.onospodApiConfig;
    if (!config) return null;

    let res;
    try {
      res = await axios.post(
        config.apiUrl,
        { operationName: 'OrderLookup', variables: { search: orderNumber }, query: ORDER_LOOKUP_QUERY },
        {
          headers: {
            Authorization: `Bearer ${config.bearerToken}`,
            'x-onos-super-token': config.superToken,
            'Content-Type': 'application/json',
            // Gateway OnosPod yêu cầu origin khớp app.onospod.com — thiếu là 403,
            // KHÔNG liên quan token/password. Xem comment `ONOSPOD_ORIGIN` trên.
            Origin: ONOSPOD_ORIGIN,
            Referer: `${ONOSPOD_ORIGIN}/`,
          },
          timeout: 20_000,
        },
      );
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const message = axios.isAxiosError(err) ? err.message : 'Unknown error';
      this.logger.error({
        message: JSON.stringify({ action: 'onospodOrderLookup', orderNumber, productionId, status, error: message }),
      });
      return null;
    }

    const gqlErrors = res.data?.errors;
    if (Array.isArray(gqlErrors) && gqlErrors.length > 0) {
      this.logger.error({
        message: JSON.stringify({ action: 'onospodOrderLookup', orderNumber, productionId, gqlErrors }),
      });
      return null;
    }

    const orders = res.data?.data?.orders as OnospodOrder[] | undefined;
    if (!orders || orders.length === 0) return { matched: false, ambiguous: false };

    const matches: Array<{ order: OnospodOrder; lineItem: NonNullable<OnospodOrder['line_items']>[number] }> = [];
    for (const order of orders) {
      for (const lineItem of order.line_items || []) {
        const hit = (lineItem.productions || []).some((p) => p.increment_id === productionId);
        if (hit) matches.push({ order, lineItem });
      }
    }

    if (matches.length === 0) return { matched: false, ambiguous: false };
    if (matches.length > 1) return { matched: false, ambiguous: true };

    const { order, lineItem } = matches[0];

    const design: Partial<DesignFields> = {};
    if (lineItem.print) {
      for (const [ourKey, onospodKey] of Object.entries(DESIGN_FIELD_MAP) as Array<
        [keyof DesignFields, OnospodDesignKey]
      >) {
        const src = lineItem.print[onospodKey]?.src;
        if (src) design[ourKey] = src;
      }
    }

    let shipping: ProductionOrderShippingAddress | undefined;
    if (order.shipping) {
      shipping = {
        firstName: order.shipping.first_name || undefined,
        lastName: order.shipping.last_name || undefined,
        company: order.shipping.company || undefined,
        address1: order.shipping.address_1 || undefined,
        address2: order.shipping.address_2 || undefined,
        city: order.shipping.city || undefined,
        state: order.shipping.state || undefined,
        postcode: order.shipping.postcode || undefined,
        country: order.shipping.country || undefined,
        email: order.shipping.email || undefined,
        phone: order.shipping.phone || undefined,
      };
    }

    return { matched: true, ambiguous: false, design, shipping };
  }
}

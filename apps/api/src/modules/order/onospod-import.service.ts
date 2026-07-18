import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import type { DesignFields, ImportFromOnosPodDto, ImportFromOnosPodResDto } from 'shared';

import { ApiConfigService } from '@/shared/services';

import type { AuditContext } from '../order-log/order-log.service';
import { OrderService } from './order.service';

const TZ_OFFSET_MINUTES = 7 * 60;

// Chỉ pull đơn "To Do" — đúng với thao tác thủ công hàng ngày (lấy đơn MỚI
// chưa vào sản xuất, không lấy lại đơn đã xử lý).
const MRP_STATUS = 'To Do';

const PAGE_SIZE = 500;
const MAX_PAGES = 200; // an toàn — 200 * 500 = 100k rows, dư sức cho 1 ngày/1 manufacture

const MANUFACTURES_QUERY = `query Manufactures($search: String, $page: Int, $page_size: Int) {
  manufactures(search: $search, page: $page, page_size: $page_size) {
    _id
    name
    sku
    country
  }
}`;

// Đồng bộ với query thật của FE admin OnosPod (qc.onospod.com) thay vì tự
// chọn field tay như trước — tránh lệch schema về sau. Bỏ field
// `productionStatusSummary` (sibling, không liên quan phân trang, không dùng)
// + mọi `__typename` (thuần metadata Apollo, không cần cho parse tay bằng
// axios). Bỏ `production_src` trong fragment `LineItemPrint` — field này LUÔN
// null trên thực tế, `mapItemToRow()` vẫn đọc `.src` như cũ. THÊM `quantity`
// + `price` vào fragment `MrpProduct` (FE OnosPod không query 2 field này
// nhưng `mapItemToRow()` cần cho `quantity`/`baseCost` — verify bằng test
// gọi thật 2026-07-18: thiếu thì cả 2 về undefined).
const PAGINATE_QUERY = `query PaginateMrpProduct(
  $manufacture_id: String
  $page_size: Int
  $page: Int
  $status: String
  $barcode: String
  $increment_id: String
  $start: String
  $end: String
  $is_embroidery: Boolean
  $pattern_status: String
  $product_type_ids: [String!]
  $account_id: [String!]
) {
  paginateMrpProduct(
    manufacture_id: $manufacture_id
    page: $page
    perpage: $page_size
    mrp_status: $status
    barcode: $barcode
    increment_id: $increment_id
    is_embroidery: $is_embroidery
    start: $start
    end: $end
    pattern_status: $pattern_status
    product_type_ids: $product_type_ids
    account_id: $account_id
  ) {
    items {
      ...MrpProduct
    }
    paginate {
      ...Paginate
    }
  }
}

fragment MrpProduct on MrpProduct {
  _id
  order_id
  increment_id
  increment_order_id
  batch_id
  barcode
  barcode_src
  print_method
  qr_to_barcode_count
  src
  quantity
  price
  product_type {
    _id
    name
    image
    sku
  }
  mrp_log {
    mrp_status
    user_id
    note
    created_at
    user {
      _id
      identity_label
      email
    }
  }
  print {
    front
    back
    sleeve
    hood
    meta_data {
      key
      value
    }
    print_areas {
      key
      name
      is_part
      is_embroidery
    }
    print_areas_customs {
      key
      name
      file {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
      is_part
      is_required
      is_embroidery
      barcode
      barcode_src
      stitch_count
      colors {
        code
        name
        hex
      }
    }
    design_front {
      ... on LineItemPrint {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
    }
    design_back {
      ... on LineItemPrint {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
    }
    design_sleeve {
      ... on LineItemPrint {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
    }
    design_hood {
      ... on LineItemPrint {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
    }
    design_sleeve_left {
      ... on LineItemPrint {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
    }
    design_sleeve_right {
      ... on LineItemPrint {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
    }
    design_chest_left {
      ... on LineItemPrint {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
    }
    design_chest_right {
      ... on LineItemPrint {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
    }
    design_placket {
      ... on LineItemPrint {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
    }
    design_left {
      ... on LineItemPrint {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
    }
    design_right {
      ... on LineItemPrint {
        _id
        src
        image_sizes {
          name
          width
          height
          url
        }
      }
    }
    design_left_cuff {
      ...LineItemPrint
    }
    design_right_cuff {
      ...LineItemPrint
    }
  }
  manufacture {
    _id
    name
    sku
    country
  }
  auth {
    _id
    identity_label
    email
  }
  is_embroidery
  mrp_status
  mrp_created_at
  mrp_press_completed_at
  mrp_cut_completed_at
  mrp_print_completed_at
  mrp_embroidery_completed_at
  mrp_sew_completed_at
  mrp_packing_completed_at
  press_completed
  cut_completed
  print_completed
  embroidery_completed
  sew_completed
  package_completed
  mrp_design_ready_at
  mrp_photo_required
  mrp_actual_photos
}

fragment LineItemPrint on LineItemPrint {
  _id
  src
  size
  width
  height
  image_sizes {
    name
    url
    width
    height
  }
  task_id
}

fragment Paginate on Paginate {
  total_items
  current_page
  total_pages
}`;

type Manufacture = {
  _id: string;
  name: string;
  sku: string;
  country?: string;
};

type MrpPrintAreaCustom = {
  key?: string | null;
  name?: string | null;
  file?: { src?: string | null } | null;
  is_embroidery?: boolean | null;
};

type MrpPrint = {
  meta_data?: { key?: string; value?: string | null }[] | null;
  print_areas_customs?: MrpPrintAreaCustom[] | null;
} & Record<string, unknown>;

type MrpProductItem = {
  order_id?: string;
  increment_id?: string;
  increment_order_id?: string;
  print_method?: string | null;
  src?: string | null;
  quantity?: number | null;
  price?: string | null;
  product_type?: { name?: string } | null;
  mrp_status?: string;
  mrp_created_at?: string;
  auth?: { identity_label?: string; email?: string } | null;
  print?: MrpPrint | null;
};

/**
 * 18 vị trí design hợp lệ của `DesignFields` (shared) — dùng validate key
 * quét động từ response, tránh nhặt nhầm key `design_*` lạ ngoài schema đơn.
 */
const DESIGN_FIELD_KEYS = new Set<keyof DesignFields>([
  'front',
  'back',
  'sleeve',
  'hood',
  'folder',
  'placket',
  'chestLeft',
  'chestRight',
  'left',
  'right',
  'sleeveLeft',
  'sleeveRight',
  'leftUpperSleeve',
  'rightUpperSleeve',
  'leftCuff',
  'rightCuff',
  'frontEmbroidery',
  'backEmbroidery',
]);

/**
 * Quét ĐỘNG mọi key `design_*` trong `item.print` — response chỉ chứa key ở
 * vị trí đơn CÓ design (không có design → vắng key/null), nên không hardcode
 * danh sách vị trí như trước. Convert `design_chest_left` → `chestLeft`
 * (snake→camel) rồi đối chiếu `DESIGN_FIELD_KEYS`; key không thuộc
 * `DesignFields` bị bỏ qua. Nhờ đó query thêm vị trí mới (vd `design_folder`)
 * là tự map, không phải sửa code.
 */
function extractDesigns(print: MrpPrint | null | undefined): Partial<DesignFields> {
  const designs: Partial<DesignFields> = {};
  for (const [key, value] of Object.entries(print || {})) {
    if (!key.startsWith('design_')) continue;
    const src = (value as { src?: string | null } | null | undefined)?.src;
    if (!src) continue;
    const camel = key
      .slice('design_'.length)
      .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as keyof DesignFields;
    if (DESIGN_FIELD_KEYS.has(camel)) designs[camel] = src;
  }
  return designs;
}

// Field mapping xác nhận qua test tay đối chiếu 1 dòng CSV export thật
// (xem documents/FunctionDescription/Orders.md §3.6). size/color đọc từ
// print.meta_data (key "Size"/"Color" — cùng nguồn OnosPod dùng cho file
// export xlsx). weight/width/height/length/shipCost/externalId KHÔNG tìm
// được field nguồn nào trên GraphQL schema (đã probe kỹ), để trống (đều
// optional trong DTO).
//
// So với CSV (parseOrders.ts, 18 vị trí design): designs quét động qua
// `extractDesigns()` — vị trí nào response có key `design_*` là map được.
// Riêng `frontEmbroidery`/`backEmbroidery` nếu quét động chưa có thì fallback
// từ `print.print_areas_customs` (entry `is_embroidery=true` + `file.src`,
// match front/back qua key/name) — nguồn mới có từ khi đồng bộ
// PAGINATE_QUERY với query thật của FE OnosPod.
function mapItemToRow(item: MrpProductItem) {
  const meta = new Map<string, string>();
  for (const m of item.print?.meta_data || []) {
    if (m?.key && m.value) meta.set(m.key.toLowerCase(), m.value);
  }

  const designs = extractDesigns(item.print);
  if (!designs.frontEmbroidery) {
    designs.frontEmbroidery = pickEmbroiderySrc(item.print?.print_areas_customs, 'front');
  }
  if (!designs.backEmbroidery) {
    designs.backEmbroidery = pickEmbroiderySrc(item.print?.print_areas_customs, 'back');
  }

  return {
    productionId: item.increment_id || '',
    userSku: item.auth?.identity_label || undefined,
    userEmail: item.auth?.email || undefined,
    type: item.product_type?.name || undefined,
    size: meta.get('size'),
    color: meta.get('color'),
    mockupUrl: item.src || undefined,
    printMethod: item.print_method || undefined,
    quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
    baseCost: parsePriceNumber(item.price),
    designs,
    status: item.mrp_status || undefined,
    orderId: item.increment_order_id || undefined,
    orderAt: item.order_id ? formatVnDateTime(objectIdTimestamp(item.order_id)) : undefined,
    inProductionAt: item.mrp_created_at ? formatVnDateTime(new Date(item.mrp_created_at)) : undefined,
  };
}

// Vùng in custom thêu (embroidery): match "front"/"back" trên key hoặc name
// (lowercase, defensive — key thực tế có thể là "front_embroidery"/"Front
// Embroidery"...). Không match → undefined, vô hại.
function pickEmbroiderySrc(
  areas: MrpPrintAreaCustom[] | null | undefined,
  side: 'front' | 'back',
): string | undefined {
  for (const area of areas || []) {
    if (!area.is_embroidery || !area.file?.src) continue;
    const label = `${area.key || ''} ${area.name || ''}`.toLowerCase();
    if (label.includes(side)) return area.file.src;
  }
  return undefined;
}

function parsePriceNumber(price: string | null | undefined): number | undefined {
  if (!price) return undefined;
  const n = Number(price);
  return Number.isFinite(n) ? n : undefined;
}

// MongoDB ObjectId: 4 byte đầu = unix timestamp (giây) lúc tạo document.
function objectIdTimestamp(id: string): Date {
  const seconds = parseInt(id.slice(0, 8), 16);
  return new Date(seconds * 1000);
}

function formatVnDateTime(date: Date): string {
  const vn = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())} ` +
    `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}:${pad(vn.getUTCSeconds())}`
  );
}

/**
 * Tự động lấy đơn "To Do" từ TẤT CẢ manufacture của account OnosPod QC
 * (qc.onospod.com) và import vào hệ thống — thay cho thao tác thủ công
 * export xlsx → tải file → paste vào ImportOrderTab hàng ngày lúc 8h/17h.
 *
 * Query trực tiếp `paginateMrpProduct` (GraphQL) thay vì cơ chế export/tải
 * file bất đồng bộ ban đầu (đã bỏ — không tìm được cách biết khi nào file
 * export sẵn sàng). Trả JSON có sẵn, không cần chờ/poll gì cả.
 *
 * Lịch chạy do EXTERNAL crontab quản lý (không dùng @nestjs/schedule nội bộ)
 * — gọi `GET /v1/orders/import-from-onospod/cron` (public, không cần auth,
 * xem OrderController). Period tự tính dựa trên thời điểm gọi thực tế qua
 * `resolvePeriod()`, không phụ thuộc lịch cron cụ thể.
 */
@Injectable()
export class OnospodImportService {
  constructor(
    private readonly apiConfigService: ApiConfigService,
    private readonly orderService: OrderService,
  ) {}

  async importFromOnosPod(dto: ImportFromOnosPodDto, ctx?: AuditContext): Promise<ImportFromOnosPodResDto> {
    const config = this.apiConfigService.onospodQcConfig;
    if (!config) {
      throw new BadRequestException(
        'OnosPod QC chưa được cấu hình (thiếu ONOSPOD_QC_API_URL / ONOSPOD_QC_BEARER_TOKEN)',
      );
    }

    const { start, end } = this.resolvePeriod(dto);
    const manufactures = await this.fetchManufactures(config);
    if (manufactures.length === 0) {
      throw new BadRequestException('OnosPod không trả về manufacture nào (query `manufactures` rỗng).');
    }

    const allItems: MrpProductItem[] = [];
    const byManufacture: { id: string; name: string; sku: string; fetched: number; error?: string }[] = [];

    // Tuần tự (không Promise.all) để tránh dồn dập request cùng lúc tới
    // OnosPod — 1 manufacture lỗi không chặn các manufacture còn lại.
    for (const m of manufactures) {
      try {
        const items = await this.fetchAllPages(config, m._id, start, end);
        allItems.push(...items);
        byManufacture.push({ id: m._id, name: m.name, sku: m.sku, fetched: items.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        byManufacture.push({ id: m._id, name: m.name, sku: m.sku, fetched: 0, error: message });
      }
    }

    if (allItems.length === 0) {
      // Phân biệt "hỏng thật" với "hết đơn": nếu MỌI manufacture đều lỗi
      // (token hết hạn, OnosPod down...) thì phải báo đúng nguyên nhân —
      // không được nuốt lỗi rồi báo "không có đơn".
      const failed = byManufacture.filter((m) => m.error);
      if (failed.length === manufactures.length) {
        throw new BadRequestException(
          `OnosPod: tất cả ${failed.length} manufacture đều lỗi — ` +
            failed.map((m) => `${m.sku}: ${m.error}`).join('; '),
        );
      }

      // Không có đơn "To Do" mới trong khoảng này — trạng thái BÌNH THƯỜNG
      // (sáng vắng, ngày lễ), đặc biệt với đường cron tự động. Trả success
      // với số 0 thay vì 400 để cron monitoring không báo động giả.
      return {
        success: true,
        data: {
          imported: 0,
          updated: 0,
          mapped: 0,
          unmapped: 0,
          skipped: [],
          totalFetched: 0,
          duplicatesInBatch: 0,
          period: { start: start.toISOString(), end: end.toISOString() },
          byManufacture,
        },
      };
    }

    const { rows, duplicatesInBatch } = this.dedupeByProductionId(allItems.map(mapItemToRow).filter((r) => r.productionId));

    const importResult = await this.orderService.importOrders({ rows }, ctx);

    return {
      success: true,
      data: {
        ...importResult.data,
        totalFetched: allItems.length,
        duplicatesInBatch,
        period: { start: start.toISOString(), end: end.toISOString() },
        byManufacture,
      },
    };
  }

  /**
   * Cùng 1 productionId có thể xuất hiện lặp trong batch tổng hợp — dữ liệu
   * OnosPod là live, item có thể dịch chuyển giữa các trang trong lúc đang
   * phân trang, hoặc (hiếm) trùng giữa 2 manufacture. Nếu để lọt, importOrders()
   * vẫn không tạo trùng record trong DB (upsert theo productionId) nhưng sẽ
   * xử lý 2 lần trong CÙNG 1 batch → lệch số liệu imported/updated + tốn công
   * design-image job. Dedupe ở đây, giữ bản ghi xuất hiện SAU CÙNG (mới nhất
   * theo thứ tự fetch).
   */
  private dedupeByProductionId<T extends { productionId: string }>(
    rows: T[],
  ): { rows: T[]; duplicatesInBatch: number } {
    const byId = new Map<string, T>();
    for (const row of rows) {
      byId.set(row.productionId, row);
    }
    return { rows: Array.from(byId.values()), duplicatesInBatch: rows.length - byId.size };
  }

  private async fetchManufactures(config: { apiUrl: string; bearerToken: string }): Promise<Manufacture[]> {
    let res;
    try {
      res = await axios.post(
        config.apiUrl,
        { operationName: 'Manufactures', variables: {}, query: MANUFACTURES_QUERY },
        {
          headers: {
            Authorization: `Bearer ${config.bearerToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.message : 'Unknown error';
      throw new BadRequestException(`Gọi OnosPod (manufactures) thất bại: ${message}`);
    }

    const gqlErrors = res.data?.errors;
    if (Array.isArray(gqlErrors) && gqlErrors.length > 0) {
      throw new BadRequestException(`OnosPod trả lỗi (manufactures): ${gqlErrors.map((e: { message?: string }) => e.message).join('; ')}`);
    }

    return res.data?.data?.manufactures || [];
  }

  /**
   * Không truyền start/end → tự tính theo giờ gọi thực tế (giờ VN):
   *   - Gọi TRƯỚC 12h trưa  → lấy từ 12h trưa HÔM TRƯỚC tới hiện tại.
   *   - Gọi TỪ 12h trưa trở đi → lấy từ 00h00 HÔM NAY tới hiện tại.
   * Không cộng thêm buffer riêng — biên 12h trưa/00h00 đã đủ rộng cho lịch
   * chạy 2 lần/ngày (8h + 17h), và importOrders() upsert theo productionId
   * nên overlap giữa các lần gọi không tạo trùng dữ liệu.
   *
   * Truyền start mà không truyền end → end = hiện tại (backfill từ 1 mốc).
   * Truyền end mà không có start → 400 (không đoán start, tránh backfill
   * âm thầm sai khoảng).
   */
  private resolvePeriod(dto: ImportFromOnosPodDto): { start: Date; end: Date } {
    const now = new Date();

    if (dto.end && !dto.start) {
      throw new BadRequestException('Truyền `end` thì phải kèm `start` — không tự đoán mốc bắt đầu.');
    }
    if (dto.start) {
      return { start: new Date(dto.start), end: dto.end ? new Date(dto.end) : now };
    }
    const vn = new Date(now.getTime() + TZ_OFFSET_MINUTES * 60_000);
    const boundary = new Date(vn);

    if (vn.getUTCHours() < 8) {
      boundary.setUTCDate(boundary.getUTCDate() - 1);
    }
    boundary.setUTCHours(0, 0, 0, 0);

    const start = new Date(boundary.getTime() - TZ_OFFSET_MINUTES * 60_000);

    return { start, end: now };
  }

  private async fetchAllPages(
    config: { apiUrl: string; bearerToken: string },
    manufactureId: string,
    start: Date,
    end: Date,
  ): Promise<MrpProductItem[]> {
    const items: MrpProductItem[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const pageItems = await this.fetchPage(config, manufactureId, start, end, page, (tp) => {
        totalPages = tp;
      });
      items.push(...pageItems);
      page++;
    } while (page <= totalPages && page <= MAX_PAGES);

    return items;
  }

  private async fetchPage(
    config: { apiUrl: string; bearerToken: string },
    manufactureId: string,
    start: Date,
    end: Date,
    page: number,
    setTotalPages: (totalPages: number) => void,
  ): Promise<MrpProductItem[]> {
    let res;
    try {
      res = await axios.post(
        config.apiUrl,
        {
          operationName: 'PaginateMrpProduct',
          variables: {
            manufacture_id: manufactureId,
            page_size: PAGE_SIZE,
            page,
            status: MRP_STATUS,
            start: start.toISOString(),
            end: end.toISOString(),
          },
          query: PAGINATE_QUERY,
        },
        {
          headers: {
            Authorization: `Bearer ${config.bearerToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.message : 'Unknown error';
      throw new BadRequestException(`Gọi OnosPod (manufacture=${manufactureId}, page ${page}) thất bại: ${message}`);
    }

    const gqlErrors = res.data?.errors;
    if (Array.isArray(gqlErrors) && gqlErrors.length > 0) {
      throw new BadRequestException(`OnosPod trả lỗi: ${gqlErrors.map((e: { message?: string }) => e.message).join('; ')}`);
    }

    const result = res.data?.data?.paginateMrpProduct;
    if (!result) {
      throw new BadRequestException(`OnosPod không trả dữ liệu (manufacture=${manufactureId}, page ${page}).`);
    }

    setTotalPages(result.paginate?.total_pages || 1);
    return result.items || [];
  }
}

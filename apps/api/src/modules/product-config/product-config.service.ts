import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import type { IFile } from 'core';
import fs from 'fs';
import { Model } from 'mongoose';
import path from 'path';
import type {
  CrawlMockupResultItem,
  CreateProductConfigDto,
  GetProductConfigsDto,
  GetProductConfigsResDto,
  ImportProductConfigDto,
  ImportProductConfigResDto,
  UnmatchedOrderType,
  UpdateProductConfigDto,
} from 'shared';
import { myNanoid, ProductConfigStatus, WorkshopConfigCategory } from 'shared';

import { CollectionService } from '../collection/collection.service';
import { FactoryService } from '../factory/factory.service';
import { MachineTypeService } from '../machine-type/machine-type.service';
import { OrderEntity } from '../order/order.entity';
import { ProductCategoryService } from '../product-category/product-category.service';
import { WorkshopConfigRepository } from '../workshop-config/workshop-config.repository';
import { ProductConfigEntity } from './product-config.entity';
import { ProductConfigRepository } from './product-config.repository';

/** workshop_config codes (category=tool_result) emitted by import defaults. */
const TOOL_RESULT_HAS = 'has-tool';
const TOOL_RESULT_NONE = 'no-tool';

/** MongoDB duplicate-key error E11000 từ unique index `variations.sku`. */
function isDuplicateVariationSkuError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: number; keyPattern?: Record<string, unknown>; message?: string };
  if (e.code !== 11000) return false;
  if (e.keyPattern?.['variations.sku'] !== undefined) return true;
  return typeof e.message === 'string' && e.message.includes('variations.sku');
}

/** MongoDB duplicate-key error E11000 từ unique index `sku` (SKU sản phẩm, khác SKU biến thể). */
function isDuplicateProductSkuError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: number; keyPattern?: Record<string, unknown>; message?: string };
  if (e.code !== 11000) return false;
  if (e.keyPattern?.sku !== undefined) return true;
  return typeof e.message === 'string' && /\bindex: sku/.test(e.message);
}

// ─── Crawl ảnh mockup từ onospod.com ─────────────────────────────────
// Dùng AJAX search của theme: POST /wp-admin/admin-ajax.php
// `action=onospod_ajax_search_products&query=<tên>&security_search=<nonce>` —
// trả JSON `[{id, value(tên), url, img(-100x100), price}]`, nhanh và chính
// xác hơn nhiều so với parse HTML trang search. KHÔNG cần cookie nhưng CẦN
// nonce `security_search` (thiếu → trả `-1`); nonce là WP nonce có hạn
// (~12-24h) nên tự scrape từ input `security-search` ở trang chủ + cache,
// gặp `-1` thì refresh 1 lần rồi retry. Không có kết quả → `[{id:-1,
// value:"No results"}]`. `img` lưu NGUYÊN dạng thumbnail `-100x100` — FE
// preview tự bỏ hậu tố để xem ảnh to.

const ONOSPOD_ORIGIN = 'https://onospod.com';
const ONOSPOD_AJAX_URL = `${ONOSPOD_ORIGIN}/wp-admin/admin-ajax.php`;
const CRAWL_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
/** Nonce cache 1 giờ — quá hạn hoặc bị từ chối (`-1`) thì scrape lại từ trang chủ. */
const NONCE_TTL_MS = 60 * 60 * 1000;
let cachedSearchNonce: { value: string; fetchedAt: number } | null = null;

/** 1 item JSON từ AJAX search — "No results" là item `id:-1` không có img. */
interface OnospodAjaxItem {
  id: number;
  value: string;
  url: string;
  img?: string;
}

/** Decode các HTML entity hay gặp trong tên sản phẩm WooCommerce (&amp;, &#8211;…). */
const decodeHtmlEntities = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

/**
 * Normalize tên để so TRÙNG CHÍNH XÁC — không fuzzy: bỏ hoa/thường, coi mọi
 * dấu gạch (hyphen/en-dash/em-dash) như khoảng trắng ("Double-Layer" ==
 * "Double Layer"), gộp khoảng trắng thừa.
 */
const normalizeProductName = (s: string): string =>
  decodeHtmlEntities(s)
    .toLowerCase()
    .replace(/[‐‑–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Normalize + sort từ — bắt case CÙNG BỘ TỪ nhưng đảo thứ tự (vd config "Set
 * All-Over Print Short-Sleeve Hawaiian Shirt" vs site "All-Over Print
 * Short-Sleeve Hawaiian Shirt Set"). Vẫn yêu cầu đúng đủ từng từ, không fuzzy.
 */
const normalizeSortedWords = (s: string): string =>
  normalizeProductName(s).split(' ').sort().join(' ');

/**
 * Các biến thể tên để thử search lần lượt (dừng ở lần khớp đầu tiên):
 * 1. Tên gốc.
 * 2. Bỏ các mã trong ngoặc vuông — "[PANT] X" / "[JK-74915]Set X" → "X" (tên
 *    config nội bộ hay đính mã không tồn tại trên onospod).
 * 3. Bỏ tiền tố code viết hoa ngắn đầu tên — "MF All-Over Print Hockey
 *    Jersey" → "All-Over Print Hockey Jersey" (trừ "AOP" vì là tên thật trên
 *    site). Mỗi attempt vẫn yêu cầu TRÙNG CHÍNH XÁC với chính attempt đó.
 */
const buildNameAttempts = (name: string): Array<{ term: string; note?: string }> => {
  const attempts: Array<{ term: string; note?: string }> = [{ term: name }];
  const noBrackets = name.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (noBrackets && noBrackets !== name) {
    attempts.push({ term: noBrackets, note: 'khớp sau khi bỏ mã [...]' });
  }
  const base = noBrackets || name;
  const noPrefix = base.replace(/^(?!AOP\b)[A-Z]{1,4}\d*\s+/, '').trim();
  if (noPrefix && noPrefix !== base && noPrefix.split(' ').length >= 3) {
    attempts.push({ term: noPrefix, note: 'khớp sau khi bỏ tiền tố code' });
  }
  return attempts;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

@Injectable()
export class ProductConfigService {
  constructor(
    private readonly productConfigRepository: ProductConfigRepository,
    private readonly factoryService: FactoryService,
    private readonly machineTypeService: MachineTypeService,
    private readonly productCategoryService: ProductCategoryService,
    private readonly collectionService: CollectionService,
    private readonly workshopConfigRepository: WorkshopConfigRepository,
    @InjectModel(ProductConfigEntity.name)
    private readonly productConfigModel: Model<ProductConfigEntity>,
    @InjectModel(OrderEntity.name)
    private readonly orderModel: Model<OrderEntity>,
  ) {}

  /**
   * Quét đơn `days` ngày gần nhất (theo `inProductionAt`, fallback `createdAt`
   * cho đơn thiếu ngày vào sản xuất; loại đơn hủy/xóa), gom theo `type`
   * (case-insensitive) rồi trả về các loại CHƯA khớp `fullName` của bất kỳ
   * Product Config nào — nguồn dữ liệu cho cột "Chưa xác định xưởng" ở kanban
   * Settings (nút Sync). Sort số đơn giảm dần để loại "nóng" nhất lên đầu.
   */
  async getUnmatchedOrderTypes(days: number): Promise<UnmatchedOrderType[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const groups = await this.orderModel.aggregate<{ _id: string; type: string; orderCount: number }>([
      {
        $match: {
          deletedAt: { $exists: false },
          cancelledAt: null,
          type: { $nin: [null, ''] },
          $or: [{ inProductionAt: { $gte: since } }, { inProductionAt: null, createdAt: { $gte: since } }],
        },
      },
      {
        $group: {
          _id: { $toLower: { $trim: { input: '$type' } } },
          type: { $first: '$type' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { orderCount: -1 } },
    ]);

    const configs = await this.productConfigModel.find({}, { fullName: 1 }).lean();
    const known = new Set(configs.map((c) => c.fullName.trim().toLowerCase()));
    return groups
      .filter((g) => g._id && !known.has(g._id))
      .map((g) => ({ type: g.type, orderCount: g.orderCount }));
  }

  /**
   * Resolve a human-readable Vietnamese label (e.g. "Cotton Jersey",
   * "Polyester Jersey:", "Có Tool") to its workshop_config `code`. Tolerates
   * trailing punctuation and case differences so import data copied from
   * spreadsheets doesn't have to be sanitized first.
   */
  private async resolveWorkshopCode(
    category: WorkshopConfigCategory,
    label?: string,
  ): Promise<string | undefined> {
    if (!label) return undefined;
    const cleaned = label.replace(/[\s:.,;]+$/, '').trim();
    if (!cleaned) return undefined;
    // Case-insensitive exact match on `name`.
    const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = await this.workshopConfigRepository.findOne({
      category,
      name: { $regex: '^' + escaped + '$', $options: 'i' },
    });
    return found?.code;
  }

  /**
   * Resolve machine number ("94", "27", "K1"…) to a workshop_config code in the
   * `machine` category. Auto-creates the entry so the dropdown at
   * /workshop-config (tab Loại máy) lists every machine the workshop has
   * actually used. Returning `undefined` only when the label is empty — caller
   * treats that as "product has no tool".
   */
  private async resolveOrCreateMachine(label?: string): Promise<string | undefined> {
    if (!label) return undefined;
    const cleaned = label.replace(/[\s:.,;]+$/, '').trim();
    if (!cleaned) return undefined;

    const existing = await this.resolveWorkshopCode(WorkshopConfigCategory.Machine, cleaned);
    if (existing) return existing;

    const slugCode = `machine-${slugify(cleaned) || 'x'}`;
    const codeOwner = await this.workshopConfigRepository.findOne({
      category: WorkshopConfigCategory.Machine,
      code: slugCode,
    });
    if (codeOwner) return codeOwner.code;

    const lastOrder = await this.workshopConfigRepository.findAll(
      { category: WorkshopConfigCategory.Machine },
      { sort: { order: -1 }, paging: { limit: 1, skip: 0 } },
    );
    const nextOrder = (lastOrder[0]?.order ?? -1) + 1;

    const created = await this.workshopConfigRepository.create({
      category: WorkshopConfigCategory.Machine,
      code: slugCode,
      name: cleaned,
      color: '#6B7280',
      order: nextOrder,
      isActive: true,
    });
    return created.code;
  }

  /**
   * Resolve fabric label to workshop_config code. If not found, create a new
   * fabric_type entry so subsequent imports / dropdowns pick it up automatically.
   * Returning `undefined` only when the label itself is empty.
   */
  private async resolveOrCreateFabric(label?: string): Promise<string | undefined> {
    if (!label) return undefined;
    const cleaned = label.replace(/[\s:.,;]+$/, '').trim();
    if (!cleaned) return undefined;

    const existing = await this.resolveWorkshopCode(WorkshopConfigCategory.FabricType, cleaned);
    if (existing) return existing;

    const slugCode = slugify(cleaned) || 'fabric';
    // Code is unique per (category, code); reuse if another row already owns it.
    const codeOwner = await this.workshopConfigRepository.findOne({
      category: WorkshopConfigCategory.FabricType,
      code: slugCode,
    });
    if (codeOwner) return codeOwner.code;

    const lastOrder = await this.workshopConfigRepository.findAll(
      { category: WorkshopConfigCategory.FabricType },
      { sort: { order: -1 }, paging: { limit: 1, skip: 0 } },
    );
    const nextOrder = (lastOrder[0]?.order ?? -1) + 1;

    const created = await this.workshopConfigRepository.create({
      category: WorkshopConfigCategory.FabricType,
      code: slugCode,
      name: cleaned,
      icon: 'Shirt',
      order: nextOrder,
      isActive: true,
    });
    return created.code;
  }

  async getProductConfigs(dto: GetProductConfigsDto): Promise<GetProductConfigsResDto> {
    const { page, limit, sort, order, search, factoryId, machineTypeId, status } = dto;
    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { shortName: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }
    if (factoryId) filter.factoryId = factoryId;
    if (machineTypeId) filter.machineTypeId = machineTypeId;
    // Không truyền status ⇒ mặc định loại Hidden (vẫn thấy Active + Inactive + doc cũ chưa có field này).
    filter.status = status ? status : { $ne: ProductConfigStatus.Hidden };

    const { data, total } = await this.productConfigRepository.findAllAndCount(filter, {
      paging: { skip: limit * (page - 1), limit },
      sort: { [sort || 'createdAt']: order === 'asc' ? 1 : -1 },
      populate: [
        { path: 'factory', select: ['name', 'shortName'] },
        { path: 'machineType', select: ['name', 'shortName'] },
        { path: 'productCategory', select: ['name', 'shortName'] },
      ],
    });

    return { success: true, data, total };
  }

  async getProductConfig(id: string) {
    const p = await this.productConfigRepository.findOne(
      { _id: id },
      {
        populate: [
          { path: 'factory', select: ['name', 'shortName'] },
          { path: 'machineType', select: ['name', 'shortName'] },
          { path: 'productCategory', select: ['name', 'shortName'] },
        ],
      },
    );
    if (!p) throw new NotFoundException('ProductConfig not found');
    return p;
  }

  private static readonly UPLOAD_ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
  private static readonly UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

  private static readonly UPLOAD_FOLDERS = ['mockup', 'size-chart'] as const;
  private static readonly UPLOAD_FILENAME_PATTERN = /^[A-Za-z0-9_-]+\.(jpe?g|png|webp)$/i;

  /**
   * Upload mockup/bảng size — lưu LOCAL DISK (`src/assets/uploads/products/{type}`),
   * KHÔNG qua S3/Backblaze (khác `UploadService` ở module `upload/`) để tránh phụ
   * thuộc credentials cloud chưa cấu hình. Trả URL tuyệt đối dựng từ `origin`
   * (protocol+host của request), TRỎ SANG endpoint `serveProductImage()` bên dưới
   * — KHÔNG dùng `ServeStaticModule` sẵn có, vì loader Fastify của
   * `@nestjs/serve-static` (`FastifyLoader.register()`) đăng ký `@fastify/static`
   * với `wildcard: false` ⇒ chỉ auto-serve các file ĐÃ TỒN TẠI lúc server boot
   * (quét thư mục 1 lần khi khởi động), file tạo ra lúc runtime (upload) sẽ
   * KHÔNG có route và rơi vào SPA fallback (`index.html` rỗng — 200 OK nhưng
   * Content-Length 0) — đây là nguyên nhân ảnh upload xong không hiển thị được.
   */
  async uploadProductImage(type: 'mockup' | 'size-chart', file: IFile, origin: string): Promise<string> {
    if (!file) throw new BadRequestException('Thiếu file');
    if (!ProductConfigService.UPLOAD_ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException('Chỉ chấp nhận ảnh JPG/PNG/WEBP');
    }
    if (file.size > ProductConfigService.UPLOAD_MAX_BYTES) {
      throw new BadRequestException('Ảnh vượt quá 8MB');
    }

    const folder = type === 'mockup' ? 'mockup' : 'size-chart';
    const ext = file.mimetype.split('/')[1];
    const filename = `${myNanoid()}.${ext}`;
    const dir = path.resolve('./src/assets/uploads/products', folder);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, filename), file.buffer);

    return `${origin}/api/v1/product-configs/uploaded-image/${folder}/${filename}`;
  }

  /**
   * Resolve + validate `folder`/`filename` cho `serveProductImage()` — chặn
   * path traversal (chỉ whitelist 2 folder cố định + regex filename khớp đúng
   * format `myNanoid().ext` mà `uploadProductImage()` tự sinh).
   */
  resolveProductImagePath(folder: string, filename: string): { filePath: string; mimetype: string } {
    if (
      !(ProductConfigService.UPLOAD_FOLDERS as readonly string[]).includes(folder) ||
      !ProductConfigService.UPLOAD_FILENAME_PATTERN.test(filename)
    ) {
      throw new NotFoundException('Image not found');
    }
    const filePath = path.resolve('./src/assets/uploads/products', folder, filename);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Image not found');

    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimetype = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return { filePath, mimetype };
  }

  async createProductConfig(dto: CreateProductConfigDto) {
    const factory = await this.factoryService.getFactory(dto.factoryId);
    if (!factory) throw new BadRequestException('Invalid factoryId');
    if (dto.productCategoryId) await this.productCategoryService.getProductCategory(dto.productCategoryId);
    for (const collectionId of dto.collectionIds || []) await this.collectionService.getCollection(collectionId);

    try {
      return await this.productConfigRepository.create({
        ...dto,
        shortName: dto.shortName.toUpperCase(),
        ...(dto.sku ? { sku: dto.sku.trim().toUpperCase() } : {}),
      });
    } catch (err) {
      if (isDuplicateVariationSkuError(err)) {
        throw new BadRequestException('SKU biến thể đã tồn tại ở sản phẩm khác');
      }
      if (isDuplicateProductSkuError(err)) {
        throw new BadRequestException('SKU sản phẩm đã tồn tại ở sản phẩm khác');
      }
      throw err;
    }
  }

  async updateProductConfig(id: string, dto: UpdateProductConfigDto) {
    // Validate ref khi client đổi Xưởng / Phòng / Danh mục (throw 404 nếu id không tồn tại).
    if (dto.factoryId) await this.factoryService.getFactory(dto.factoryId);
    if (dto.machineTypeId) await this.machineTypeService.getMachineType(dto.machineTypeId);
    if (dto.productCategoryId) await this.productCategoryService.getProductCategory(dto.productCategoryId);
    for (const collectionId of dto.collectionIds || []) await this.collectionService.getCollection(collectionId);

    try {
      const p = await this.productConfigRepository.findOneAndUpdate(
        { _id: id },
        {
          ...dto,
          ...(dto.shortName ? { shortName: dto.shortName.toUpperCase() } : {}),
          ...(dto.sku ? { sku: dto.sku.trim().toUpperCase() } : {}),
        },
      );
      if (!p) throw new NotFoundException('ProductConfig not found');
      return p;
    } catch (err) {
      if (isDuplicateVariationSkuError(err)) {
        throw new BadRequestException('SKU biến thể đã tồn tại ở sản phẩm khác');
      }
      if (isDuplicateProductSkuError(err)) {
        throw new BadRequestException('SKU sản phẩm đã tồn tại ở sản phẩm khác');
      }
      throw err;
    }
  }

  async deleteProductConfig(id: string) {
    return this.productConfigRepository.softDelete({ _id: id });
  }

  async clearAll(): Promise<{ removed: number }> {
    const result = await this.productConfigModel.deleteMany({});
    return { removed: result.deletedCount ?? 0 };
  }

  async importProductConfigs(dto: ImportProductConfigDto): Promise<ImportProductConfigResDto> {
    const skipped: Array<{ row: number; reason: string }> = [];
    let imported = 0;
    let updated = 0;

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i];

      const factory = await this.factoryService.findByLabel(row.factoryLabel);
      if (!factory) {
        skipped.push({ row: i + 1, reason: `Xưởng '${row.factoryLabel}' không khớp danh sách xưởng` });
        continue;
      }

      const machineType = await this.machineTypeService.findByLabel(row.departmentLabel);
      if (!machineType) {
        skipped.push({
          row: i + 1,
          reason: `Phòng '${row.departmentLabel}' không khớp danh sách Loại máy in (MachineType)`,
        });
        continue;
      }

      // Fabrics auto-register on first sighting so the workshop dropdown picks
      // up new labels without the admin having to add them manually beforehand.
      const fabricCode = await this.resolveOrCreateFabric(row.fabricLabel);

      // Machine number auto-registers in workshop_config.machine so the catalog
      // (workshop-config tab "Loại máy") stays in sync with what got imported.
      const machineNumber = await this.resolveOrCreateMachine(row.machineNumber);
      const toolLabel = row.toolResultLabel?.trim();
      let toolCode: string | undefined;
      if (!machineNumber) {
        // Empty machine number means the product has no tool.
        toolCode = TOOL_RESULT_NONE;
      } else if (!toolLabel) {
        // Filled machine number with empty tool result column → has tool.
        toolCode = TOOL_RESULT_HAS;
      } else {
        toolCode = await this.resolveWorkshopCode(WorkshopConfigCategory.ToolResult, toolLabel);
        if (!toolCode) {
          skipped.push({
            row: i + 1,
            reason: `Kết quả Tool "${toolLabel}" không khớp workshop_config — bỏ qua field này`,
          });
        }
      }

      const data = {
        fullName: row.fullName.trim(),
        shortName: row.shortName.trim().toUpperCase(),
        machineNumber,
        machineTypeId: machineType._id,
        factoryId: factory._id,
        ...(fabricCode ? { fabricType: fabricCode } : {}),
        ...(toolCode ? { toolResult: toolCode } : {}),
      };

      const existing = await this.productConfigRepository.findOne({ fullName: data.fullName });
      if (existing) {
        await this.productConfigRepository.findOneAndUpdate({ _id: existing._id }, data);
        updated++;
      } else {
        await this.productConfigRepository.create(data);
        imported++;
      }
    }

    return { success: true, data: { imported, updated, skipped } };
  }

  /**
   * Crawl ảnh mockup từ onospod.com cho các sản phẩm CHƯA có mockup — xử lý
   * theo lô `limit` sản phẩm/call, cursor `_id` tăng đơn điệu để sản phẩm đã
   * thử-nhưng-không-khớp không bị quét lại (FE gọi lặp đến khi `done=true`).
   * Chỉ gán khi có kết quả TRÙNG TÊN CHÍNH XÁC (normalize hoa/thường +
   * khoảng trắng); không trùng / request lỗi → bỏ qua sản phẩm đó.
   */
  /** Lấy nonce `security_search` từ input `security-search` trên trang chủ onospod — cache 1 giờ. */
  private async getOnospodSearchNonce(force = false): Promise<string> {
    if (!force && cachedSearchNonce && Date.now() - cachedSearchNonce.fetchedAt < NONCE_TTL_MS) {
      return cachedSearchNonce.value;
    }
    const res = await axios.get<string>(ONOSPOD_ORIGIN, {
      headers: { 'user-agent': CRAWL_UA, accept: 'text/html' },
      timeout: 15_000,
      responseType: 'text',
    });
    const nonce = res.data.match(/name="security-search"\s+value="([^"]+)"/)?.[1];
    if (!nonce) throw new Error('Không lấy được security_search nonce từ trang chủ onospod');
    cachedSearchNonce = { value: nonce, fetchedAt: Date.now() };
    return nonce;
  }

  /**
   * 1 lần search onospod theo term qua AJAX endpoint (JSON, nhanh hơn hẳn
   * parse HTML). Nonce bị từ chối (response `-1`/`0`) → refresh nonce 1 lần
   * rồi retry. Loại item "No results" (`id:-1`) và item thiếu img.
   */
  private async searchOnospod(term: string): Promise<Array<{ title: string; imageUrl: string }>> {
    const post = async (nonce: string) => {
      const body = new URLSearchParams({
        action: 'onospod_ajax_search_products',
        query: term,
        security_search: nonce,
        product_cat: '',
      });
      return axios.post<OnospodAjaxItem[] | number | string>(ONOSPOD_AJAX_URL, body.toString(), {
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'user-agent': CRAWL_UA,
          'x-requested-with': 'XMLHttpRequest',
          origin: ONOSPOD_ORIGIN,
          referer: `${ONOSPOD_ORIGIN}/`,
        },
        timeout: 15_000,
      });
    };

    let res = await post(await this.getOnospodSearchNonce());
    if (!Array.isArray(res.data)) {
      res = await post(await this.getOnospodSearchNonce(true));
    }
    if (!Array.isArray(res.data)) return [];
    return res.data
      .filter((item) => item.id > 0 && item.value && item.img)
      .map((item) => ({ title: item.value, imageUrl: item.img as string }));
  }

  async crawlMockups(limit: number, cursor?: string) {
    const missingFilter = {
      deletedAt: { $exists: false },
      $or: [{ mockup: { $exists: false } }, { mockup: null }, { mockup: '' }],
    };

    const batch = await this.productConfigModel
      .find({ ...missingFilter, ...(cursor ? { _id: { $gt: cursor } } : {}) }, { fullName: 1, mockup: 1 })
      .sort({ _id: 1 })
      .limit(limit)
      .lean();

    let updated = 0;
    const results: CrawlMockupResultItem[] = [];
    for (const item of batch) {
      const id = String(item._id);
      const name = item.fullName?.trim();
      if (!name) {
        results.push({ productConfigId: id, fullName: '', status: 'error', note: 'Tên sản phẩm trống' });
        continue;
      }
      try {
        let match: { title: string; imageUrl: string } | undefined;
        let matchNote: string | undefined;
        let foundTitles: string[] = [];
        for (const attempt of buildNameAttempts(name)) {
          const found = await this.searchOnospod(attempt.term);
          if (found.length > 0 && foundTitles.length === 0) foundTitles = found.map((r) => r.title);
          match = found.find(
            (r) => r.imageUrl && normalizeProductName(r.title) === normalizeProductName(attempt.term),
          );
          if (match) {
            matchNote = attempt.note;
            break;
          }
          // Fallback cùng attempt: cùng bộ từ nhưng đảo thứ tự ("Set X" vs "X Set").
          match = found.find(
            (r) => r.imageUrl && normalizeSortedWords(r.title) === normalizeSortedWords(attempt.term),
          );
          if (match) {
            matchNote = [attempt.note, 'khớp đảo thứ tự từ'].filter(Boolean).join(' + ');
            break;
          }
          await sleep(100);
        }

        if (match) {
          await this.productConfigRepository.findOneAndUpdate({ _id: item._id }, { mockup: match.imageUrl });
          updated++;
          results.push({
            productConfigId: id,
            fullName: name,
            status: item.mockup ? 'updated' : 'created',
            imageUrl: match.imageUrl,
            matchedTitle: match.title,
            note: matchNote,
          });
        } else if (foundTitles.length === 0) {
          results.push({
            productConfigId: id,
            fullName: name,
            status: 'no-results',
            note: 'Search không trả kết quả nào trên onospod',
          });
        } else {
          results.push({
            productConfigId: id,
            fullName: name,
            status: 'no-match',
            foundTitles: foundTitles.slice(0, 3),
            note: 'Có kết quả nhưng không cái nào trùng tên chính xác',
          });
        }
      } catch (err) {
        // Request lỗi/timeout → ghi nhận chi tiết, cursor vẫn tiến nên không retry vô hạn.
        results.push({
          productConfigId: id,
          fullName: name,
          status: 'error',
          note: err instanceof Error ? err.message : 'Request lỗi',
        });
      }
      await sleep(150);
    }

    const lastId = batch.length > 0 ? String(batch[batch.length - 1]._id) : cursor;
    const remaining =
      batch.length < limit
        ? 0
        : await this.productConfigModel.countDocuments({ ...missingFilter, _id: { $gt: lastId } });

    return {
      processed: batch.length,
      updated,
      remaining,
      nextCursor: remaining > 0 ? lastId : undefined,
      done: remaining === 0,
      results,
    };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { IFile } from 'core';
import fs from 'fs';
import { Model } from 'mongoose';
import path from 'path';
import type {
  CreateProductConfigDto,
  GetProductConfigsDto,
  GetProductConfigsResDto,
  ImportProductConfigDto,
  ImportProductConfigResDto,
  UpdateProductConfigDto,
} from 'shared';
import { myNanoid, ProductConfigStatus, WorkshopConfigCategory } from 'shared';

import { FactoryService } from '../factory/factory.service';
import { MachineTypeService } from '../machine-type/machine-type.service';
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
    private readonly workshopConfigRepository: WorkshopConfigRepository,
    @InjectModel(ProductConfigEntity.name)
    private readonly productConfigModel: Model<ProductConfigEntity>,
  ) {}

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
}

import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CreateProductConfigDto,
  GetProductConfigsDto,
  GetProductConfigsResDto,
  ImportProductConfigDto,
  ImportProductConfigResDto,
  ProductPrintArea,
  ProductVariation,
  UpdateProductConfigDto,
} from 'shared';
import { WorkshopConfigCategory } from 'shared';

import { CollectionService } from '../collection/collection.service';
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

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

@Injectable()
export class ProductConfigService implements OnModuleInit {
  constructor(
    private readonly productConfigRepository: ProductConfigRepository,
    private readonly factoryService: FactoryService,
    private readonly machineTypeService: MachineTypeService,
    private readonly productCategoryService: ProductCategoryService,
    private readonly collectionService: CollectionService,
    private readonly workshopConfigRepository: WorkshopConfigRepository,
    @InjectModel(ProductConfigEntity.name)
    private readonly productConfigModel: Model<ProductConfigEntity>,
  ) {}

  /**
   * Migration one-shot (idempotent): variations legacy lưu `color`/`size` rời →
   * chuẩn hóa sang model options tự định nghĩa (`optionNames` ['Color','Size'] +
   * `variations[].options` [color, size]). Chỉ đụng doc còn variation thiếu
   * `options`; giữ nguyên `color`/`size` cũ (deprecated, không đọc nữa).
   */
  async onModuleInit() {
    const res = await this.productConfigModel.updateMany(
      { variations: { $elemMatch: { options: { $exists: false } } } },
      [
        {
          $set: {
            optionNames: { $ifNull: ['$optionNames', ['Color', 'Size']] },
            variations: {
              $map: {
                input: '$variations',
                as: 'v',
                in: {
                  $mergeObjects: [
                    '$$v',
                    { options: { $ifNull: ['$$v.options', [{ $ifNull: ['$$v.color', 'As Design'] }, { $ifNull: ['$$v.size', 'One Size'] }]] } },
                  ],
                },
              },
            },
          },
        },
      ],
    );
    if (res.modifiedCount) {
      console.log(`[product-config-backfill] variations.options migrated on ${res.modifiedCount} products`);
    }
  }

  /** Validate collectionIds tồn tại (throw 404 nếu id sai). */
  private async assertCollectionsValid(collectionIds?: string[]) {
    if (!collectionIds?.length) return;
    for (const id of collectionIds) await this.collectionService.getCollection(id);
  }

  /**
   * Validate cấu trúc options/variants/printAreas:
   * - optionNames không trùng (case-insensitive).
   * - variant.options đúng độ dài optionNames, tổ hợp không trùng, SKU không trùng trong doc.
   * - printAreas không trùng key.
   */
  private assertProductStructureValid(dto: {
    optionNames?: string[];
    variations?: ProductVariation[];
    printAreas?: ProductPrintArea[];
  }) {
    const { optionNames, variations, printAreas } = dto;

    if (optionNames) {
      const seen = new Set<string>();
      for (const n of optionNames) {
        const k = n.trim().toLowerCase();
        if (seen.has(k)) throw new BadRequestException(`Tên nhóm option trùng nhau: "${n}"`);
        seen.add(k);
      }
    }

    if (variations?.length) {
      const skuSeen = new Set<string>();
      const comboSeen = new Set<string>();
      for (const v of variations) {
        const sku = v.sku.toUpperCase();
        if (skuSeen.has(sku)) throw new BadRequestException(`SKU biến thể trùng trong sản phẩm: ${sku}`);
        skuSeen.add(sku);

        if (optionNames?.length) {
          if (!v.options || v.options.length !== optionNames.length) {
            throw new BadRequestException(
              `Biến thể ${sku}: options phải có đúng ${optionNames.length} giá trị theo thứ tự ${optionNames.join(' / ')}`,
            );
          }
          const combo = v.options.map((o) => o.trim().toLowerCase()).join('|');
          if (comboSeen.has(combo)) {
            throw new BadRequestException(`Tổ hợp option trùng nhau: ${v.options.join(' / ')}`);
          }
          comboSeen.add(combo);
        }
      }
    }

    if (printAreas?.length) {
      const keySeen = new Set<string>();
      for (const a of printAreas) {
        if (keySeen.has(a.key)) throw new BadRequestException(`Vị trí in trùng key: ${a.key}`);
        keySeen.add(a.key);
      }
    }
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
    const { page, limit, sort, order, search, factoryId, machineTypeId } = dto;
    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { shortName: { $regex: search, $options: 'i' } },
      ];
    }
    if (factoryId) filter.factoryId = factoryId;
    if (machineTypeId) filter.machineTypeId = machineTypeId;

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

  async getProductConfigById(id: string) {
    const p = await this.productConfigRepository.findOneById(id);
    if (!p) throw new NotFoundException('ProductConfig not found');
    return p;
  }

  async createProductConfig(dto: CreateProductConfigDto) {
    const factory = await this.factoryService.getFactory(dto.factoryId);
    if (!factory) throw new BadRequestException('Invalid factoryId');
    if (dto.productCategoryId) await this.productCategoryService.getProductCategory(dto.productCategoryId);
    await this.assertCollectionsValid(dto.collectionIds);
    this.assertProductStructureValid(dto);

    try {
      return await this.productConfigRepository.create({ ...dto, shortName: dto.shortName.toUpperCase() });
    } catch (err) {
      if (isDuplicateVariationSkuError(err)) {
        throw new BadRequestException('SKU biến thể đã tồn tại ở sản phẩm khác');
      }
      throw err;
    }
  }

  async updateProductConfig(id: string, dto: UpdateProductConfigDto) {
    // Validate ref khi client đổi Xưởng / Phòng / Danh mục (throw 404 nếu id không tồn tại).
    if (dto.factoryId) await this.factoryService.getFactory(dto.factoryId);
    if (dto.machineTypeId) await this.machineTypeService.getMachineType(dto.machineTypeId);
    if (dto.productCategoryId) await this.productCategoryService.getProductCategory(dto.productCategoryId);
    await this.assertCollectionsValid(dto.collectionIds);

    // Partial update: nếu chỉ gửi variations mà không gửi optionNames → validate
    // theo optionNames đang lưu trong DB.
    let effectiveOptionNames = dto.optionNames;
    if (effectiveOptionNames === undefined && dto.variations) {
      const existing = await this.productConfigRepository.findOneById(id);
      if (!existing) throw new NotFoundException('ProductConfig not found');
      effectiveOptionNames = existing.optionNames;
    }
    this.assertProductStructureValid({
      optionNames: effectiveOptionNames,
      variations: dto.variations,
      printAreas: dto.printAreas,
    });

    try {
      const p = await this.productConfigRepository.findOneAndUpdate(
        { _id: id },
        { ...dto, ...(dto.shortName ? { shortName: dto.shortName.toUpperCase() } : {}) },
      );
      if (!p) throw new NotFoundException('ProductConfig not found');
      return p;
    } catch (err) {
      if (isDuplicateVariationSkuError(err)) {
        throw new BadRequestException('SKU biến thể đã tồn tại ở sản phẩm khác');
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

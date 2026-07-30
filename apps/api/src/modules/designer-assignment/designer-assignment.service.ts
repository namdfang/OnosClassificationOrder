import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DESIGNER_ASSIGNMENT_CONFIG_KEY,
  DesignerAssignmentConfig,
  RememberProductAssignmentDto,
  SaveDesignerAssignmentConfigDto,
} from 'shared';

import { SystemConfigService } from '../system-config/system-config.service';

const EMPTY_CONFIG: DesignerAssignmentConfig = { customers: [], products: [], factories: [] };

@Injectable()
export class DesignerAssignmentService {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  async getConfig(): Promise<DesignerAssignmentConfig> {
    const cfg = await this.systemConfigService.get<DesignerAssignmentConfig>(
      DESIGNER_ASSIGNMENT_CONFIG_KEY,
      EMPTY_CONFIG,
    );
    return this.pruneExpiredProducts(cfg ?? EMPTY_CONFIG);
  }

  /**
   * Lazy expiry mức Ưu tiên 2: bỏ sản phẩm đã quá hạn `productExpiries` khỏi
   * `products` (card tự "nhảy về Chưa gán" trong kanban, engine không dùng nữa) —
   * KHÔNG ghi lại DB, config được dọn bền vững ở lần save kế tiếp. Không mutate
   * object gốc (có thể là tham chiếu từ cache của SystemConfigService).
   */
  private pruneExpiredProducts(cfg: DesignerAssignmentConfig): DesignerAssignmentConfig {
    const expiries = cfg.productExpiries || {};
    if (Object.keys(expiries).length === 0) return cfg;
    const now = Date.now();
    const isExpired = (pid: string) => {
      const ts = expiries[pid] ? Date.parse(expiries[pid]) : NaN;
      return Number.isFinite(ts) && ts <= now;
    };
    const products = (cfg.products || [])
      .map((p) => ({ ...p, productConfigIds: p.productConfigIds.filter((pid) => !isExpired(String(pid))) }))
      .filter((p) => p.productConfigIds.length > 0);
    const productExpiries = Object.fromEntries(Object.entries(expiries).filter(([pid]) => !isExpired(pid)));
    return { ...cfg, products, productExpiries };
  }

  /**
   * Lưu cấu hình. Bất biến:
   * - **1 designer chỉ thuộc 1 xưởng** (mức 3) — designerId ở ≥ 2 xưởng → BadRequest.
   * - **1 khách / 1 sản phẩm chỉ thuộc 1 designer** (mức 1/2) — id xuất hiện ở
   *   ≥ 2 designer → BadRequest (kanban FE vốn không cho, guard chống payload tay).
   * Trọng số tự do, không kiểm tra tổng = 100.
   */
  async saveConfig(dto: SaveDesignerAssignmentConfigDto): Promise<DesignerAssignmentConfig> {
    const seenCustomers = new Set<string>();
    for (const c of dto.customers || []) {
      for (const raw of c.customerIds) {
        const id = String(raw);
        if (seenCustomers.has(id)) {
          throw new BadRequestException('Khách hàng đã được gán cho designer khác — mỗi khách chỉ thuộc một designer.');
        }
        seenCustomers.add(id);
      }
    }
    const seenProducts = new Set<string>();
    for (const p of dto.products || []) {
      for (const raw of p.productConfigIds) {
        const id = String(raw);
        if (seenProducts.has(id)) {
          throw new BadRequestException('Sản phẩm đã được gán cho designer khác — mỗi sản phẩm chỉ thuộc một designer.');
        }
        seenProducts.add(id);
      }
    }

    const seen = new Set<string>();
    for (const f of dto.factories) {
      // Loại designer trùng trong CÙNG 1 xưởng (giữ entry đầu).
      const localSeen = new Set<string>();
      for (const d of f.designers) {
        const id = String(d.designerId);
        if (localSeen.has(id)) {
          throw new BadRequestException(
            `Designer bị lặp trong cùng một xưởng — mỗi designer chỉ khai báo một lần.`,
          );
        }
        localSeen.add(id);
        if (seen.has(id)) {
          throw new BadRequestException(
            `Designer đã được cấu hình ở một xưởng khác — mỗi designer chỉ thuộc một xưởng.`,
          );
        }
        seen.add(id);
      }
    }

    // Chỉ giữ hạn của sản phẩm còn trong cấu hình và chưa quá hạn — save là
    // điểm dọn bền vững cho lazy expiry.
    const keptProducts = (dto.products || []).filter((p) => p.productConfigIds.length > 0);
    const keptIds = new Set(keptProducts.flatMap((p) => p.productConfigIds.map(String)));
    const now = Date.now();
    const productExpiries = Object.fromEntries(
      Object.entries(dto.productExpiries || {}).filter(([pid, iso]) => {
        const ts = Date.parse(iso);
        return keptIds.has(pid) && Number.isFinite(ts) && ts > now;
      }),
    );

    const value: DesignerAssignmentConfig = {
      customers: (dto.customers || []).filter((c) => c.customerIds.length > 0),
      products: keptProducts,
      factories: dto.factories,
      productExpiries,
      updatedAt: new Date().toISOString(),
    };
    await this.systemConfigService.set(
      DESIGNER_ASSIGNMENT_CONFIG_KEY,
      value,
      'Cấu hình auto-gán designer (khách hàng / sản phẩm / xưởng)',
    );
    return value;
  }

  /**
   * "Ghi nhớ cấu hình" từ bảng "Cần gán designer": chuyển các sản phẩm về 1
   * designer ở mức Ưu tiên 2 (ghi đè chủ cũ nếu có — FE đã cảnh báo), kèm hạn
   * hiệu lực (`expiresAt` trống = vĩnh viễn). Đọc-sửa-ghi trọn config để giữ
   * nguyên mức 1/3.
   */
  async rememberProducts(dto: RememberProductAssignmentDto): Promise<DesignerAssignmentConfig> {
    const designerId = String(dto.designerId);
    const pids = Array.from(new Set(dto.productConfigIds.map(String)));
    let expiresAt: string | undefined;
    if (dto.expiresAt) {
      const ts = Date.parse(dto.expiresAt);
      if (!Number.isFinite(ts) || ts <= Date.now()) {
        throw new BadRequestException('Thời hạn ghi nhớ không hợp lệ — phải là thời điểm trong tương lai.');
      }
      expiresAt = new Date(ts).toISOString();
    }

    const cfg = await this.getConfig();
    const pidSet = new Set(pids);
    // Gỡ khỏi mọi designer đang giữ (bất biến 1 sản phẩm 1 designer) rồi dồn về
    // designer đích.
    const products = (cfg.products || [])
      .map((p) => ({ ...p, productConfigIds: p.productConfigIds.filter((pid) => !pidSet.has(String(pid))) }))
      .filter((p) => p.productConfigIds.length > 0);
    const target = products.find((p) => String(p.designerId) === designerId);
    if (target) target.productConfigIds = [...target.productConfigIds, ...pids];
    else products.push({ designerId, productConfigIds: pids });

    const productExpiries = { ...(cfg.productExpiries || {}) };
    for (const pid of pids) {
      if (expiresAt) productExpiries[pid] = expiresAt;
      else delete productExpiries[pid];
    }

    const value: DesignerAssignmentConfig = {
      ...cfg,
      products,
      productExpiries,
      updatedAt: new Date().toISOString(),
    };
    await this.systemConfigService.set(
      DESIGNER_ASSIGNMENT_CONFIG_KEY,
      value,
      'Cấu hình auto-gán designer (khách hàng / sản phẩm / xưởng)',
    );
    return value;
  }
}

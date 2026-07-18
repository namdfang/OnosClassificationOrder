import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CUSTOMER_ASSIGNMENT_CONFIG_KEY,
  CustomerAssignmentConfig,
  customerMatchKey,
  SaveCustomerAssignmentConfigDto,
} from 'shared';

import { CustomerRepository } from '../customer/customer.repository';
import { SystemConfigService } from '../system-config/system-config.service';

const EMPTY_CONFIG: CustomerAssignmentConfig = { enabled: false, factories: [] };

@Injectable()
export class CustomerAssignmentService {
  constructor(
    private readonly systemConfigService: SystemConfigService,
    private readonly customerRepository: CustomerRepository,
  ) {}

  async getConfig(): Promise<CustomerAssignmentConfig> {
    const cfg = await this.systemConfigService.get<CustomerAssignmentConfig>(
      CUSTOMER_ASSIGNMENT_CONFIG_KEY,
      EMPTY_CONFIG,
    );
    return cfg ?? EMPTY_CONFIG;
  }

  /**
   * Lưu cấu hình. Bất biến **1 khách chỉ thuộc 1 xưởng** — nếu 1 customerId xuất
   * hiện ở ≥ 2 xưởng (hoặc lặp trong cùng xưởng) thì từ chối (BadRequest).
   */
  async saveConfig(dto: SaveCustomerAssignmentConfigDto): Promise<CustomerAssignmentConfig> {
    const seen = new Set<string>();
    for (const f of dto.factories) {
      const localSeen = new Set<string>();
      for (const id of f.customerIds) {
        const cid = String(id);
        if (localSeen.has(cid)) {
          throw new BadRequestException('Khách hàng bị lặp trong cùng một xưởng — mỗi khách chỉ khai báo một lần.');
        }
        localSeen.add(cid);
        if (seen.has(cid)) {
          throw new BadRequestException(
            'Khách hàng đã được cấu hình ở một xưởng khác — mỗi khách chỉ thuộc một xưởng.',
          );
        }
        seen.add(cid);
      }
    }

    const value: CustomerAssignmentConfig = {
      enabled: dto.enabled,
      factories: dto.factories.filter((f) => f.customerIds.length > 0),
      updatedAt: new Date().toISOString(),
    };
    await this.systemConfigService.set(
      CUSTOMER_ASSIGNMENT_CONFIG_KEY,
      value,
      'Cấu hình ưu tiên gán xưởng theo khách hàng',
    );
    return value;
  }

  /**
   * Dựng map dùng cho `importOrders`: khóa `customerMatchKey(userSku, userEmail)`
   * → `factoryId` ép. Trả `enabled=false` (map rỗng) khi config tắt → import giữ
   * nguyên luồng product config.
   */
  async getImportOverride(): Promise<{ enabled: boolean; map: Map<string, string> }> {
    const cfg = await this.getConfig();
    const map = new Map<string, string>();
    if (!cfg.enabled || cfg.factories.length === 0) {
      return { enabled: false, map };
    }
    const idToFactory = new Map<string, string>();
    for (const f of cfg.factories) {
      for (const cid of f.customerIds) idToFactory.set(String(cid), String(f.factoryId));
    }
    if (idToFactory.size === 0) return { enabled: false, map };

    const customers = await this.customerRepository.findAll({
      _id: { $in: Array.from(idToFactory.keys()) },
    });
    for (const c of customers) {
      const factoryId = idToFactory.get(String(c._id));
      if (factoryId) map.set(customerMatchKey(c.userSku, c.userEmail), factoryId);
    }
    return { enabled: map.size > 0, map };
  }
}

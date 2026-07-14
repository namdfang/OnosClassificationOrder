import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DESIGNER_ASSIGNMENT_CONFIG_KEY,
  DesignerAssignmentConfig,
  SaveDesignerAssignmentConfigDto,
} from 'shared';

import { SystemConfigService } from '../system-config/system-config.service';

const EMPTY_CONFIG: DesignerAssignmentConfig = { factories: [] };

@Injectable()
export class DesignerAssignmentService {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  async getConfig(): Promise<DesignerAssignmentConfig> {
    const cfg = await this.systemConfigService.get<DesignerAssignmentConfig>(
      DESIGNER_ASSIGNMENT_CONFIG_KEY,
      EMPTY_CONFIG,
    );
    return cfg ?? EMPTY_CONFIG;
  }

  /**
   * Lưu cấu hình. Bất biến **1 designer chỉ thuộc 1 xưởng** — nếu 1 designerId
   * xuất hiện ở ≥ 2 xưởng thì từ chối (BadRequest). Trọng số tự do, không kiểm
   * tra tổng = 100.
   */
  async saveConfig(dto: SaveDesignerAssignmentConfigDto): Promise<DesignerAssignmentConfig> {
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

    const value: DesignerAssignmentConfig = {
      factories: dto.factories,
      updatedAt: new Date().toISOString(),
    };
    await this.systemConfigService.set(
      DESIGNER_ASSIGNMENT_CONFIG_KEY,
      value,
      'Cấu hình auto-gán designer theo xưởng',
    );
    return value;
  }
}

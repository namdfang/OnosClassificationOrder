import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';

import { AgentApiLogEntity } from './agent-audit.entity';

type Row = Record<string, unknown>;

/**
 * Tầng truy cập dữ liệu DUY NHẤT của bộ API agent (`API-1`).
 *
 * Khác các repository khác của repo — vốn buộc vào một entity — repository này
 * phải đọc được 11 bảng trong danh sách trắng, nên nó nhận `entityName` rồi tự
 * tra model. Đổi lại, nó **chỉ phơi ra ba thao tác ĐỌC cộng một thao tác ghi
 * nhật ký**: không service nào của module chạm được `save`/`updateOne`/
 * `deleteOne`, nên BR-3 (chỉ đọc) được giữ bằng chính hình dạng của lớp này,
 * không phải bằng kỷ luật của người viết.
 *
 * Mọi lời gọi đều mang `maxTimeMS` và `readPreference: 'secondaryPreferred'`
 * — tải đọc của agent rơi vào secondary, không vào primary đang phục vụ sản
 * xuất (BR-6, AC-15).
 */
@Injectable()
export class AgentApiRepository {
  constructor(private readonly moduleRef: ModuleRef) {}

  private model(entityName: string): Model<unknown> {
    return this.moduleRef.get<Model<unknown>>(getModelToken(entityName), { strict: false });
  }

  async find(args: {
    entityName: string;
    filter: Record<string, unknown>;
    projection: Record<string, 1>;
    sort: Record<string, 1 | -1>;
    skip: number;
    limit: number;
    maxTimeMS: number;
  }): Promise<Row[]> {
    const rows = await this.model(args.entityName)
      .find(args.filter, args.projection)
      .sort(args.sort)
      .skip(args.skip)
      .limit(args.limit)
      .maxTimeMS(args.maxTimeMS)
      .lean()
      .read('secondaryPreferred')
      .exec();
    return rows as Row[];
  }

  async aggregate(args: {
    entityName: string;
    pipeline: PipelineStage[];
    maxTimeMS: number;
  }): Promise<Row[]> {
    const rows = await this.model(args.entityName)
      .aggregate(args.pipeline)
      .option({ maxTimeMS: args.maxTimeMS })
      .read('secondaryPreferred')
      .exec();
    return rows as Row[];
  }

  async insertLog(doc: Record<string, unknown>): Promise<void> {
    await this.model(AgentApiLogEntity.name).create(doc);
  }

  async ensureLogTtlIndex(expireAfterSeconds: number): Promise<void> {
    await this.model(AgentApiLogEntity.name).collection.createIndex({ at: 1 }, { expireAfterSeconds });
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { R2DesignObjectDocument } from './r2-design-object.entity';
import { R2DesignObjectEntity } from './r2-design-object.entity';

@Injectable()
export class R2DesignObjectRepository extends DatabaseRepositoryAbstract<
  R2DesignObjectEntity,
  R2DesignObjectDocument
> {
  constructor(
    @InjectModel(R2DesignObjectEntity.name)
    private readonly r2Model: Model<R2DesignObjectEntity>,
  ) {
    super(r2Model);
  }

  async upsertObject(input: {
    hash: string;
    sourceUrl: string;
    previewKey: string;
    thumbKey: string;
    sizeBytes: number;
  }): Promise<void> {
    await this.r2Model.updateOne(
      { hash: input.hash },
      {
        $setOnInsert: {
          hash: input.hash,
          sourceUrl: input.sourceUrl,
          createdAt: new Date(),
        },
        $set: {
          previewKey: input.previewKey,
          thumbKey: input.thumbKey,
          sizeBytes: input.sizeBytes,
        },
      },
      { upsert: true },
    );
  }

  async incrementRefCount(hash: string, by: number): Promise<void> {
    if (by === 0) return;
    await this.r2Model.updateOne({ hash }, { $inc: { refCount: by } });
  }

  async incrementSizeBytes(hash: string, by: number): Promise<void> {
    if (by === 0) return;
    await this.r2Model.updateOne({ hash }, { $inc: { sizeBytes: by } });
  }

  async getTotalStats(): Promise<{ objectCount: number; totalSizeBytes: number }> {
    const [agg] = await this.r2Model.aggregate<{ _id: null; count: number; sum: number }>([
      { $group: { _id: null, count: { $sum: 1 }, sum: { $sum: '$sizeBytes' } } },
    ]);
    return {
      objectCount: agg?.count ?? 0,
      totalSizeBytes: agg?.sum ?? 0,
    };
  }
}

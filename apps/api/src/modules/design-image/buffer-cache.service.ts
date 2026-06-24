import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Disk buffer cache cho raw bytes ảnh design.
 *
 * Mục đích: tránh download lại từ Drive khi worker preview cần buffer mà
 * worker thumb đã download trước đó. Cache theo hash deterministic của URL
 * → cùng URL = cùng file cache.
 *
 * Layout:
 *   {tmpdir}/onos-design-cache/{hash}.bin
 *
 * TTL: 7 ngày kể từ lần access cuối (mtime/utime). Cleanup chạy khi module
 * init + định kỳ mỗi 6h.
 */
@Injectable()
export class DesignBufferCache implements OnModuleInit {
  private readonly logger = new Logger(DesignBufferCache.name);
  private readonly dir = path.join(os.tmpdir(), 'onos-design-cache');
  private readonly ttlMs = 7 * 24 * 60 * 60 * 1000;

  async onModuleInit() {
    await fs.mkdir(this.dir, { recursive: true });
    void this.cleanup();
    setInterval(() => void this.cleanup(), 6 * 60 * 60 * 1000).unref();
  }

  private pathFor(hash: string): string {
    return path.join(this.dir, `${hash}.bin`);
  }

  async get(hash: string): Promise<Buffer | null> {
    try {
      const filePath = this.pathFor(hash);
      const buf = await fs.readFile(filePath);
      // Bump atime/mtime để LRU-style không bị cleanup xoá.
      const now = new Date();
      await fs.utimes(filePath, now, now).catch(() => undefined);
      return buf;
    } catch {
      return null;
    }
  }

  async put(hash: string, buf: Buffer): Promise<void> {
    try {
      await fs.writeFile(this.pathFor(hash), buf);
    } catch (err) {
      this.logger.warn(`Failed to write cache for ${hash}: ${(err as Error).message}`);
    }
  }

  /** Xoá file cache > ttlMs từ lần access cuối. */
  async cleanup(): Promise<void> {
    try {
      const entries = await fs.readdir(this.dir);
      const cutoff = Date.now() - this.ttlMs;
      let removed = 0;
      let bytes = 0;
      for (const name of entries) {
        if (!name.endsWith('.bin')) continue;
        const filePath = path.join(this.dir, name);
        try {
          const stat = await fs.stat(filePath);
          if (stat.mtimeMs < cutoff) {
            bytes += stat.size;
            await fs.unlink(filePath);
            removed++;
          }
        } catch {
          // ignore individual file errors
        }
      }
      if (removed > 0) {
        this.logger.log(`Cleanup: removed ${removed} files (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
      }
    } catch (err) {
      this.logger.warn(`Cleanup error: ${(err as Error).message}`);
    }
  }
}

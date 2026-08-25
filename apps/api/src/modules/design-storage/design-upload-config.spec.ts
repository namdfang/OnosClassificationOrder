import { DESIGN_UPLOAD_ALLOWED_EXTENSIONS, DESIGN_UPLOAD_ALLOWED_MIME_TYPES } from 'shared';

import type { ApiConfigService } from '@/shared/services/api-config.service';

import type { DesignFileRepository } from './design-file.repository';
import { DesignStorageService } from './design-storage.service';

/**
 * `ORD-17` — ô tải file ở trình duyệt phải lấy giới hạn TỪ SERVER, không chép
 * cứng số 300. Bộ ca dưới đây khoá hai điều dễ mục theo thời gian:
 *   1. giới hạn trả ra đúng bằng `DESIGN_MAX_UPLOAD_MB` đang chạy;
 *   2. vẫn trả được giới hạn KHI CHƯA cấu hình R2 — nếu không, ô tải file mất
 *      luôn khả năng chặn sớm ở đúng lúc kho chưa dựng xong.
 */
const configWith = (maxMb: number, r2: boolean): ApiConfigService =>
  ({
    designUploadMaxMb: maxMb,
    r2Config: r2
      ? { accountId: 'a', accessKeyId: 'b', secretAccessKey: 'c', bucket: 'd', publicBase: 'e', maxUploadMb: maxMb }
      : null,
  }) as unknown as ApiConfigService;

const build = (maxMb = 300, r2 = true) =>
  new DesignStorageService(
    configWith(maxMb, r2),
    {} as unknown as DesignFileRepository,
    // AmqpConnection chỉ dùng ở luồng enqueue, không đụng tới ở đây.
    {} as never,
  );

describe('DesignStorageService.getUploadConfig', () => {
  it('trả đúng giới hạn đang cấu hình, không phải hằng số viết tay', () => {
    expect(build(300).getUploadConfig().maxUploadMb).toBe(300);
    expect(build(50).getUploadConfig().maxUploadMb).toBe(50);
  });

  it('vẫn trả giới hạn khi CHƯA cấu hình R2, kèm cờ báo upload đang tắt', () => {
    const cfg = build(120, false).getUploadConfig();
    expect(cfg.uploadEnabled).toBe(false);
    expect(cfg.maxUploadMb).toBe(120);
  });

  it('bật cờ upload khi R2 đã cấu hình', () => {
    expect(build(300, true).getUploadConfig().uploadEnabled).toBe(true);
  });

  it('trả danh sách định dạng dùng chung với FE', () => {
    const cfg = build().getUploadConfig();
    expect(cfg.allowedMimeTypes).toEqual([...DESIGN_UPLOAD_ALLOWED_MIME_TYPES]);
    expect(cfg.allowedExtensions).toEqual([...DESIGN_UPLOAD_ALLOWED_EXTENSIONS]);
    // PNG là dạng chuẩn của đơn DTF (nền trong suốt) — mất nó là hỏng luồng chính.
    expect(cfg.allowedMimeTypes).toContain('image/png');
  });
});

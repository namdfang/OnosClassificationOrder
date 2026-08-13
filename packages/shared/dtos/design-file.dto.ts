import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, ResZod } from '@shared/types';
import { z } from 'zod';

/**
 * Design file storage (R2 + worker xử lý riêng) — xem plan
 * `documents/Plans/DesignStorage-R2-ProcessingWorker.md`.
 *
 * 1 file VẬT LÝ = 1 record `design_files`, khóa dedup = sha256 NỘI DUNG file
 * (không phải Drive ID/URL — cùng design upload 2 lần dưới 2 tên vẫn lưu 1 lần).
 * R2 key layout (URL ghép từ config `R2_PUBLIC_BASE`, KHÔNG lưu URL tuyệt đối):
 *
 *   designs/<sha256>/original       — file gốc giữ nguyên format (file in)
 *   designs/<sha256>/preview.webp   — 500×500 (drawer/dialog)
 *   designs/<sha256>/thumb.webp     — 100×100 (listing/kanban)
 *   uploads/tmp/<uuid>              — vùng chờ upload trực tiếp, worker dọn
 *
 * Vòng đời: thumb+preview giữ VĨNH VIỄN; original không dùng (lastUsedAt)
 * 60 ngày → hạ Infrequent Access; nằm IA 12 tháng → xóa thật.
 */

export const DESIGN_FILE_STATUSES = ['processing', 'ready', 'archived', 'deleted', 'failed'] as const;
export const DesignFileStatusZod = z.enum(DESIGN_FILE_STATUSES);
export type DesignFileStatus = z.infer<typeof DesignFileStatusZod>;

export const DESIGN_CDN_VARIANTS = ['original', 'preview', 'thumb'] as const;
export type DesignCdnVariant = (typeof DESIGN_CDN_VARIANTS)[number];

const SHA256_HEX = /^[a-f0-9]{64}$/;
export const Sha256Zod = z.string().regex(SHA256_HEX, 'sha256 hex (64 ký tự) không hợp lệ');

/**
 * R2 object key cho 1 biến thể của 1 design (dùng chung API + worker).
 * Layout variant-first (`designs/thumb/<sha>`...) — cùng kiểu 2 folder
 * `designs/preview|thumb/` của module design-image cũ, dễ duyệt trên dashboard.
 */
export function designFileKey(sha256: string, variant: DesignCdnVariant): string {
  return variant === 'original' ? `designs/original/${sha256}` : `designs/${variant}/${sha256}.webp`;
}

/** URL CDN public cho 1 biến thể. `base` = R2_PUBLIC_BASE (không slash cuối). */
export function designCdnUrl(base: string, sha256: string, variant: DesignCdnVariant): string {
  return `${base.replace(/\/$/, '')}/${designFileKey(sha256, variant)}`;
}

const DESIGN_CDN_URL_PATTERN = /\/designs\/(original|preview|thumb)\/([a-f0-9]{64})(\.webp)?$/;

/** Trích sha256 từ 1 URL CDN design của hệ mình — không match → null. */
export function extractDesignSha(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(DESIGN_CDN_URL_PATTERN);
  return m?.[2] ?? null;
}

/**
 * Đổi biến thể ngay trên URL CDN (original ↔ preview ↔ thumb) — cho FE render
 * thumb/preview từ giá trị `designs.{k}` (luôn lưu URL original). URL không
 * phải CDN design của mình → trả null, caller fallback xử lý Drive như cũ.
 */
export function designVariantUrl(url: string | undefined | null, variant: DesignCdnVariant): string | null {
  const sha = extractDesignSha(url);
  if (!sha || !url) return null;
  return url.replace(DESIGN_CDN_URL_PATTERN, `/${designFileKey(sha, variant)}`);
}

//
export const DesignFileZod = BaseEntityZod.extend({
  sha256: Sha256Zod,
  status: DesignFileStatusZod,
  /** Tên file thật khách đặt (hiển thị). */
  fileName: z.string().max(300).optional(),
  size: z.number().int().nonnegative().default(0),
  mime: z.string().max(100).optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  /** false = file không phải ảnh raster (PSD/AI/PDF…) — không có thumb/preview. */
  hasPreview: z.boolean().default(false),
  lastUsedAt: z.union([z.string(), z.date()]).optional(),
  usageCount: z.number().int().default(0),
  errorMessage: z.string().optional(),
});
export type DesignFile = z.infer<typeof DesignFileZod>;

//
export const PresignDesignUploadZod = z.object({
  /** sha256 nội dung file — FE tính bằng WebCrypto TRƯỚC khi upload (dedup 0 giây). */
  sha256: Sha256Zod,
  size: z.number().int().positive(),
  mime: z.string().max(100),
  fileName: z.string().max(300).optional(),
});
export class PresignDesignUploadDto extends createZodDto(extendApi(PresignDesignUploadZod)) {}

export const PresignDesignUploadResZod = ResZod.extend({
  data: z.object({
    /** `exists` = dedup hit, khỏi upload — dùng luôn `file`. `upload` = PUT lên `uploadUrl`. */
    mode: z.enum(['exists', 'upload']),
    file: DesignFileZod,
    /** Base URL CDN (R2_PUBLIC_BASE) — FE ghép link qua `designCdnUrl()`. */
    publicBase: z.string(),
    uploadUrl: z.string().optional(),
    tmpKey: z.string().optional(),
  }),
});
export class PresignDesignUploadResDto extends createZodDto(extendApi(PresignDesignUploadResZod)) {}

//
export const ConfirmDesignUploadZod = z.object({
  tmpKey: z.string().min(1).max(200),
  sha256: Sha256Zod,
  fileName: z.string().max(300).optional(),
});
export class ConfirmDesignUploadDto extends createZodDto(extendApi(ConfirmDesignUploadZod)) {}

export const ConfirmDesignUploadResZod = ResZod.extend({ data: DesignFileZod });
export class ConfirmDesignUploadResDto extends createZodDto(extendApi(ConfirmDesignUploadResZod)) {}

//
export const GetDesignFileResZod = ResZod.extend({ data: DesignFileZod });
export class GetDesignFileResDto extends createZodDto(extendApi(GetDesignFileResZod)) {}

// ---------------------------------------------------------------------------
// RabbitMQ job contract (API publish ↔ design-worker consume)
// ---------------------------------------------------------------------------

/** Routing key + queue suffix — full name = `${RABBITMQ_MAIN_EXCHANGE}.${DESIGN_PROCESSING_QUEUE}`. */
export const DESIGN_PROCESSING_QUEUE = 'design.process';

/** Upload trực tiếp từ portal — object đã nằm ở `uploads/tmp/`, worker verify sha + resize. */
export interface DesignIngestTmpObjectJob {
  kind: 'tmp-object';
  tmpKey: string;
  /** sha FE claim — worker TỰ TÍNH LẠI, sha thật là nguồn chân lý. */
  sha256: string;
  fileName?: string;
  customerId?: string;
  userEmail?: string;
  retry?: number;
}

/** Ingest từ URL ngoài (Drive…) lúc Push to production — worker tải về, xử lý, thay URL. */
export interface DesignIngestUrlJob {
  kind: 'url';
  url: string;
  /** Key trong `designs` object (front, back, sleeve…); với target='tracking-label' chỉ mang tính log. */
  designKey: string;
  /**
   * Đích thay URL sau khi ingest: 'design' (mặc định — `designs.{key}` ở cả
   * OrderEntity lẫn staging) hoặc 'tracking-label' (label vận chuyển khách cấp
   * — CHỈ thay `items[].tracking.labelUrl` ở staging, OrderEntity chưa có field
   * tracking cho tới Phase 2).
   */
  target?: 'design' | 'tracking-label';
  /** Đơn sản xuất cần thay `designs.{designKey}` → CDN URL khi xong. */
  productionId: string;
  /** Staging doc `customer_orders` cần thay `items[].designs.{designKey}` tương ứng. */
  stagingId?: string;
  customerId?: string;
  userEmail?: string;
  retry?: number;
}

export type DesignIngestJob = DesignIngestTmpObjectJob | DesignIngestUrlJob;

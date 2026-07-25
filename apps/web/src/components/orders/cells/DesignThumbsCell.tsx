import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Image as ImageIcon } from 'lucide-react';

import { ImageThumbCell } from '@/components/orders/cells/ImageThumbCell';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { cn } from '@/utils/cn';

const DESIGN_KEY_ORDER = [
  'front',
  'back',
  'sleeve',
  'hood',
  'folder',
  'placket',
  'chestLeft',
  'chestRight',
  'left',
  'right',
  'sleeveLeft',
  'sleeveRight',
  'leftUpperSleeve',
  'rightUpperSleeve',
  'leftCuff',
  'rightCuff',
  'frontEmbroidery',
  'backEmbroidery',
] as const;

function buildDesignLabels(t: TFunction<'orders'>): Record<string, string> {
  return {
    front: t('cells.designThumbs.labels.front'),
    back: t('cells.designThumbs.labels.back'),
    sleeve: t('cells.designThumbs.labels.sleeve'),
    hood: t('cells.designThumbs.labels.hood'),
    folder: t('cells.designThumbs.labels.folder'),
    placket: t('cells.designThumbs.labels.placket'),
    chestLeft: t('cells.designThumbs.labels.chestLeft'),
    chestRight: t('cells.designThumbs.labels.chestRight'),
    left: t('cells.designThumbs.labels.left'),
    right: t('cells.designThumbs.labels.right'),
    sleeveLeft: t('cells.designThumbs.labels.sleeveLeft'),
    sleeveRight: t('cells.designThumbs.labels.sleeveRight'),
    leftUpperSleeve: t('cells.designThumbs.labels.leftUpperSleeve'),
    rightUpperSleeve: t('cells.designThumbs.labels.rightUpperSleeve'),
    leftCuff: t('cells.designThumbs.labels.leftCuff'),
    rightCuff: t('cells.designThumbs.labels.rightCuff'),
    frontEmbroidery: t('cells.designThumbs.labels.frontEmbroidery'),
    backEmbroidery: t('cells.designThumbs.labels.backEmbroidery'),
  };
}

interface Props {
  designs?: Record<string, string | undefined>;
  designsOriginal?: Record<string, string | undefined>;
  designsStatus?: Partial<Record<string, 'pending' | 'ready' | 'failed'>>;
  productionId?: string;
  /**
   * Caller mở dialog. Tham số thứ 4 (`sourceUrl`) = URL gốc dùng cho
   * ensure-preview on-demand (BE upload preview nếu chưa có).
   */
  openPreview: (url: string, title: string, originalUrl?: string, sourceUrl?: string) => void;
  /** Số thumb hiển thị inline trước khi gom vào "+N". Default 2. */
  maxInline?: number;
  /** Kích thước thumb inline (px). Default 32. */
  size?: number;
}

interface DesignEntry {
  key: string;
  url?: string;
  originalUrl?: string;
  status?: 'pending' | 'ready' | 'failed';
}

function extractEntries(
  designs: Record<string, string | undefined> = {},
  designsOriginal: Record<string, string | undefined> = {},
  designsStatus: Partial<Record<string, 'pending' | 'ready' | 'failed'>> = {},
): DesignEntry[] {
  const seen = new Set<string>();
  const ordered: DesignEntry[] = [];
  for (const key of DESIGN_KEY_ORDER) {
    const url = designs[key]?.trim() || undefined;
    const originalUrl = designsOriginal[key]?.trim() || undefined;
    const status = designsStatus[key];
    if (!url && !originalUrl && status !== 'pending') continue;
    seen.add(key);
    ordered.push({ key, url, originalUrl, status });
  }
  // Bắt thêm các key lạ (nếu BE thêm field mới chưa có trong DESIGN_KEY_ORDER)
  for (const key of Object.keys({ ...designs, ...designsOriginal, ...designsStatus })) {
    if (seen.has(key)) continue;
    const url = designs[key]?.trim() || undefined;
    const originalUrl = designsOriginal[key]?.trim() || undefined;
    const status = designsStatus[key];
    if (!url && !originalUrl && status !== 'pending') continue;
    ordered.push({ key, url, originalUrl, status });
  }
  return ordered;
}

export function DesignThumbsCell({
  designs,
  designsOriginal,
  designsStatus,
  productionId,
  openPreview,
  maxInline = 2,
  size = 32,
}: Props) {
  const { t } = useTranslation('orders');
  const designLabels = React.useMemo(() => buildDesignLabels(t), [t]);
  const entries = React.useMemo(
    () => extractEntries(designs, designsOriginal, designsStatus),
    [designs, designsOriginal, designsStatus],
  );

  if (entries.length === 0) {
    return (
      <span
        className="inline-flex items-center justify-center rounded border border-border bg-muted text-muted-foreground"
        style={{ width: size, height: size }}
        title={t('cells.designThumbs.noDesign')}
      >
        <ImageIcon size={14} />
      </span>
    );
  }

  const inline = entries.slice(0, maxInline);
  const overflow = entries.slice(maxInline);

  const renderThumb = (e: DesignEntry, sz: number) => {
    const label = designLabels[e.key] || e.key;
    const title = productionId ? `${label} — ${productionId}` : label;
    return (
      <ImageThumbCell
        key={e.key}
        url={e.url}
        originalUrl={e.originalUrl}
        title={title}
        size={sz}
        status={e.status}
        // sourceUrl = originalUrl (URL gốc Drive/CDN user paste lúc import) —
        // dùng cho ensure-preview BE.
        onOpen={(u, t, o) => openPreview(u, t, o, e.originalUrl)}
      />
    );
  };

  return (
    <div className="inline-flex items-center gap-1">
      {inline.map((e) => renderThumb(e, size))}
      {overflow.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex items-center justify-center rounded border border-border',
                'bg-muted text-muted-foreground text-[11px] font-semibold leading-none',
                'hover:bg-accent hover:text-foreground transition-colors',
                'cursor-pointer select-none',
              )}
              style={{ width: size, height: size }}
              title={t('cells.designThumbs.moreCount', { count: overflow.length })}
            >
              +{overflow.length}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-2" align="start">
            <p className="text-[11px] font-semibold text-foreground mb-2 px-1">
              {productionId ? t('cells.designThumbs.allDesignsFor', { productionId }) : t('cells.designThumbs.allDesigns')}{' '}
              ({entries.length})
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {entries.map((e) => (
                <div key={e.key} className="flex flex-col items-center gap-0.5">
                  {renderThumb(e, 56)}
                  <span className="text-[9px] text-muted-foreground line-clamp-1 max-w-[56px]">
                    {designLabels[e.key] || e.key}
                  </span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

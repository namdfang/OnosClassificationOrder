import React from 'react';
import { Image as ImageIcon } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ImageThumbCell } from '@/components/orders/cells/ImageThumbCell';
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

const DESIGN_LABELS: Record<string, string> = {
  front: 'Mặt trước',
  back: 'Mặt sau',
  sleeve: 'Tay áo',
  hood: 'Mũ',
  folder: 'Folder',
  placket: 'Nẹp áo',
  chestLeft: 'Ngực trái',
  chestRight: 'Ngực phải',
  left: 'Trái',
  right: 'Phải',
  sleeveLeft: 'Tay trái',
  sleeveRight: 'Tay phải',
  leftUpperSleeve: 'Tay trên trái',
  rightUpperSleeve: 'Tay trên phải',
  leftCuff: 'Cổ tay trái',
  rightCuff: 'Cổ tay phải',
  frontEmbroidery: 'Thêu trước',
  backEmbroidery: 'Thêu sau',
};

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
  const entries = React.useMemo(
    () => extractEntries(designs, designsOriginal, designsStatus),
    [designs, designsOriginal, designsStatus],
  );

  if (entries.length === 0) {
    return (
      <span
        className="inline-flex items-center justify-center rounded border border-border bg-muted text-muted-foreground"
        style={{ width: size, height: size }}
        title="Chưa có design"
      >
        <ImageIcon size={14} />
      </span>
    );
  }

  const inline = entries.slice(0, maxInline);
  const overflow = entries.slice(maxInline);

  const renderThumb = (e: DesignEntry, sz: number) => {
    const label = DESIGN_LABELS[e.key] || e.key;
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
              title={`+${overflow.length} design khác`}
            >
              +{overflow.length}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-2" align="start">
            <p className="text-[11px] font-semibold text-foreground mb-2 px-1">
              {productionId ? `Tất cả design — ${productionId}` : 'Tất cả design'} ({entries.length})
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {entries.map((e) => (
                <div key={e.key} className="flex flex-col items-center gap-0.5">
                  {renderThumb(e, 56)}
                  <span className="text-[9px] text-muted-foreground line-clamp-1 max-w-[56px]">
                    {DESIGN_LABELS[e.key] || e.key}
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

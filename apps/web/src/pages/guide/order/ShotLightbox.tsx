import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

import AnnotatedShot from './AnnotatedShot';
import CalloutList from './CalloutList';
import type { GuideStep } from './guideSteps';
import { scrollMarkerIntoView } from './scrollMarker';

interface ShotLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: GuideStep;
  title: string;
  alt: string;
  labelOf: (n: number) => string;
  detailOf: (n: number) => string;
  active: number | null;
  onActiveChange: (n: number | null) => void;
  /** Phần tử đã mở hộp (ảnh → nút "Phóng to", huy hiệu, nút "Phóng to") — nhận lại focus khi đóng. */
  returnFocusRef: React.RefObject<HTMLElement | null>;
}

/**
 * Ảnh phóng to trong hộp thoại Radix (Esc đóng, khoá focus). Hộp mở bằng state chứ
 * không qua `Dialog.Trigger` nên Radix không biết trả focus về đâu (rơi về BODY) →
 * tự trả về `returnFocusRef` ở `onCloseAutoFocus`. Dùng Radix trực tiếp thay vì
 * `components/ui/dialog` vì bản đó gắn sẵn nút đóng có chữ "Close" cứng và khung
 * `max-w-lg` — ở đây cần gần toàn màn hình. Không thêm keyframe cho overlay/content
 * (quy tắc Animation ở apps/web/CLAUDE.md).
 */
function ShotLightbox({
  open,
  onOpenChange,
  step,
  title,
  alt,
  labelOf,
  detailOf,
  active,
  onActiveChange,
  returnFocusRef,
}: ShotLightboxProps) {
  const { t } = useTranslation('orderGuide');
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-ink-900/80" />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            const target = returnFocusRef.current;
            if (!target || !target.isConnected) return;
            event.preventDefault();
            target.focus({ preventScroll: true });
          }}
          className="fixed inset-2 z-[60] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl focus:outline-none sm:inset-6"
        >
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5">
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate font-display text-base font-medium text-[#0f110f] sm:text-lg">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t('shot.close')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0f110f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <X size={18} aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-100 p-3 sm:p-6">
            <AnnotatedShot
              variant="zoom"
              step={step}
              alt={alt}
              labelOf={labelOf}
              active={active}
              onActiveChange={onActiveChange}
              eager
            />
            <div className="mx-auto mt-5 max-w-6xl">
              <CalloutList
                layout="grid"
                callouts={step.callouts}
                labelOf={labelOf}
                detailOf={detailOf}
                active={active}
                onActiveChange={onActiveChange}
                onSelect={(n) => {
                  onActiveChange(n);
                  scrollMarkerIntoView(contentRef.current, n);
                }}
              />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default ShotLightbox;

import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb } from 'lucide-react';

import AnnotatedShot from './AnnotatedShot';
import { isWideShot } from './badgeLayout';
import CalloutList from './CalloutList';
import type { GuideFlowId, GuideStep } from './guideSteps';
import { scrollMarkerIntoView } from './scrollMarker';
import ShotLightbox from './ShotLightbox';

interface GuideStepBlockProps {
  flowId: GuideFlowId;
  step: GuideStep;
  index: number;
  total: number;
  eager?: boolean;
  /** Nội dung phụ dưới mô tả (vd link sang trang tra cứu). */
  extra?: React.ReactNode;
}

/**
 * Một bước hướng dẫn: số bước + tiêu đề + mô tả, ảnh có chấm đánh số, danh sách
 * chú thích cùng số, và hộp phóng to.
 *
 * Bố cục theo hình dạng ảnh (`isWideShot`): ảnh rộng hoặc dải ngang dẹt chiếm cả bề ngang
 * nội dung, chữ ở trên, chú thích xếp lưới bên dưới; ảnh hẹp (hộp thoại, form dọc) nằm cột
 * phải và KHÔNG phóng quá kích thước gốc, chú thích ở cột trái. Dưới `lg` luôn là:
 * chữ → ảnh → chú thích, trong lưới `grid-cols-1` (= `minmax(0,1fr)`) để bề rộng tối thiểu
 * của ảnh không kéo giãn cột chữ (lỗi tràn ngang 390px).
 */
function GuideStepBlock({ flowId, step, index, total, eager = false, extra }: GuideStepBlockProps) {
  const { t } = useTranslation('orderGuide');
  const rootRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomActive, setZoomActive] = useState<number | null>(null);

  const base = `flows.${flowId}.steps.${step.id}`;
  const title = t(`${base}.title`);
  const alt = t(`${base}.alt`);
  const stepLabel = t('step.label', { n: index + 1, total });
  const labelOf = useCallback((n: number) => t(`${base}.callouts.${n}.label`), [t, base]);
  const detailOf = useCallback((n: number) => t(`${base}.callouts.${n}.detail`), [t, base]);
  const wide = isWideShot(step);

  const openZoom = (n: number | undefined, returnFocus: HTMLElement | null) => {
    returnFocusRef.current = returnFocus;
    setZoomActive(n ?? null);
    setZoomOpen(true);
  };

  const selectCallout = (n: number) => {
    setActive(n);
    scrollMarkerIntoView(rootRef.current, n);
  };

  const header = (
    <div className="flex gap-4">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 font-display text-lg font-medium text-white shadow-lg shadow-brand-600/25"
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-brand-600">{stepLabel}</p>
        <h3 className="mt-1 font-display text-xl font-medium leading-snug text-[#0f110f] sm:text-2xl">{title}</h3>
        <p className="mt-2 max-w-3xl text-[0.95rem] leading-relaxed text-slate-600">{t(`${base}.body`)}</p>
        {step.note && (
          <div className="mt-4 flex max-w-3xl gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
            <p>
              <span className="font-semibold">{t('step.note')} </span>
              {t(`${base}.note`)}
            </p>
          </div>
        )}
        {extra && <div className="mt-4">{extra}</div>}
      </div>
    </div>
  );

  const shot = (
    <AnnotatedShot
      step={step}
      alt={alt}
      labelOf={labelOf}
      active={active}
      onActiveChange={setActive}
      onZoom={openZoom}
      eager={eager}
    />
  );

  const list = (layout: 'stack' | 'grid') => (
    <CalloutList
      layout={layout}
      callouts={step.callouts}
      labelOf={labelOf}
      detailOf={detailOf}
      active={active}
      onActiveChange={setActive}
      onSelect={selectCallout}
    />
  );

  return (
    <article ref={rootRef} id={`${flowId}-${step.id}`} className="min-w-0 scroll-mt-32 lg:scroll-mt-36">
      {wide ? (
        <div className="grid min-w-0 grid-cols-1">
          <div className="min-w-0">{header}</div>
          <div className="mt-6 min-w-0">{shot}</div>
          <div className="mt-4 min-w-0">{list('grid')}</div>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,min(var(--shot-w),36rem))] lg:grid-rows-[auto_1fr] lg:gap-x-10"
          style={{ '--shot-w': `${step.width}px` } as React.CSSProperties}
        >
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">{header}</div>
          <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">{shot}</div>
          <div className="min-w-0 lg:col-start-1 lg:row-start-2 lg:pl-14">{list('stack')}</div>
        </div>
      )}

      <ShotLightbox
        open={zoomOpen}
        onOpenChange={setZoomOpen}
        step={step}
        title={`${stepLabel} · ${title}`}
        alt={alt}
        labelOf={labelOf}
        detailOf={detailOf}
        active={zoomActive}
        onActiveChange={setZoomActive}
        returnFocusRef={returnFocusRef}
      />
    </article>
  );
}

export default GuideStepBlock;

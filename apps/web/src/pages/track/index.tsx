import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Copy,
  ExternalLink,
  PackageSearch,
  RotateCcw,
  Search,
} from 'lucide-react';
import type { PublicOrderTrack } from 'shared';
import { CustomerOrderStatus, LIFECYCLE_STAGE_KEYS } from 'shared';

import { PATHS } from '@/constants/paths';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import BackToTop from '@/components/public/BackToTop';
import ProductImage from '@/components/public/ProductImage';
import PublicFooter from '@/components/public/PublicFooter';
import PublicHeader from '@/components/public/PublicHeader';

import { cn } from '@/utils/cn';

/** Màu badge theo trạng thái khách — cùng thang với listing portal. */
const STATUS_TONE: Record<string, string> = {
  [CustomerOrderStatus.Pending]: 'bg-slate-100 text-slate-700 ring-slate-200',
  [CustomerOrderStatus.Processing]: 'bg-amber-50 text-amber-700 ring-amber-200',
  [CustomerOrderStatus.InProduction]: 'bg-brand-50 text-brand-700 ring-brand-200',
  [CustomerOrderStatus.Fulfilled]: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  [CustomerOrderStatus.Completed]: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  [CustomerOrderStatus.Refunded]: 'bg-slate-100 text-slate-700 ring-slate-200',
  [CustomerOrderStatus.Cancelled]: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const dt = (v?: string | Date) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : undefined);

/** Ô "nhãn — giá trị", bỏ hẳn khi không có giá trị (đơn thiếu field là chuyện thường). */
function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="min-w-0">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-0.5 break-words text-sm text-[#0f110f]">{value}</p>
    </div>
  );
}

/**
 * Mã đơn + nút chép. Đây là thứ người tra cứu cần lấy ra nhiều nhất (dán vào
 * chat với hỗ trợ, đối chiếu với sàn), nên nút chép nằm ngay cạnh mã chứ không
 * bắt bôi đen chuỗi có gạch ngang.
 */
function CodeField({ label, value, strong = false }: { label: string; value?: string; strong?: boolean }) {
  const { t } = useTranslation('track');
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard bị chặn (http, quyền trình duyệt) — mã vẫn hiển thị để chép tay.
    }
  };

  return (
    <div className="min-w-0">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <div className="mt-0.5 flex items-center gap-2">
        <span
          className={cn(
            'break-all font-mono text-[#0f110f]',
            strong ? 'text-xl font-bold tracking-tight sm:text-2xl' : 'text-sm',
          )}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={copy}
          title={copied ? t('ids.copied') : `${t('ids.copy')} ${label}`}
          aria-label={`${t('ids.copy')} ${label}`}
          className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-600"
        >
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

function StageIcon({ status }: { status: string }) {
  if (status === 'done') return <CircleCheck size={18} className="text-emerald-500" />;
  if (status === 'current') return <CircleDot size={18} className="text-brand-600" />;
  if (status === 'error' || status === 'rework') return <AlertTriangle size={18} className="text-amber-500" />;
  return <CircleDashed size={18} className="text-slate-300" />;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-400">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Trang tra cứu đơn CÔNG KHAI — `/track` (ô nhập mã) và `/track/:productionId`
 * (kết quả). Không gate auth: khách dán thẳng link cho người mua cuối.
 *
 * Dữ liệu lấy từ `GET /public/track/:code`, vốn đã lọc sẵn danh sách trắng field
 * (không giá, không tên nhân viên, không file thiết kế, địa chỉ chỉ còn
 * city/state/country) — trang này KHÔNG tự thêm nguồn dữ liệu nào khác.
 */
function PublicTrackPage() {
  const { t } = useTranslation('track');
  const navigate = useNavigate();
  const { productionId } = useParams<{ productionId: string }>();

  const [input, setInput] = useState(productionId ?? '');
  const [data, setData] = useState<PublicOrderTrack | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => setInput(productionId ?? ''), [productionId]);

  const fetchTrack = useCallback(async (code: string) => {
    setLoading(true);
    setNotFound(false);
    try {
      const res = await RepositoryRemote.publicTrack.getTrack(code);
      setData((res?.data?.data ?? null) as PublicOrderTrack | null);
    } catch {
      // Mọi lỗi tra cứu đều quy về "không tìm thấy": BE cố tình không phân biệt
      // mã sai định dạng / mã không tồn tại, nên FE cũng không bịa ra khác biệt.
      setData(null);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!productionId) {
      setData(null);
      setNotFound(false);
      return;
    }
    void fetchTrack(productionId);
  }, [productionId, fetchTrack]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = input.trim();
    if (!code) return;
    navigate(`${PATHS.TRACK}/${encodeURIComponent(code)}`);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // no-op
    }
  };

  /** Nhãn chặng dịch theo key (BE gửi kèm nhãn tiếng Việt làm đường lui). */
  const stageLabel = useCallback(
    (key: string, fallback: string) =>
      (LIFECYCLE_STAGE_KEYS as readonly string[]).includes(key) ? t(`progress.stages.${key}`) : fallback,
    [t],
  );

  const currentStageText = useMemo(() => {
    if (!data) return undefined;
    const current = data.stages.find((s) => s.status === 'current' || s.status === 'rework' || s.status === 'error');
    if (current) return stageLabel(current.key, current.label);
    if (data.currentStageKey) return stageLabel(data.currentStageKey, data.currentStageLabel ?? data.currentStageKey);
    return data.currentStageLabel;
  }, [data, stageLabel]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <PublicHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <div className="flex items-start gap-3">
          <span className="mt-1 rounded-xl bg-brand-600/10 p-2 text-brand-600">
            <PackageSearch size={22} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-medium tracking-tight text-[#0f110f] sm:text-3xl">
              {t('meta.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{t('meta.subtitle')}</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="track-code" className="sr-only">
            {t('search.label')}
          </label>
          <input
            id="track-code"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('search.placeholder')}
            autoFocus={!productionId}
            className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 font-mono text-sm text-[#0f110f] outline-none transition-colors placeholder:font-sans placeholder:text-slate-400 focus:border-brand-600"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-[0.72rem] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-brand-700"
          >
            <Search size={15} />
            {t('search.submit')}
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">{t('search.hint')}</p>

        {loading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {!loading && !productionId && (
          <p className="mt-10 rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
            {t('search.empty')}
          </p>
        )}

        {!loading && notFound && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
            <p className="font-display text-lg text-[#0f110f]">{t('notFound.title')}</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{t('notFound.desc')}</p>
            <Link
              to={PATHS.TRACK}
              className="mt-5 inline-flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-600"
            >
              {t('notFound.back')} <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {!loading && data && (
          <div className="mt-8 space-y-4">
            {/* ---- Mã đơn + trạng thái: thứ người tra cần thấy đầu tiên ---- */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <CodeField label={t('ids.productionId')} value={data.productionId} strong />
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] ring-1',
                      STATUS_TONE[data.status] ?? 'bg-slate-100 text-slate-700 ring-slate-200',
                    )}
                  >
                    {t(`status.${data.status}`)}
                  </span>
                  {data.onHold && (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-200">
                      {t('status.onHold')}
                    </span>
                  )}
                  {data.rework && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-orange-700 ring-1 ring-orange-200">
                      <RotateCcw size={12} />
                      {t('status.rework')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={copyLink}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-slate-500 transition-colors hover:border-brand-600 hover:text-brand-600"
                  >
                    {linkCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    {linkCopied ? t('share.copied') : t('share.copyLink')}
                  </button>
                </div>
              </div>

              {data.onHold && data.holdKind && (
                <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                  {t(`hold.${data.holdKind}`)}
                </p>
              )}

              <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                <CodeField label={t('ids.externalId')} value={data.externalId} />
                <CodeField label={t('ids.orderId')} value={data.orderId} />
                <Field label={t('ids.identifier')} value={data.identifier} />
                <Field label={t('ids.orderName')} value={data.orderName} />
                <Field label={t('status.currentStage')} value={currentStageText ?? t('status.notStarted')} />
                <Field label={t('dates.inProductionAt')} value={dt(data.dates.inProductionAt)} />
              </div>
            </section>

            {/* ---- Tiến trình 8 chặng ---- */}
            <SectionCard title={t('progress.title')}>
              {data.stages.length === 0 ? (
                <p className="text-sm text-slate-500">{t('progress.notPushed')}</p>
              ) : (
                <ol className="space-y-0">
                  {data.stages.map((s, idx) => (
                    <li key={s.key} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <StageIcon status={s.status} />
                        {idx < data.stages.length - 1 && (
                          <span
                            className={cn(
                              'w-px flex-1',
                              s.status === 'done' ? 'bg-emerald-200' : 'bg-slate-200',
                            )}
                          />
                        )}
                      </div>
                      <div className={cn('min-w-0 pb-4', idx === data.stages.length - 1 && 'pb-0')}>
                        <p
                          className={cn(
                            'text-sm',
                            s.status === 'pending' ? 'text-slate-400' : 'font-medium text-[#0f110f]',
                          )}
                        >
                          {stageLabel(s.key, s.label)}
                        </p>
                        <p className="text-xs text-slate-400">
                          {t(`progress.stageStatus.${s.status}`)}
                          {s.at ? ` · ${dt(s.at)}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* ---- Sản phẩm ---- */}
              <SectionCard title={t('product.title')}>
                <div className="flex gap-4">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200">
                    <ProductImage
                      src={data.product.mockupUrl}
                      alt={data.product.type ?? data.productionId}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                    <Field label={t('product.type')} value={data.product.type} />
                    <Field label={t('product.quantity')} value={data.product.quantity} />
                    <Field label={t('product.color')} value={data.product.color} />
                    <Field label={t('product.size')} value={data.product.size} />
                    <Field label={t('product.printMethod')} value={data.product.printMethod} />
                    <Field label={t('product.sku')} value={data.product.sku} />
                    <Field label={t('product.merchantSku')} value={data.product.merchantSku} />
                  </div>
                </div>
              </SectionCard>

              {/* ---- Mốc thời gian + giao hàng ---- */}
              <div className="space-y-4">
                <SectionCard title={t('dates.title')}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t('dates.orderAt')} value={dt(data.dates.orderAt)} />
                    <Field label={t('dates.pushedAt')} value={dt(data.dates.pushedAt)} />
                    <Field label={t('dates.inProductionAt')} value={dt(data.dates.inProductionAt)} />
                    <Field
                      label={t('dates.fulfillmentCompletedAt')}
                      value={dt(data.dates.fulfillmentCompletedAt)}
                    />
                    <Field label={t('dates.cancelledAt')} value={dt(data.dates.cancelledAt)} />
                  </div>
                </SectionCard>

                <SectionCard title={t('shipping.title')}>
                  {data.tracking || data.destination ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        label={t('shipping.destination')}
                        value={[data.destination?.city, data.destination?.state, data.destination?.country]
                          .filter(Boolean)
                          .join(', ')}
                      />
                      <Field label={t('shipping.carrier')} value={data.tracking?.carrier} />
                      <Field label={t('shipping.trackingNumber')} value={data.tracking?.number} />
                      {data.tracking?.url && (
                        <a
                          href={data.tracking.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1.5 self-end text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-600"
                        >
                          {t('shipping.trackingLink')} <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">{t('shipping.none')}</p>
                  )}
                </SectionCard>
              </div>
            </div>

            {/* ---- Item khác cùng đơn ---- */}
            {data.siblings.length > 0 && (
              <SectionCard title={t('siblings.title')}>
                <ul className="divide-y divide-slate-100">
                  {data.siblings.map((s) => (
                    <li key={s.productionId} className="flex flex-wrap items-center gap-3 py-2.5">
                      <Link
                        to={`${PATHS.TRACK}/${encodeURIComponent(s.productionId)}`}
                        className="font-mono text-sm font-medium text-brand-600 hover:underline"
                      >
                        {s.productionId}
                      </Link>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
                        {[s.type, s.color, s.size].filter(Boolean).join(' · ')}
                        {s.quantity ? ` × ${s.quantity}` : ''}
                      </span>
                      <span className="text-xs text-slate-400">
                        {t(`status.${s.status}`)}
                        {s.currentStageKey || s.currentStageLabel
                          ? ` · ${stageLabel(s.currentStageKey ?? '', s.currentStageLabel ?? '')}`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            <p className="px-1 text-xs text-slate-400">
              {t('privacyNote')}{' '}
              <Link to={PATHS.CUSTOMER_LOGIN} className="font-semibold text-brand-600 hover:underline">
                {t('signIn')}
              </Link>
            </p>
          </div>
        )}
      </main>

      <PublicFooter />
      <BackToTop />
    </div>
  );
}

export default PublicTrackPage;

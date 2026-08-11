import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Info } from 'lucide-react';
import type { CustomerCatalogItem } from 'shared';

import { PATHS } from '@/constants/paths';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import BackToTop from '@/components/public/BackToTop';
import PillLink from '@/components/public/PillLink';
import ProductImage from '@/components/public/ProductImage';
import PublicFooter from '@/components/public/PublicFooter';
import PublicHeader from '@/components/public/PublicHeader';
import Reveal from '@/components/public/Reveal';

import { handleAxiosError } from '@/utils';

const priceFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Trùng với `landing.footer.contact.email` — dùng khi sản phẩm chưa có thông số công khai. */
const SUPPORT_EMAIL = 'support@onosfactory.com';

/** 1 ô thông tin ngắn (Danh mục / Cách in / Vùng in) ở cột phải. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-[#0f110f]">{value}</p>
    </div>
  );
}

/**
 * Chi tiết sản phẩm ở catalog CÔNG KHAI (`/catalog/:id`).
 *
 * Chỉ hiện giá niêm yết (`retailPrice`); ưu đãi theo hạng khách hàng chỉ có sau
 * khi đăng nhập — xem `public-catalog.controller.ts`.
 */
function PublicCatalogDetail() {
  const { t } = useTranslation('catalog');
  const { id } = useParams<{ id: string }>();

  const [item, setItem] = useState<CustomerCatalogItem | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchItem = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await RepositoryRemote.publicCatalog.getCatalogItem(id);
      setItem(res?.data?.data ?? null);
    } catch (error) {
      setItem(null);
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  const printAreas = (item?.printArea ?? []).map((area) => area.label).join(', ');

  // Thực tế gần như mọi sản phẩm mới chỉ có tên. Nếu không chặn, trang chi tiết
  // sẽ chỉ còn 1 dòng tiêu đề trơ trọi + 1 nút, trông như trang lỗi.
  const hasDetails = Boolean(
    item && (item.description || item.printMethod || printAreas || item.sizeChartUrl || item.variations.length > 0),
  );

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#0f110f] antialiased">
      <PublicHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-10 lg:py-14">
          <Link
            to={PATHS.CATALOG}
            className="inline-flex items-center gap-1.5 text-[0.72rem] font-bold uppercase tracking-[0.1em] text-slate-500 transition-colors hover:text-brand-600"
          >
            <ArrowLeft size={14} />
            {t('detail.back')}
          </Link>

          {loading ? (
            <div className="flex justify-center py-24">
              <Spinner />
            </div>
          ) : !item ? (
            <div className="py-24 text-center">
              <p className="font-display text-lg font-medium text-[#0f110f]">{t('detail.notFound')}</p>
              <div className="mt-6 flex justify-center">
                <PillLink to={PATHS.CATALOG} variant="outline">
                  {t('detail.back')}
                </PillLink>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-14">
                <Reveal>
                  <ProductImage
                    src={item.mockup}
                    alt={item.fullName}
                    iconSize={64}
                    priority
                    className="aspect-square rounded-[2rem] rounded-br-none"
                  />
                </Reveal>

                <Reveal delay={120}>
                  {item.productCategory && (
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
                      {item.productCategory}
                    </p>
                  )}

                  <h1 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight text-[#0f110f] lg:text-4xl">
                    {item.fullName}
                  </h1>

                  {item.description && (
                    <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-slate-600">
                      {item.description}
                    </p>
                  )}

                  {(item.printMethod || printAreas) && (
                    <div className="mt-7 grid gap-3 sm:grid-cols-2">
                      {item.printMethod && <Fact label={t('detail.printMethod')} value={item.printMethod} />}
                      {printAreas && <Fact label={t('detail.printArea')} value={printAreas} />}
                    </div>
                  )}

                  {!hasDetails && (
                    <div className="mt-7 rounded-2xl rounded-br-none bg-gradient-to-br from-brand-50 to-brand-100/60 p-6">
                      <div className="flex items-start gap-3">
                        <Info size={18} className="mt-0.5 shrink-0 text-brand-600" />
                        <div>
                          <h2 className="font-display text-base font-medium text-[#0f110f]">
                            {t('detail.pending.title')}
                          </h2>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            {t('detail.pending.description')}
                          </p>
                          <p className="mt-3 text-sm text-slate-600">
                            {t('detail.pending.contact')}{' '}
                            <a
                              href={`mailto:${SUPPORT_EMAIL}`}
                              className="font-semibold text-brand-700 underline underline-offset-4 transition-colors hover:text-brand-800"
                            >
                              {SUPPORT_EMAIL}
                            </a>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {item.sizeChartUrl && (
                    <a
                      href={item.sizeChartUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 underline underline-offset-4 transition-colors hover:text-brand-700"
                    >
                      {t('detail.sizeChart')}
                      <ExternalLink size={14} />
                    </a>
                  )}

                  <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <PillLink to={PATHS.CUSTOMER_REGISTER}>{t('detail.orderCta')}</PillLink>
                  </div>
                  <p className="mt-4 text-xs text-slate-500">
                    <Link
                      to={PATHS.CUSTOMER_LOGIN}
                      className="underline underline-offset-4 transition-colors hover:text-brand-600"
                    >
                      {t('detail.signInHint')}
                    </Link>
                  </p>
                </Reveal>
              </div>

              {item.variations.length > 0 && (
                <Reveal className="mt-16">
                  <h2 className="font-display text-xl font-medium text-[#0f110f]">{t('detail.variations')}</h2>
                  <p className="mt-2 text-sm text-slate-500">{t('detail.priceNote')}</p>

                  <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full min-w-[32rem] text-left text-sm">
                      <thead className="bg-slate-50/80 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-slate-500">
                        <tr>
                          <th scope="col" className="px-4 py-3">
                            {t('detail.sku')}
                          </th>
                          <th scope="col" className="px-4 py-3">
                            {t('detail.attributes')}
                          </th>
                          <th scope="col" className="px-4 py-3 text-right">
                            {t('detail.price')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.variations.map((variation) => (
                          <tr key={variation.sku} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-mono text-xs text-[#0f110f]">{variation.sku}</td>
                            <td className="px-4 py-3 text-slate-600">
                              {(variation.attributes ?? [])
                                .map((attribute) => `${attribute.label}: ${attribute.value}`)
                                .join(' · ') || '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-[#0f110f]">
                              {variation.retailPrice != null ? priceFormatter.format(variation.retailPrice) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Reveal>
              )}
            </>
          )}
        </div>
      </main>

      <PublicFooter />
      <BackToTop />
    </div>
  );
}

export default PublicCatalogDetail;

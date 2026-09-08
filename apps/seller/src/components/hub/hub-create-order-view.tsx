'use client';

/**
 * `/hub/orders/create` — ops lên đơn HỘ seller (SellerPortal.md §9.5).
 *
 * Khuôn lấy từ wizard của thghub (`order-create-wizard` `mode="staff"`): cùng
 * một màn đặt đơn với seller, chỉ chèn thêm **hai bước chọn ở đầu** — dịch vụ
 * và seller — rồi phần còn lại (chọn sản phẩm, biến thể, mockup, file thiết kế,
 * địa chỉ, đặt đơn) dùng LẠI NGUYÊN `CreateOrderView`. Không nhân bản màn đặt
 * đơn: lệch một luật kiểm (đòi file in, giá theo tier, sinh mã sản xuất) giữa
 * hai bản là sinh đơn hỏng mà không ai biết.
 *
 * Đơn tạo ra nằm ở trạng thái CHỜ ĐẨY y như seller tự đặt — ops đẩy tiếp bằng
 * nút Push ở danh sách, không tự động đẩy (đẩy là chiếm mã sản xuất + vào hàng
 * đợi xưởng, phải là một hành động có chủ đích).
 */

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check } from 'lucide-react';
import { CreateOrderView } from '@/components/orders/create-order-view';
import { SellerFilterPicker } from '@/components/hub/seller-filter-picker';
import { Card, CardContent } from '@/components/shared/card';
import { PageHeader } from '@/components/shared/page-header';
import { useUrlState } from '@/hooks/use-url-state';
import { isProductLine, PRODUCT_LINES, PRODUCT_LINE_META, type ProductLine } from '@/lib/product-lines';

/** Chỉ 2 bước riêng của ops; các bước còn lại nằm trong `CreateOrderView`. */
const STEP = { service: 0, seller: 1, order: 2 } as const;

export function HubCreateOrderView({ lockedLine }: { lockedLine?: ProductLine }) {
  const { t } = useTranslation(['hub', 'customerPortal', 'seller']);
  const router = useRouter();
  const [state, setState] = useUrlState({ line: lockedLine ?? '', seller: '' });
  const line: ProductLine | null = isProductLine(state.line) ? state.line : null;

  const step = !line ? STEP.service : !state.seller ? STEP.seller : STEP.order;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => (step === STEP.order ? setState({ seller: '' }) : step === STEP.seller ? setState({ line: lockedLine ?? '' }) : router.push('/hub/orders'))}
        className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={13} /> {t('hub:createOrder.back')}
      </button>

      <PageHeader title={t('hub:createOrder.title')} subtitle={t('hub:createOrder.subtitle')} compact />

      {/* Dải bước — ops luôn biết đang ở đâu và sửa lại được bước trước. */}
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        {[t('hub:createOrder.stepService'), t('hub:createOrder.stepSeller'), t('hub:createOrder.stepOrder')].map((label, i) => (
          <span
            key={label}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border font-semibold ${
              i === step ? 'bg-accent border-accent text-white' : i < step ? 'bg-card border-success/50 text-success' : 'bg-card border-border1 text-text-muted'
            }`}
          >
            {i < step ? <Check size={11} /> : <span className="tabular-nums">{i + 1}</span>}
            {label}
          </span>
        ))}
        {line && (
          <span className="text-text-muted">
            · {t(`customerPortal:productLines.${line}`)}
          </span>
        )}
      </div>

      {step === STEP.service && (
        <Card>
          <CardContent>
            <p className="text-xs text-text-secondary mb-2">{t('hub:createOrder.pickServiceHint')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {PRODUCT_LINES.map((l) => {
                const meta = PRODUCT_LINE_META[l];
                const Icon = meta.icon;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setState({ line: l })}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border1 bg-card hover:border-accent hover:shadow-card transition-all"
                  >
                    <Icon size={20} style={{ color: meta.color }} />
                    <span className="text-[11px] font-bold text-text-primary">{t(`customerPortal:productLines.${l}`)}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {step === STEP.seller && (
        <Card>
          <CardContent className="space-y-2">
            <p className="text-xs text-text-secondary">{t('hub:createOrder.pickSellerHint')}</p>
            <SellerFilterPicker value={state.seller} onChange={(id) => setState({ seller: id })} />
          </CardContent>
        </Card>
      )}

      {step === STEP.order && line && (
        // Đúng màn seller tự đặt — giá theo tier của seller đích, cùng luật kiểm file in.
        <CreateOrderView
          line={line}
          mode="staff"
          customerId={state.seller}
          onCreated={() => router.push(`/hub/orders/${line}?status=pending&seller=${encodeURIComponent(state.seller)}`)}
        />
      )}
    </div>
  );
}

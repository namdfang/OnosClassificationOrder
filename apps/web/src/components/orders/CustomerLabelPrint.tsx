import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';

import { PATHS } from '@/constants/paths';

import { buildDesignLabels, DESIGN_KEY_ORDER } from '@/components/orders/cells/DesignThumbsCell';
import type { WorkshopOrderRow } from '@/components/orders/workshopTableConfig';

/** Id cố định — bộ CSS `@media print` bên dưới nhận diện nhãn qua đúng id này. */
const LABEL_ID = 'customer-label-print';

/**
 * Nhãn dán cho khách, khổ **40×60mm** (4×6cm, dọc) — khổ tem decal rời phổ
 * biến ở xưởng, KHÔNG phải 4×6 inch.
 *
 * Cách in: portal thẳng ra `document.body` rồi để `@media print` giấu mọi
 * anh chị em cùng cấp. Không dùng `visibility: hidden` như sheet barcode ở
 * `pages/orders/stage-errors` — chiều cao thân trang vẫn còn nguyên nên máy
 * in đẩy thêm vài tem trắng, chấp nhận được với giấy A4 nhưng tem rời thì
 * tem trắng là tem hỏng. `display: none` cắt hẳn cả chiều cao, và portal ra
 * body là để `body > *:not(#id)` chạm được tới nhãn (nếu để trong cây React
 * thì nhãn nằm sâu trong `#root`, không phải con trực tiếp của body).
 *
 * `@page size` chỉ tồn tại trong lúc nhãn được mount → không đụng tới các
 * lệnh in khác của ứng dụng.
 */
const PRINT_CSS = `
@media print {
  @page { size: 40mm 60mm; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > *:not(#${LABEL_ID}) { display: none !important; }
  #${LABEL_ID} { display: block !important; }
}
`;

/**
 * Các vị trí in đơn THỰC SỰ có file design, theo đúng thứ tự của cột thumb ở
 * bảng đơn (`DESIGN_KEY_ORDER`). Key lạ (BE thêm vị trí mới chưa kịp khai báo)
 * vẫn được liệt kê ở cuối bằng chính tên key — mất nhãn tiếng Việt còn hơn tem
 * giấu mất một vị trí phải in.
 */
function printPositions(order: WorkshopOrderRow, labels: Record<string, string>): string[] {
  const designs = (order.designs ?? {}) as Record<string, string | undefined>;
  const filled = Object.keys(designs).filter((k) => designs[k]?.trim());
  const known = DESIGN_KEY_ORDER.filter((k) => filled.includes(k)) as string[];
  const unknown = filled.filter((k) => !known.includes(k));
  return [...known, ...unknown].map((k) => labels[k] || k);
}

interface Props {
  order: WorkshopOrderRow;
  /** Gọi khi hộp thoại in đã đóng (in xong hoặc hủy) — caller unmount nhãn. */
  onDone: () => void;
}

/**
 * Mount → in ngay → báo caller gỡ xuống. Không có bước xem trước: người dùng
 * bấm "In nhãn khách" là muốn cầm được cái tem, hộp thoại in của trình duyệt
 * đã là bước xác nhận rồi.
 */
export function CustomerLabelPrint({ order, onDone }: Props) {
  const { t } = useTranslation('orders');

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDone();
    };
    window.addEventListener('afterprint', finish);
    // Đợi qua 2 khung hình để QR (SVG) và web font kịp lên màn trước khi chụp
    // nội dung in — in ngay trong cùng khung hình dễ ra tem trống QR.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        // Chrome/Safari chặn luồng cho tới khi đóng hộp thoại nên tới đây là
        // xong; Firefox thì không, nên vẫn phải chờ `afterprint` — hẹn giờ chỉ
        // là lưới an toàn cho trình duyệt không bắn sự kiện đó.
        window.setTimeout(finish, 1000);
      }),
    );
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('afterprint', finish);
    };
  }, [onDone]);

  const trackUrl = `${window.location.origin}${PATHS.TRACK}/${order.productionId}`;
  const productName = order.productConfig?.fullName || order.type;
  const variant = [order.size, order.color].filter(Boolean).join(' · ');
  const positions = printPositions(order, buildDesignLabels(t));

  return createPortal(
    <>
      <style>{PRINT_CSS}</style>
      <div id={LABEL_ID} className="hidden">
        <div
          className="flex flex-col items-center bg-white text-black overflow-hidden"
          style={{ width: '40mm', height: '60mm', padding: '2mm' }}
        >
          {/* 84px = 22.2mm. Cỡ này KHÔNG chọn cho đẹp mà để vừa ngân sách chiều
              cao 56mm lòng tem ở ca xấu nhất (tên sản phẩm + biến thể + vị trí in
              đều tràn 2 dòng) — xem bảng đo ở `Orders.md §16.6`. Thêm dòng mới vào
              tem thì phải trừ lại ở đây. QR ~48 ký tự / ECC M ra 33 module, tức
              0.67mm/module, vẫn trên ngưỡng camera điện thoại đọc được. */}
          <QRCodeSVG value={trackUrl} size={84} level="M" marginSize={0} />
          <div style={{ fontSize: '5pt', marginTop: '0.8mm' }} className="text-center leading-tight">
            {t('customerLabel.scanHint')}
          </div>

          <div style={{ height: '0.4mm' }} className="w-full my-[1.2mm] bg-black" />

          <div
            style={{ fontSize: '9pt' }}
            className="w-full text-center font-mono font-bold leading-none tracking-tight"
          >
            {order.productionId}
          </div>
          {/* Hai mã phụ, cùng thứ tự với cột Production ID ở danh sách đơn: mã
              đơn trước, mã sàn dưới. Mỗi mã tự biến mất khi đơn không có —
              `externalId` rỗng ở phần lớn đơn nội bộ, `orderId` rỗng ở đơn khách
              tự lên qua Customer Portal, nên tem nào cũng còn ít nhất `productionId`.
              `break-all` chứ KHÔNG `truncate`: mã bị cắt cụt trên tem là mã sai,
              thà xuống dòng. */}
          <CodeLine caption={t('customerLabel.orderIdCaption')} value={order.orderId} />
          <CodeLine caption={t('customerLabel.externalIdCaption')} value={order.externalId} />

          {productName && (
            <div style={{ fontSize: '7pt' }} className="w-full text-center leading-tight line-clamp-2 mt-[1mm]">
              {productName}
            </div>
          )}
          {variant && (
            <div style={{ fontSize: '7pt' }} className="w-full text-center font-semibold leading-tight line-clamp-2">
              {variant}
            </div>
          )}
          {positions.length > 0 && (
            <div style={{ fontSize: '6pt' }} className="w-full text-center leading-tight line-clamp-2 mt-[0.6mm]">
              <span className="uppercase opacity-70">{t('customerLabel.positionsCaption')} </span>
              {positions.join(' · ')}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

/** 1 dòng "nhãn — mã" trên tem; không có giá trị thì bỏ hẳn dòng. */
function CodeLine({ caption, value }: { caption: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ fontSize: '6pt' }} className="w-full text-center leading-tight break-all">
      <span className="uppercase opacity-70">{caption} </span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

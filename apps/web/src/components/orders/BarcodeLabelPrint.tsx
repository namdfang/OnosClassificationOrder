import React, { useEffect } from 'react';
import ReactBarcode from 'react-barcode';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import type { BarcodeLabel } from 'shared';

/** Id cố định — bộ CSS `@media print` bên dưới nhận diện nhãn qua đúng id này. */
const LABEL_ID = 'barcode-label-print';

/** Class của 1 con tem — bộ CSS in bên dưới ngắt trang theo đúng class này. */
const PAGE_CLASS = 'barcode-label-page';

/**
 * Tem barcode xưởng khổ **75×50mm** (ngang) — mỗi productionId 1 trang, quét
 * bằng máy quét 1D ở các trạm (payload `N-<productionId>` — CÙNG format với
 * luồng quét ở `pages/orders/scan-error`, xem `utils/scanCodes.ts`).
 *
 * Cơ chế in giống hệt `CustomerLabelPrint` (Orders.md §16.6): portal thẳng ra
 * `document.body` + `display: none` mọi anh chị em lúc in — tem trắng thừa là
 * tem hỏng trên giấy decal. Xem comment bên đó cho lý do từng lựa chọn.
 */
const PRINT_CSS = `
@media print {
  @page { size: 75mm 50mm; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > *:not(#${LABEL_ID}) { display: none !important; }
  #${LABEL_ID} { display: block !important; }
  .${PAGE_CLASS} { break-after: page; page-break-after: always; }
  .${PAGE_CLASS}:last-child { break-after: auto; page-break-after: auto; }
}
`;

interface Props {
  /** Tem cần in — thứ tự mảng CHÍNH LÀ thứ tự tem chui ra máy in (BE đã trả
   *  theo đúng thứ tự ids gửi lên). */
  labels: BarcodeLabel[];
  /** Gọi khi hộp thoại in đã đóng (in xong hoặc hủy) — caller unmount nhãn. */
  onDone: () => void;
}

/** Mount → in ngay → báo caller gỡ xuống (cùng vòng đời với `CustomerLabelPrint`). */
export function BarcodeLabelPrint({ labels, onDone }: Props) {
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDone();
    };
    if (labels.length === 0) {
      finish();
      return;
    }
    window.addEventListener('afterprint', finish);
    // Đợi qua 2 khung hình cho SVG barcode kịp render trước khi chụp nội dung in.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        window.setTimeout(finish, 1000);
      }),
    );
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('afterprint', finish);
    };
  }, [onDone, labels.length]);

  return createPortal(
    <>
      <style>{PRINT_CSS}</style>
      <div id={LABEL_ID} className="hidden">
        {labels.map((l) => (
          <Label key={l._id} label={l} />
        ))}
      </div>
    </>,
    document.body,
  );
}

/**
 * Thân 1 con tem, dựng theo đúng tem OnosPod cũ mà xưởng đã quen mắt:
 *
 *   PRINTERVAL / GM-02336-03868(1/1)   ← userSku khách / orderId(i/n)
 *   2026/08/27                         ← ngày vào sản xuất
 *   ▐█▌▐▌█▐█▌▐▌█▐█▌                    ← Code128 `N-<productionId>`
 *   N-PM-11594-04672
 *   AOP-CUS-SHAPE-TIE      10.6x62.2   ← SKU sản phẩm · biến thể
 */
function Label({ label }: { label: BarcodeLabel }) {
  const code = `N-${label.productionId}`;
  const orderPart = `${label.orderId || label.productionId}(${label.itemIndex}/${label.itemTotal})`;
  const heading = [label.userSku, orderPart].filter(Boolean).join(' / ');
  const date = label.inProductionAt ? dayjs(label.inProductionAt).format('YYYY/MM/DD') : '';

  return (
    <div
      className={`${PAGE_CLASS} flex flex-col items-center bg-white text-black overflow-hidden`}
      style={{ width: '75mm', height: '50mm', padding: '3mm' }}
    >
      {/* `break-words` chứ KHÔNG truncate: mã bị cắt cụt trên tem là mã sai —
          heading dài (userSku dài) thì tràn xuống dòng 2, ngân sách chiều cao
          vẫn dư (~6mm) cho việc đó. */}
      <div style={{ fontSize: '11pt' }} className="w-full text-center font-bold leading-tight break-words">
        {heading}
      </div>
      {date && (
        <div style={{ fontSize: '8pt' }} className="w-full text-center leading-tight mt-[0.6mm]">
          {date}
        </div>
      )}

      {/* width={1}: mã cố định 16 ký tự "N-XX-#####-#####" → Code128 ~211
          module ≈ 56mm ở 96dpi — luôn lọt lòng tem 69mm kèm quiet zone hai
          bên. KHÔNG kéo giãn SVG bằng CSS: JsBarcode xuất svg không viewBox,
          scale CSS chỉ cắt hình chứ không phóng vạch. */}
      <div className="mt-[1.2mm]">
        <ReactBarcode value={code} format="CODE128" width={1} height={57} displayValue={false} margin={0} />
      </div>
      <div style={{ fontSize: '9pt' }} className="w-full text-center font-mono leading-tight mt-[0.8mm]">
        {code}
      </div>

      {(label.sku || label.variant) && (
        <div style={{ fontSize: '9pt' }} className="w-full flex justify-between gap-2 leading-tight mt-auto">
          <span className="break-all text-left">{label.sku || ''}</span>
          <span className="break-all text-right shrink-0">{label.variant || ''}</span>
        </div>
      )}
    </div>
  );
}

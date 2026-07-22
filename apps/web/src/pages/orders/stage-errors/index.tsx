import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, EyeOff, FileDown, Plus, Printer, QrCode, RotateCcw } from 'lucide-react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import type { FulfillmentStage as FulfillmentStageT, StageErrorReworkTarget, WorkshopConfig } from 'shared';
import { FULFILLMENT_STAGE_LABELS, FULFILLMENT_STAGE_ORDER, FULFILLMENT_STAGES, FulfillmentStage } from 'shared';
import { toast } from 'sonner';

import { PATHS } from '@/constants/paths';

import { useAuthStore } from '@/store/authStore';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';
import { errorQrPayload, SCAN_OK_CODE } from '@/utils/scanCodes';

import { usePermission } from '@/hooks/usePermission';

function targetLabel(target?: StageErrorReworkTarget): string {
  if (!target) return '—';
  if (target === 'tool-check') return 'Soát tool';
  if (target === 'designer') return 'Designer';
  return FULFILLMENT_STAGE_LABELS[target];
}

function targetOptionsFor(stage: FulfillmentStageT): StageErrorReworkTarget[] {
  const before = FULFILLMENT_STAGES.filter((s) => FULFILLMENT_STAGE_ORDER[s] < FULFILLMENT_STAGE_ORDER[stage]);
  return ['tool-check', 'designer', ...before];
}

// Kích thước trang nhãn A8 (52×74mm) — mỗi lỗi 1 trang trong PDF xuất ra.
const A8_MM = { w: 52, h: 74 };
const PX_PER_MM = 20; // vẽ label ở ~508dpi cho QR nét

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export default function OrdersStageErrorsPage() {
  const { has, isAdmin } = usePermission();

  if (!isAdmin && !has('page.stage_errors')) {
    return <Navigate to={PATHS.ORDERS} replace />;
  }

  return <StageErrorsContent />;
}

function StageErrorsContent() {
  // Công nhân Fulfillment → khóa vào công đoạn của mình; Admin/Manager → chọn tab.
  const profile = useAuthStore((s) => s.profile);
  const myStage = profile?.fulfillmentStage as FulfillmentStageT | undefined;

  const [stage, setStage] = useState<FulfillmentStageT>(myStage ?? FulfillmentStage.Press);
  const [rows, setRows] = useState<WorkshopConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form thêm mới
  const [name, setName] = useState('');
  const [target, setTarget] = useState<StageErrorReworkTarget | null>(null);

  // Chọn lỗi để In / Xuất PDF (A8 mỗi lỗi 1 trang).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const reloadStore = useWorkshopConfigStore((s) => s.load);

  const targets = useMemo(() => targetOptionsFor(stage), [stage]);

  const fetchRows = useCallback(async (s: FulfillmentStageT) => {
    setLoading(true);
    try {
      const res = await RepositoryRemote.workshopConfig.listStageErrors(s);
      setRows((res.data?.data || []) as WorkshopConfig[]);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows(stage);
    setTarget(null);
    setSelected(new Set());
  }, [stage, fetchRows]);

  const afterMutate = useCallback(() => {
    fetchRows(stage);
    // Store `production_error` dùng để resolve mã khi quét → refresh cho luồng quét.
    reloadStore(true);
  }, [fetchRows, stage, reloadStore]);

  const handleCreate = async () => {
    if (!name.trim() || !target || saving) return;
    setSaving(true);
    try {
      await RepositoryRemote.workshopConfig.createStageError({
        name: name.trim(),
        reworkTarget: target,
        stage: myStage ? undefined : stage,
      });
      toast.success('Đã thêm lỗi — QR sẵn sàng để in.');
      setName('');
      setTarget(null);
      afterMutate();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (row: WorkshopConfig) => {
    if (saving || !row._id) return;
    setSaving(true);
    try {
      await RepositoryRemote.workshopConfig.updateStageError(row._id, { isActive: !row.isActive });
      toast.success(row.isActive ? 'Đã ẩn lỗi (không xóa để giữ thống kê cũ).' : 'Đã hiện lại lỗi.');
      afterMutate();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const selectedRows = useMemo(() => rows.filter((r) => r._id && selected.has(r._id)), [rows, selected]);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  const toggleSelect = (id?: string) => {
    if (!id) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r._id).filter(Boolean) as string[]));
  };

  /**
   * Vẽ 1 nhãn A8 (QR + tiêu đề + phụ đề + mã) lên canvas rồi trả PNG dataURL —
   * nhét nguyên ảnh vào trang PDF để né vấn đề font tiếng Việt của jsPDF.
   */
  const drawA8Label = (qrCanvasId: string, title: string, subtitle: string, code: string): string => {
    const W = A8_MM.w * PX_PER_MM;
    const H = A8_MM.h * PX_PER_MM;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    const qrEl = document.getElementById(qrCanvasId) as HTMLCanvasElement | null;
    const qrSize = 660;
    const qy = 90;
    if (qrEl) ctx.drawImage(qrEl, (W - qrSize) / 2, qy, qrSize, qrSize);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.font = 'bold 72px sans-serif';
    const lines = wrapCanvasText(ctx, title, W - 140).slice(0, 3);
    let ty = qy + qrSize + 120;
    for (const line of lines) {
      ctx.fillText(line, W / 2, ty);
      ty += 86;
    }
    ctx.font = '52px sans-serif';
    ctx.fillStyle = '#333333';
    ctx.fillText(subtitle, W / 2, ty + 14);
    ctx.font = '44px monospace';
    ctx.fillStyle = '#555555';
    ctx.fillText(code, W / 2, ty + 84);
    return c.toDataURL('image/png');
  };

  const drawLabel = (row: WorkshopConfig): string =>
    drawA8Label(
      `qr-canvas-${row._id}`,
      row.name,
      `Đẩy về: ${targetLabel(row.reworkTarget as StageErrorReworkTarget)}`,
      errorQrPayload(row),
    );

  // Nhãn "✔ HOÀN THÀNH" (SCAN_OK_CODE) — luôn là trang đầu PDF, giống card đầu sheet in.
  const drawOkLabel = (): string =>
    drawA8Label('qr-canvas-ok', '✔ HOÀN THÀNH', 'Chuyển đơn sang công đoạn sau', SCAN_OK_CODE);

  const handleExportPdf = async () => {
    if (selectedRows.length === 0 || exporting) return;
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [A8_MM.w, A8_MM.h] });
      doc.addImage(drawOkLabel(), 'PNG', 0, 0, A8_MM.w, A8_MM.h);
      selectedRows.forEach((row) => {
        doc.addPage([A8_MM.w, A8_MM.h], 'portrait');
        doc.addImage(drawLabel(row), 'PNG', 0, 0, A8_MM.w, A8_MM.h);
      });
      doc.save(`qr-loi-${stage}.pdf`);
      toast.success(`Đã xuất PDF: 1 nhãn OK + ${selectedRows.length} lỗi — mỗi nhãn 1 trang A8.`);
    } catch (err) {
      toast.error(`Xuất PDF thất bại: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-300">
            <QrCode size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Danh mục lỗi công đoạn</h1>
            <p className="text-sm text-muted-foreground">
              Mỗi công đoạn tự định nghĩa lỗi + đích đẩy về. Thêm xong in QR dán tại trạm — quét đơn rồi quét QR lỗi là
              tự báo lỗi + đẩy về.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()} disabled={selectedRows.length === 0}>
            <Printer size={15} className="mr-1.5" />
            In ({selectedRows.length})
          </Button>
          <Button variant="outline" onClick={handleExportPdf} disabled={selectedRows.length === 0 || exporting}>
            {exporting ? <Spinner size={14} className="mr-1.5" /> : <FileDown size={15} className="mr-1.5" />}
            Xuất PDF ({selectedRows.length})
          </Button>
        </div>
      </div>

      {/* Chọn công đoạn */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Công đoạn:</span>
        {myStage ? (
          <span className="inline-flex items-center rounded-md bg-primary/10 text-primary px-3 py-1.5 text-sm font-semibold">
            {FULFILLMENT_STAGE_LABELS[myStage]}
          </span>
        ) : (
          FULFILLMENT_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              className={cn(
                'px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
                stage === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-accent',
              )}
            >
              {FULFILLMENT_STAGE_LABELS[s]}
            </button>
          ))
        )}
      </div>

      {/* Form thêm mới */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <Plus size={15} className="text-primary" />
          Thêm lỗi cho công đoạn "{FULFILLMENT_STAGE_LABELS[stage]}"
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 120))}
          placeholder="Tên lỗi — vd: Lệch màu khi ép, Đường may hỏng…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
          }}
        />
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <RotateCcw size={12} /> Đẩy về công đoạn (= nguồn lỗi):
          </div>
          <div className="flex flex-wrap gap-1.5">
            {targets.map((t) => (
              <TargetChip key={t} active={target === t} label={targetLabel(t)} onClick={() => setTarget(t)} />
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleCreate} disabled={!name.trim() || !target || saving}>
            {saving && <Spinner size={14} className="mr-2" />}
            Thêm & tạo QR
          </Button>
        </div>
      </div>

      {/* List lỗi */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between p-3 border-b text-sm font-medium">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-primary cursor-pointer"
              checked={allSelected}
              onChange={toggleSelectAll}
              disabled={rows.length === 0}
            />
            <span>
              Lỗi của "{FULFILLMENT_STAGE_LABELS[stage]}"{' '}
              <span className="text-muted-foreground font-normal">
                ({rows.length}
                {selected.size > 0 && ` · chọn ${selected.size}`})
              </span>
            </span>
          </label>
          {loading && <Spinner size={14} />}
        </div>
        {rows.length === 0 && !loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Chưa có lỗi nào. Thêm lỗi đầu tiên ở form bên trên.
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row._id} className={cn('p-3 flex items-start gap-3', !row.isActive && 'opacity-50')}>
                <input
                  type="checkbox"
                  className="w-4 h-4 mt-6 accent-primary cursor-pointer shrink-0"
                  checked={!!row._id && selected.has(row._id)}
                  onChange={() => toggleSelect(row._id)}
                />
                <div className="shrink-0 rounded-md border bg-white p-1.5">
                  <QRCodeSVG value={errorQrPayload(row)} size={64} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{row.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <code className="px-1 py-0.5 rounded bg-muted font-mono">{errorQrPayload(row)}</code>
                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5">
                      <RotateCcw size={10} /> Đẩy về {targetLabel(row.reworkTarget as StageErrorReworkTarget)}
                    </span>
                    {!row.isActive && <span className="text-rose-500">Đang ẩn</span>}
                  </div>
                </div>
                {/* Đã thêm là KHÔNG sửa được (QR đã in/đơn đã gán sẽ đổi nghĩa) — chỉ ẩn/hiện. */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => handleToggleActive(row)}
                  title={row.isActive ? 'Ẩn lỗi (giữ thống kê cũ)' : 'Hiện lại lỗi'}
                >
                  {row.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Canvas QR ẩn (512px) — nguồn ảnh nét cho nhãn A8 khi xuất PDF. */}
      <div className="hidden">
        <QRCodeCanvas id="qr-canvas-ok" value={SCAN_OK_CODE} size={512} />
        {rows.map((row) => (
          <QRCodeCanvas key={row._id} id={`qr-canvas-${row._id}`} value={errorQrPayload(row)} size={512} />
        ))}
      </div>

      {/* Sheet in QR — chỉ hiện khi print (visibility trick + off-screen trên màn hình) */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #stage-qr-sheet, #stage-qr-sheet * { visibility: visible !important; }
        #stage-qr-sheet { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; }
      }`}</style>
      <div id="stage-qr-sheet" className="fixed top-0 -left-[200vw] w-[190mm] bg-white text-black">
        <div className="p-6">
          <h2 className="text-lg font-bold mb-1">
            Bảng QR công đoạn: {FULFILLMENT_STAGE_LABELS[stage]}
          </h2>
          <p className="text-xs mb-4">
            Quét barcode ĐƠN trước → quét 1 mã dưới đây. "{SCAN_OK_CODE}" = hoàn thành công đoạn; mã lỗi = báo lỗi + tự
            đẩy về công đoạn ghi trên nhãn.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="border-2 border-black rounded-lg p-3 flex flex-col items-center gap-2 break-inside-avoid">
              <QRCodeSVG value={SCAN_OK_CODE} size={140} />
              <div className="text-base font-bold text-center">✔ HOÀN THÀNH</div>
              <div className="text-[10px] text-center">Chuyển đơn sang công đoạn sau</div>
            </div>
            {selectedRows.map((row) => (
              <div
                key={row._id}
                className="border border-black rounded-lg p-3 flex flex-col items-center gap-2 break-inside-avoid"
              >
                <QRCodeSVG value={errorQrPayload(row)} size={140} />
                <div className="text-sm font-bold text-center leading-tight">{row.name}</div>
                <div className="text-[10px] text-center">
                  Đẩy về: {targetLabel(row.reworkTarget as StageErrorReworkTarget)} ·{' '}
                  <span className="font-mono">{errorQrPayload(row)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TargetChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-foreground border-border hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  CheckCircle2,
  History,
  Keyboard,
  Loader2,
  ScanLine,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { FulfillmentStage, ProductionOrder } from 'shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PATHS } from '@/constants/paths';
import { usePermission } from '@/hooks/usePermission';
import { RepositoryRemote } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { cn } from '@/utils/cn';

import { OrderErrorScanDialog } from './OrderErrorScanDialog';
import { FulfillmentScanActionDialog } from './FulfillmentScanActionDialog';

const MAX_HISTORY = 10;
const MODE_STORAGE_KEY = 'scan-error-mode';
const BARCODE_PREFIX = 'N-';

type ScanMode = 'barcode' | 'normal';

/**
 * Bóc prefix `N-` khi mode=barcode. Máy quét USB output dạng "N-PROD1234<Enter>"
 * nhưng DB lưu `productionId` không có prefix → phải strip mới match.
 * Mode=normal giữ nguyên (user gõ trực tiếp Production ID).
 */
function normalizeCode(raw: string, mode: ScanMode): string {
  const trimmed = raw.trim();
  if (mode !== 'barcode') return trimmed;
  // Bắt cả prefix viết HOA lẫn thường ("N-" và "n-") — máy quét có thể xuất
  // chữ thường tuỳ cấu hình. So sánh case-insensitive rồi mới strip.
  if (trimmed.slice(0, BARCODE_PREFIX.length).toUpperCase() === BARCODE_PREFIX) {
    return trimmed.slice(BARCODE_PREFIX.length).trim();
  }
  return trimmed;
}

type ScannedOrder = ProductionOrder & {
  factory?: { name?: string; shortName?: string };
  machineType?: { name?: string; shortName?: string };
};

interface HistoryEntry {
  id: string;
  productionId: string;
  at: Date;
  status: 'success' | 'not-found' | 'error';
  message?: string;
}

export default function OrdersScanErrorPage() {
  const { has, isAdmin } = usePermission();
  if (!isAdmin && !has('page.scan_error')) {
    return <Navigate to={PATHS.ORDERS} replace />;
  }

  // User Fulfillment → có fulfillmentStage → bật chế độ "Hoàn thành công đoạn".
  // User không có stage (admin/support…) → giữ luồng gán lỗi như cũ.
  const profile = useAuthStore((s) => s.profile);
  const myStage = profile?.fulfillmentStage as FulfillmentStage | undefined;
  const myFactoryId = profile?.factoryId;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<ScannedOrder | null>(null);
  // Khi user Fulfillment bấm "Báo lỗi" trong dialog công đoạn → chuyển sang
  // dialog gán lỗi cho cùng đơn đó.
  const [errorMode, setErrorMode] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [mode, setMode] = useState<ScanMode>(() => {
    if (typeof window === 'undefined') return 'barcode';
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
    return saved === 'normal' ? 'normal' : 'barcode';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    }
  }, [mode]);

  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  // Auto-focus input mỗi khi modal đóng.
  useEffect(() => {
    if (!order) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [order]);

  const pushHistory = useCallback((entry: HistoryEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
  }, []);

  const handleLookup = useCallback(
    async (raw: string) => {
      const code = normalizeCode(raw, mode);
      if (!code) return;
      if (loading) return;
      setLoading(true);
      try {
        const res = await RepositoryRemote.order.getByProductionId(code);
        const data = res.data?.data as ScannedOrder | undefined;
        if (!data?._id) {
          toast.error('Không tìm thấy đơn với mã này');
          pushHistory({
            id: `${Date.now()}`,
            productionId: code,
            at: new Date(),
            status: 'not-found',
          });
          setValue('');
          return;
        }
        setOrder(data);
        setValue('');
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const msg = axios.isAxiosError(err)
          ? (err.response?.data as { message?: string })?.message || err.message
          : (err as Error).message;
        if (status === 404) {
          toast.error(msg || 'Không tìm thấy đơn với mã này');
        } else {
          toast.error(msg || 'Lỗi khi tra cứu đơn');
        }
        pushHistory({
          id: `${Date.now()}`,
          productionId: code,
          at: new Date(),
          status: status === 404 ? 'not-found' : 'error',
          message: msg,
        });
        setValue('');
      } finally {
        setLoading(false);
      }
    },
    [loading, mode, pushHistory],
  );

  const onSaved = useCallback(
    (summary: { errorName: string; targetLabel: string }) => {
      if (!order) return;
      pushHistory({
        id: `${Date.now()}`,
        productionId: order.productionId,
        at: new Date(),
        status: 'success',
        message: `${summary.errorName} · ${summary.targetLabel}`,
      });
    },
    [order, pushHistory],
  );

  const onCompleted = useCallback(
    (summary: { stageLabel: string }) => {
      if (!order) return;
      pushHistory({
        id: `${Date.now()}`,
        productionId: order.productionId,
        at: new Date(),
        status: 'success',
        message: `Hoàn thành ${summary.stageLabel}`,
      });
    },
    [order, pushHistory],
  );

  const onClose = useCallback(() => {
    setOrder(null);
    setErrorMode(false);
    // re-focus input handled by useEffect khi order = null
  }, []);

  const stats = useMemo(() => {
    return {
      total: history.length,
      success: history.filter((h) => h.status === 'success').length,
      notFound: history.filter((h) => h.status === 'not-found').length,
      error: history.filter((h) => h.status === 'error').length,
    };
  }, [history]);

  return (
    <div className="container mx-auto py-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-300">
          <ScanLine size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{myStage ? 'Quét hoàn thành / báo lỗi' : 'Quét mã'}</h1>
          <p className="text-sm text-muted-foreground">
            {myStage
              ? 'Cắm máy quét USB → quét barcode. Nếu đơn ở công đoạn của bạn → Enter để Hoàn thành, hoặc bấm Báo lỗi.'
              : 'Cắm máy quét USB → click vào ô input → quét barcode để mở dialog gán lỗi.'}
          </p>
        </div>
      </div>

      {/* Scan box */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        {/* Mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Chế độ:</span>
          <div className="inline-flex rounded-md border bg-muted/50 p-0.5">
            <ModeButton
              active={mode === 'barcode'}
              onClick={() => setMode('barcode')}
              icon={<ScanLine size={13} />}
              label="Barcode"
              hint={`Tự bỏ tiền tố "${BARCODE_PREFIX}"`}
            />
            <ModeButton
              active={mode === 'normal'}
              onClick={() => setMode('normal')}
              icon={<Keyboard size={13} />}
              label="Nhập tay"
              hint="Gõ Production ID trực tiếp"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            {mode === 'barcode' ? (
              <ScanLine
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            ) : (
              <Keyboard
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            )}
            <Input
              ref={inputRef}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLookup(value);
                }
              }}
              placeholder={
                mode === 'barcode'
                  ? `Quét barcode (kỳ vọng "${BARCODE_PREFIX}…")…`
                  : 'Nhập Production ID rồi Enter…'
              }
              className="pl-9 pr-3 h-11 text-sm font-mono"
              disabled={loading || !!order}
            />
            {loading && (
              <Loader2
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin"
              />
            )}
          </div>
          <Button
            onClick={() => handleLookup(value)}
            disabled={!value.trim() || loading || !!order}
          >
            Tra cứu
          </Button>
        </div>

        {/* Preview chuỗi đã normalize — chỉ hiện khi user gõ/quét và mã sau strip
            khác mã đang nhập (cho biết hệ thống sẽ search bằng cái gì). */}
        {value.trim() && (() => {
          const normalized = normalizeCode(value, mode);
          const changed = normalized !== value.trim();
          if (!changed && mode !== 'barcode') return null;
          return (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Sẽ tra cứu:</span>
              <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-foreground">
                {normalized || '(rỗng)'}
              </code>
              {changed && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  ✓ đã bỏ "{BARCODE_PREFIX}"
                </span>
              )}
              {mode === 'barcode' && !changed && value.trim() && (
                <span className="text-amber-600 dark:text-amber-400">
                  ⚠ không thấy tiền tố "{BARCODE_PREFIX}" — đảm bảo bạn đang quét đúng loại barcode
                </span>
              )}
            </div>
          );
        })()}

        <p className="text-[11px] text-muted-foreground">
          {mode === 'barcode'
            ? `Tip: máy quét USB hoạt động như bàn phím — chỉ cần ô input có focus, mã "${BARCODE_PREFIX}…" sẽ tự nhảy vào kèm Enter. Hệ thống tự bỏ tiền tố trước khi tra cứu.`
            : 'Tip: nhập đầy đủ Production ID (không có tiền tố) rồi nhấn Enter để tra cứu.'}
        </p>
      </div>

      {/* Recent history */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2 text-sm font-medium">
            <History size={14} />
            Lịch sử quét gần nhất
            <span className="text-muted-foreground font-normal">
              ({history.length}/{MAX_HISTORY})
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Stat label="Thành công" value={stats.success} color="emerald" />
            <Stat label="Không tìm thấy" value={stats.notFound} color="amber" />
            <Stat label="Lỗi" value={stats.error} color="rose" />
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setHistory([])}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <Trash2 size={12} /> Xoá
              </button>
            )}
          </div>
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Chưa có quét nào. Quét hoặc gõ Production ID để bắt đầu.
          </div>
        ) : (
          <ul className="divide-y">
            {history.map((h) => (
              <HistoryRow key={h.id} entry={h} />
            ))}
          </ul>
        )}
      </div>

      {order &&
        (myStage && !errorMode ? (
          <FulfillmentScanActionDialog
            order={order}
            myStage={myStage}
            myFactoryId={myFactoryId}
            onClose={onClose}
            onCompleted={onCompleted}
            onReportError={() => setErrorMode(true)}
          />
        ) : (
          <OrderErrorScanDialog order={order} onClose={onClose} onSaved={onSaved} />
        ))}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm border border-border'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'emerald' | 'amber' | 'rose';
}) {
  const cls = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
  }[color];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`font-semibold ${cls}`}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const icon = {
    success: <CheckCircle2 size={14} className="text-emerald-500" />,
    'not-found': <XCircle size={14} className="text-amber-500" />,
    error: <XCircle size={14} className="text-rose-500" />,
  }[entry.status];

  const statusText = {
    success: 'Đã gán lỗi',
    'not-found': 'Không tìm thấy',
    error: 'Lỗi',
  }[entry.status];

  return (
    <li className="flex items-start gap-2 p-2.5 text-xs">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{entry.productionId}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{statusText}</span>
        </div>
        {entry.message && (
          <div className="text-muted-foreground truncate mt-0.5">{entry.message}</div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">
        {entry.at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </li>
  );
}

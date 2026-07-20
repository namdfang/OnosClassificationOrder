import React, { useEffect, useMemo, useState } from 'react';
import { ListChecks, Loader2, Search } from 'lucide-react';

import { RepositoryRemote } from '@/services';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

import { handleAxiosError } from '@/utils';

/** Nhãn ngắn cho từng chặng fulfillment — hiện ở cột "Chặng" chế độ lookup. */
const STAGE_SHORT: Record<string, string> = {
  print: 'In',
  press: 'Ép',
  'qc-post-press': 'QC ép',
  'sew-in': 'May vào',
  'sew-out': 'May ra',
  pack: 'Đóng',
};

/**
 * Tách textarea → mảng productionId: cắt theo xuống dòng / phẩy / khoảng trắng,
 * trim, bỏ rỗng, loại trùng (không phân biệt hoa thường, giữ mã gõ đầu tiên).
 */
export function parseProductionIds(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const id = raw.trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

interface LookupRow {
  _id: string;
  productionId: string;
  type?: string;
  color?: string;
  size?: string;
  status?: string;
  currentFulfillmentStage?: string;
  fulfillmentCompletedAt?: string | null;
}

interface BulkProductionIdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `filter` — chỉ thu thập danh sách mã rồi trả về cho parent lọc bảng chính.
   * `lookup` — tự query & hiện bảng kết quả trong modal, click 1 dòng → onPick.
   */
  mode: 'filter' | 'lookup';
  /** mode=filter: áp danh sách mã lên bảng ngoài. */
  onApply?: (ids: string[]) => void;
  /** mode=lookup: chọn 1 đơn để xem chi tiết/hành trình. */
  onPick?: (productionId: string) => void;
  /**
   * Danh sách mã đang áp (nếu có) — seed lại textarea mỗi lần mở modal để user
   * thấy & sửa những mã đã dán trước đó thay vì ô trống.
   */
  initialIds?: string[];
}

export function BulkProductionIdDialog({
  open,
  onOpenChange,
  mode,
  onApply,
  onPick,
  initialIds,
}: BulkProductionIdDialogProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LookupRow[] | null>(null);

  const ids = useMemo(() => parseProductionIds(text), [text]);

  // Mỗi lần mở modal → seed textarea từ danh sách mã đang áp (mode filter). Chỉ
  // chạy khi `open` chuyển thành true để không đè lên nội dung user đang gõ.
  useEffect(() => {
    if (open) {
      setText(initialIds && initialIds.length ? initialIds.join('\n') : '');
      setRows(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reset = () => {
    setText('');
    setRows(null);
    setLoading(false);
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const missingIds = useMemo(() => {
    if (!rows) return [];
    const found = new Set(rows.map((r) => r.productionId.toLowerCase()));
    return ids.filter((id) => !found.has(id.toLowerCase()));
  }, [rows, ids]);

  const applyFilter = () => {
    if (!ids.length) return;
    onApply?.(ids);
    close();
  };

  const runLookup = async () => {
    if (!ids.length) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('productionIds', ids.join(','));
      params.set('page', '1');
      params.set('limit', String(Math.min(Math.max(ids.length, 20), 500)));
      const resp = await RepositoryRemote.order.getOrders(`?${params.toString()}`);
      setRows((resp.data.data || []) as LookupRow[]);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  const stageLabel = (r: LookupRow): string => {
    if (r.fulfillmentCompletedAt) return 'Hoàn thành';
    if (r.currentFulfillmentStage) return STAGE_SHORT[r.currentFulfillmentStage] ?? r.currentFulfillmentStage;
    return '—';
  };

  const primaryLabel = mode === 'filter' ? 'Lọc bảng' : 'Tìm';
  const onPrimary = mode === 'filter' ? applyFilter : runLookup;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks size={18} className="text-primary" />
            Tìm nhiều Production ID
          </DialogTitle>
          <DialogDescription>
            Dán danh sách mã, mỗi Production ID một dòng (hoặc cách nhau bằng dấu phẩy / khoảng trắng).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onPrimary();
              }
            }}
            placeholder={'N-12345\nN-12346\nN-12347'}
            className="min-h-[180px] font-mono text-xs"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Đã nhập <span className="font-semibold text-foreground">{ids.length}</span> mã
            </span>
            <span className="opacity-70">Ctrl/⌘ + Enter để tìm</span>
          </div>
        </div>

        {mode === 'lookup' && rows && (
          <div className="rounded-md border border-border max-h-[320px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Production ID</th>
                  <th className="px-3 py-2 font-medium">Sản phẩm</th>
                  <th className="px-3 py-2 font-medium">Chặng</th>
                  <th className="px-3 py-2 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      Không tìm thấy đơn nào khớp.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const variant = [r.color, r.size].filter(Boolean).join(' / ');
                  return (
                    <tr
                      key={r._id}
                      onClick={() => {
                        onPick?.(r.productionId);
                        close();
                      }}
                      className="border-t border-border hover:bg-accent/60 cursor-pointer"
                    >
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{r.productionId}</td>
                      <td className="px-3 py-2">
                        <div className="text-xs font-medium text-foreground truncate max-w-[220px]">
                          {r.type || '—'}
                        </div>
                        {variant && <div className="text-[11px] text-muted-foreground">{variant}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs">{stageLabel(r)}</td>
                      <td className="px-3 py-2">
                        {r.status ? (
                          <Badge variant="outline" className="text-[11px]">
                            {r.status}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {mode === 'lookup' && rows && missingIds.length > 0 && (
          <div className="text-xs text-amber-600 dark:text-amber-400">
            Không tìm thấy {missingIds.length} mã: <span className="font-mono">{missingIds.join(', ')}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Đóng
          </Button>
          <Button onClick={onPrimary} disabled={!ids.length || loading}>
            {loading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : mode === 'filter' ? (
              <ListChecks size={15} />
            ) : (
              <Search size={15} />
            )}
            {primaryLabel}
            {ids.length > 0 && ` (${ids.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

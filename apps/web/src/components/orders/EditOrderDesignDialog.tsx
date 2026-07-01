import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { DesignFields } from 'shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';
import type { WorkshopOrderRow } from '@/components/orders/workshopTableConfig';

interface Props {
  order: WorkshopOrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nhận order đã cập nhật từ BE → caller patch local (không refetch). */
  onDone: (updated: WorkshopOrderRow) => void;
}

const MOCKUP_KEY = '__mockup__';

/** Giá trị URL hiện tại của 1 field (ưu tiên original/raw). */
function currentUrl(order: WorkshopOrderRow, key: string): string {
  if (key === MOCKUP_KEY) return order.mockupOriginalUrl || order.mockupUrl || '';
  return order.designsOriginal?.[key] || order.designs?.[key] || '';
}

export function EditOrderDesignDialog({ order, open, onOpenChange, onDone }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Các field hiển thị = Mockup + CHỈ các vị trí design đơn ĐANG CÓ (giá trị khác rỗng).
  const fields = useMemo<{ key: string; label: string }[]>(() => {
    if (!order) return [];
    const designKeys = Object.entries(order.designs || {})
      .filter(([, v]) => !!v)
      .map(([k]) => k);
    return [
      { key: MOCKUP_KEY, label: 'Mockup' },
      ...designKeys.map((k) => ({ key: k, label: k })),
    ];
  }, [order]);

  useEffect(() => {
    if (order && open) {
      const init: Record<string, string> = {};
      for (const f of fields) init[f.key] = currentUrl(order, f.key);
      setValues(init);
    }
  }, [order, open, fields]);

  const submit = async () => {
    if (!order) return;
    // Chỉ gửi field có thay đổi so với giá trị hiện tại.
    const designs: Partial<DesignFields> = {};
    let mockupUrl: string | undefined;
    for (const f of fields) {
      const next = (values[f.key] ?? '').trim();
      if (next === currentUrl(order, f.key)) continue;
      if (f.key === MOCKUP_KEY) mockupUrl = next;
      else (designs as Record<string, string>)[f.key] = next;
    }
    if (mockupUrl === undefined && Object.keys(designs).length === 0) {
      toast.info('Không có thay đổi nào');
      return;
    }
    try {
      setLoading(true);
      const res = await RepositoryRemote.order.updateOrderDesign(order._id, {
        ...(mockupUrl !== undefined ? { mockupUrl } : {}),
        ...(Object.keys(designs).length ? { designs } : {}),
      });
      toast.success('Đã cập nhật design');
      onOpenChange(false);
      onDone((res.data?.data as WorkshopOrderRow) ?? order);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Đổi design</DialogTitle>
          <DialogDescription>
            {order ? (
              <span className="text-xs">
                <span className="font-mono font-semibold text-foreground">{order.productionId}</span>
                {order.type ? ` · ${order.type}` : ''} — dán URL mới. URL cũ được lưu trong Lịch sử đơn.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="text-xs font-medium text-foreground capitalize">{f.label}</label>
              <Input
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder="https://…"
                className="text-xs"
              />
            </div>
          ))}
          {fields.length <= 1 && (
            <p className="text-[11px] text-muted-foreground italic">Đơn chưa có vị trí design nào ngoài mockup.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Đóng
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

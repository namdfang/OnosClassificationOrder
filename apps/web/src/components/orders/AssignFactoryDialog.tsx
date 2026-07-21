import React, { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { Factory } from 'shared';
import { WorkshopConfigCategory } from 'shared';
import { toast } from 'sonner';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { handleAxiosError } from '@/utils';

import type { WorkshopOrderRow } from './workshopTableConfig';

/** Compact select cho 4 optional field trong AssignFactoryDialog. */
function AssignSelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label} (tùy chọn)</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">— Không gán —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Dialog "Gán xưởng" — initial-assign factory (+ optional fabric/machine/tool
 * mặc định) cho đơn UNMAPPED. Dùng chung bởi trang "Không xác định xưởng".
 *  - Form:   factory (required) + 4 optional select (loại vải / phòng / máy / tool).
 *  - Source options:
 *      • factory     ← tự fetch qua `factory.getFactories()` khi dialog mở.
 *      • fabric/machine/toolResult ← `useWorkshopConfigStore` (full catalog).
 *      • machineType ← fetch on dialog open (machineType.getMachineTypes).
 */
export function AssignFactoryDialog({
  open,
  onOpenChange,
  ids,
  single,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ids: string[];
  single?: WorkshopOrderRow;
  onSuccess: () => void;
}) {
  const [factoryId, setFactoryId] = useState('');
  const [fabricType, setFabricType] = useState('');
  const [machineTypeId, setMachineTypeId] = useState('');
  const [machineNumber, setMachineNumber] = useState('');
  const [toolResult, setToolResult] = useState('');
  const [saving, setSaving] = useState(false);
  const [machineTypes, setMachineTypes] = useState<Array<{ _id: string; name: string; shortName?: string }>>([]);
  const [factories, setFactories] = useState<Factory[]>([]);

  const fabricOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.FabricType] || []);
  const machineOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.Machine] || []);
  const toolOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.ToolResult] || []);

  // Reset form mỗi lần dialog mở (kể cả khi đổi single → bulk).
  useEffect(() => {
    if (!open) return;
    setFactoryId('');
    setFabricType('');
    setMachineTypeId('');
    setMachineNumber('');
    setToolResult('');
  }, [open, ids.join(',')]);

  // Lazy load machineTypes + factories lần đầu mở dialog.
  useEffect(() => {
    if (!open || machineTypes.length > 0) return;
    RepositoryRemote.machineType
      .getMachineTypes()
      .then((res) => {
        const data = (res.data?.data || []) as Array<{ _id: string; name: string; shortName?: string }>;
        setMachineTypes(data);
      })
      .catch((err) => handleAxiosError(err));
  }, [open, machineTypes.length]);

  useEffect(() => {
    if (!open || factories.length > 0) return;
    RepositoryRemote.factory
      .getFactories()
      .then((res) => {
        const data = (res.data?.data || []) as Factory[];
        setFactories(data);
      })
      .catch((err) => handleAxiosError(err));
  }, [open, factories.length]);

  const submit = async () => {
    if (!factoryId) {
      toast.error('Chọn xưởng');
      return;
    }
    try {
      setSaving(true);
      const res = await RepositoryRemote.order.bulkAssignOrders({
        ids,
        factoryId,
        fabricType: fabricType || undefined,
        machineTypeId: machineTypeId || undefined,
        machineNumber: machineNumber || undefined,
        toolResult: toolResult || undefined,
      });
      const data = res.data?.data || { matched: 0, modified: 0 };
      if (data.modified === 0) {
        toast.warning('Không có đơn nào được cập nhật (có thể đã được gán từ trước).');
      } else {
        toast.success(`Đã gán ${data.modified}/${data.matched} đơn`);
      }
      onSuccess();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  // Design links — collect all positions có URL, ưu tiên originalUrl (mở
  // trong tab mới = bypass thumbnail).
  const designLinks = useMemo(() => {
    if (!single) return [] as Array<{ position: string; url: string }>;
    const orig = single.designsOriginal || {};
    const thumb = single.designs || {};
    const positions = Array.from(new Set([...Object.keys(orig), ...Object.keys(thumb)]));
    return positions
      .map((pos) => {
        const url =
          (orig as Record<string, string | undefined>)[pos] || (thumb as Record<string, string | undefined>)[pos];
        return url ? { position: pos, url } : null;
      })
      .filter((x): x is { position: string; url: string } => !!x);
  }, [single]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {single ? `Gán xưởng cho đơn ${single.productionId}` : `Gán xưởng cho ${ids.length} đơn đã chọn`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {single && (
            <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  <span className="text-muted-foreground">ID:</span>{' '}
                  <span className="font-mono font-semibold">{single.productionId}</span>
                </span>
                {single.type && (
                  <span>
                    <span className="text-muted-foreground">Sản phẩm:</span>{' '}
                    <span className="font-semibold">{single.type}</span>
                  </span>
                )}
                {single.size && (
                  <span>
                    <span className="text-muted-foreground">Size:</span>{' '}
                    <span className="font-semibold">{single.size}</span>
                  </span>
                )}
                {(single as unknown as { quantity?: number }).quantity != null && (
                  <span>
                    <span className="text-muted-foreground">SL:</span>{' '}
                    <span className="font-semibold tabular-nums">
                      {(single as unknown as { quantity?: number }).quantity}
                    </span>
                  </span>
                )}
              </div>
              {designLinks.length > 0 && (
                <div className="pt-1">
                  <span className="text-muted-foreground">Design:</span>{' '}
                  {designLinks.map((d, i) => (
                    <a
                      key={i}
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline mr-2"
                    >
                      {d.position}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs">
              Xưởng <span className="text-rose-600">*</span>
            </Label>
            <select
              value={factoryId}
              onChange={(e) => setFactoryId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">— Chọn xưởng —</option>
              {factories.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.shortName ? `${f.shortName} · ${f.name}` : f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <AssignSelectField
              label="Loại vải"
              value={fabricType}
              onChange={setFabricType}
              options={fabricOptions.map((o) => ({ value: o.code, label: o.name || o.code }))}
            />
            <AssignSelectField
              label="Phòng"
              value={machineTypeId}
              onChange={setMachineTypeId}
              options={machineTypes.map((m) => ({
                value: m._id,
                label: m.shortName ? `${m.shortName} · ${m.name}` : m.name,
              }))}
            />
            <AssignSelectField
              label="Máy"
              value={machineNumber}
              onChange={setMachineNumber}
              options={machineOptions.map((o) => ({ value: o.code, label: o.name || o.code }))}
            />
            <AssignSelectField
              label="Tool"
              value={toolResult}
              onChange={setToolResult}
              options={toolOptions.map((o) => ({ value: o.code, label: o.name || o.code }))}
            />
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Chỉ <strong>Xưởng</strong> là bắt buộc. 4 trường còn lại có thể bỏ trống để gán sau qua bảng đơn hàng. Đơn
            đã có xưởng từ trước sẽ bị bỏ qua (dùng "Chuyển xưởng" thay thế).
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={saving || !factoryId}>
            {saving ? <Spinner size={13} /> : <MapPin size={13} />}
            Gán xưởng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

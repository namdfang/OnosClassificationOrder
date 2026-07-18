import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, Flag, PauseCircle, PlayCircle, UserPlus, X } from 'lucide-react';
import type { OrderWorkshopField, WorkshopConfigCategory } from 'shared';
import { ORDER_PRIORITIES, ORDER_PRIORITY_LABELS, ORDER_WORKSHOP_FIELDS } from 'shared';
import { toast } from 'sonner';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

import { handleAxiosError } from '@/utils';
import { canUserHold } from '@/utils/orderActions';

import { usePermission } from '@/hooks/usePermission';
import { buildDetailOnlyWorkbook, downloadWorkbook, type ExportableOrder } from '@/pages/home/exportOrders';
import { LucideIcon } from '@/pages/workshop-config/IconPicker';

import { AssignDesignerDialog } from './AssignDesignerDialog';

const FIELD_TO_CATEGORY: Record<OrderWorkshopField, WorkshopConfigCategory | null> = {
  printStatus: 'print_status' as WorkshopConfigCategory,
  printStatusNote: 'print_status_note' as WorkshopConfigCategory,
  toolResult: 'tool_result' as WorkshopConfigCategory,
  toolResultNote: 'tool_result_note' as WorkshopConfigCategory,
  errorFile: 'error_file_type' as WorkshopConfigCategory,
  errorFileNote: null,
  // Assignee đã chuyển sang userId — bulk update dùng "Gán design" dialog
  // riêng, không qua workshop_config dropdown.
  assignee: null,
  assigneeNote: 'assignee_note' as WorkshopConfigCategory,
  fabricType: 'fabric_type' as WorkshopConfigCategory,
  machineNumber: 'machine' as WorkshopConfigCategory,
  productionError: 'production_error' as WorkshopConfigCategory,
  productionErrorNote: null,
  productionErrorSource: null,
  // Ưu tiên có nút + dialog bulk riêng (giống "Gán design") — không qua dropdown "Bulk update".
  priority: null,
};

const FIELD_LABEL: Record<OrderWorkshopField, string> = {
  printStatus: 'Trạng thái in',
  printStatusNote: 'Note trạng thái in',
  toolResult: 'Kết quả Tool',
  toolResultNote: 'Note kq Tool',
  errorFile: 'File sửa lỗi',
  errorFileNote: 'Ghi chú file lỗi',
  assignee: 'Người thực hiện',
  assigneeNote: 'Note người thực hiện',
  fabricType: 'Loại vải',
  machineNumber: 'Máy',
  productionError: 'Lỗi xưởng',
  productionErrorNote: 'Mô tả lỗi xưởng',
  productionErrorSource: 'Loại lỗi (des/xưởng)',
  priority: 'Ưu tiên',
};

/** Bulk update dropdown SKIP assignee + priority — đã có nút/dialog riêng ("Gán design" / "Ưu tiên"). */
const BULK_UPDATE_BLACKLIST: OrderWorkshopField[] = ['assignee', 'priority'];

interface Props {
  selectedIds: string[];
  onClear: () => void;
  onApplied: () => void;
}

export function BulkEditToolbar({ selectedIds, onClear, onApplied }: Props) {
  const { canEditField, roleName } = usePermission();
  const byCategory = useWorkshopConfigStore((s) => s.byCategory);
  const resolveWorkshop = useWorkshopConfigStore((s) => s.resolve);
  const canHold = canUserHold(roleName);

  const [open, setOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [field, setField] = useState<OrderWorkshopField | ''>('');
  const [value, setValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [holding, setHolding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [priorityValue, setPriorityValue] = useState('');
  const [applyingPriority, setApplyingPriority] = useState(false);

  // Export ĐÚNG các đơn đang tick chọn — gọi /orders/export với `ids` (bỏ qua
  // phân trang, đúng cả khi chọn xuyên trang vì BE lọc theo `_id`). Chỉ 1 sheet
  // "Chi tiết đơn"; tên workshop_config resolve client-side qua store.
  const handleExport = async () => {
    try {
      setExporting(true);
      const res = await RepositoryRemote.order.exportOrders('?ids=' + selectedIds.join(','));
      const data = (res.data?.data || []) as ExportableOrder[];
      if (data.length === 0) {
        toast.warning('Không có đơn nào để xuất');
        return;
      }
      const wb = buildDetailOnlyWorkbook(data, { resolve: resolveWorkshop });
      const stamp = new Date().toLocaleString('sv-SE', { hour12: false }).replace(/[: ]/g, '-');
      downloadWorkbook(`don-hang-chon-${stamp}.xlsx`, wb);
      toast.success(`Đã xuất ${data.length} đơn`);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setExporting(false);
    }
  };

  const submitHold = async (hold: boolean, reason?: string) => {
    try {
      setHolding(true);
      const res = await RepositoryRemote.order.bulkHold({ ids: selectedIds, hold, reason });
      const { matched, modified } = res.data?.data || { matched: 0, modified: 0 };
      toast.success(hold ? `Đã giữ ${modified}/${matched} đơn` : `Đã mở giữ ${modified}/${matched} đơn`);
      setHoldOpen(false);
      setHoldReason('');
      onApplied();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setHolding(false);
    }
  };

  const submitPriority = async () => {
    try {
      setApplyingPriority(true);
      const res = await RepositoryRemote.order.bulkUpdateField({
        ids: selectedIds,
        field: 'priority',
        value: priorityValue || null,
      });
      const { matched, modified } = res.data?.data || { matched: 0, modified: 0 };
      toast.success(`Đã update ${modified}/${matched} đơn`);
      setPriorityOpen(false);
      setPriorityValue('');
      onApplied();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setApplyingPriority(false);
    }
  };

  const editableFields = useMemo(
    () => ORDER_WORKSHOP_FIELDS.filter((f) => canEditField(f) && !BULK_UPDATE_BLACKLIST.includes(f)),
    [canEditField],
  );

  const category = field ? FIELD_TO_CATEGORY[field] : null;
  const options = category ? byCategory[category] : [];

  const handleConfirm = async () => {
    if (!field) return toast.error('Chọn field');
    const sendValue = category ? value : freeText;
    try {
      setSaving(true);
      const res = await RepositoryRemote.order.bulkUpdateField({
        ids: selectedIds,
        field,
        value: sendValue || null,
      });
      const { matched, modified } = res.data?.data || { matched: 0, modified: 0 };
      toast.success(`Đã update ${modified}/${matched} đơn`);
      setOpen(false);
      setField('');
      setValue('');
      setFreeText('');
      onApplied();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  if (selectedIds.length === 0) return null;

  return (
    <>
      <div className="sticky bottom-3 z-30 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-card shadow-lg px-4 py-2">
          <CheckCircle2 size={16} className="text-primary" />
          <span className="text-sm">
            Đã chọn <span className="font-semibold">{selectedIds.length}</span> đơn
          </span>
          <Button size="sm" onClick={() => setOpen(true)} disabled={editableFields.length === 0}>
            Bulk update
          </Button>
          {canEditField('assignee') && (
            <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>
              <UserPlus size={14} /> Gán design
            </Button>
          )}
          {canEditField('priority') && (
            <Button size="sm" variant="secondary" onClick={() => setPriorityOpen(true)}>
              <Flag size={14} /> Ưu tiên
            </Button>
          )}
          {canHold && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30"
                onClick={() => setHoldOpen(true)}
                disabled={holding}
              >
                <PauseCircle size={14} /> Giữ đơn
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-emerald-700 dark:text-emerald-300"
                onClick={() => submitHold(false)}
                disabled={holding}
              >
                <PlayCircle size={14} /> Mở giữ
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            title="Xuất Excel các đơn đang chọn"
          >
            {exporting ? <Spinner size={13} className="text-muted-foreground" /> : <Download size={13} />}
            Xuất Excel
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X size={14} /> Bỏ chọn
          </Button>
        </div>
      </div>

      <AssignDesignerDialog
        open={assignOpen}
        selectedIds={selectedIds}
        onClose={() => setAssignOpen(false)}
        onApplied={onApplied}
      />

      <Dialog
        open={priorityOpen}
        onOpenChange={(o) => (o ? setPriorityOpen(true) : (setPriorityValue(''), setPriorityOpen(false)))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi mức ưu tiên {selectedIds.length} đơn</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Mức ưu tiên</label>
            <select
              value={priorityValue}
              onChange={(e) => setPriorityValue(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              autoFocus
            >
              <option value="">— Bỏ ưu tiên —</option>
              {ORDER_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {ORDER_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPriorityOpen(false)} disabled={applyingPriority}>
              Đóng
            </Button>
            <Button onClick={submitPriority} disabled={applyingPriority}>
              {applyingPriority && <Spinner size={13} className="mr-1.5" />}
              Áp dụng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={holdOpen} onOpenChange={(o) => (o ? setHoldOpen(true) : (setHoldReason(''), setHoldOpen(false)))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Giữ {selectedIds.length} đơn</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Lý do giữ (không bắt buộc)</label>
            <Textarea
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value.slice(0, 200))}
              placeholder="VD: chờ khách xác nhận, thiếu vật tư…"
              rows={3}
              autoFocus
            />
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Đơn giữ sẽ bị khóa mọi thao tác + tô xám cho tới khi mở lại. Đơn đã hủy sẽ bị bỏ qua.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHoldOpen(false)} disabled={holding}>
              Đóng
            </Button>
            <Button onClick={() => submitHold(true, holdReason.trim() || undefined)} disabled={holding}>
              {holding && <Spinner size={13} className="mr-1.5" />}
              Giữ đơn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cập nhật {selectedIds.length} đơn</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Field</label>
              <select
                value={field}
                onChange={(e) => {
                  setField(e.target.value as OrderWorkshopField);
                  setValue('');
                  setFreeText('');
                }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Chọn field —</option>
                {editableFields.map((f) => (
                  <option key={f} value={f}>
                    {FIELD_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>

            {field && category && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Giá trị mới</label>
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Bỏ chọn —</option>
                  {options.map((it) => (
                    <option key={it._id} value={it.code}>
                      {it.name}
                    </option>
                  ))}
                </select>
                {value && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {(() => {
                      const opt = options.find((o) => o.code === value);
                      if (!opt) return null;
                      return (
                        <>
                          {opt.color ? (
                            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: opt.color }} />
                          ) : (
                            <LucideIcon name={opt.icon} size={12} />
                          )}
                          <span>{opt.name}</span>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {field && !category && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Text mới (để trống = xóa)</label>
                <input
                  type="text"
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  placeholder="Ghi chú..."
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Hành động sẽ ghi log audit cho từng đơn (Phase 3). Không undo được.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleConfirm} disabled={!field || saving}>
              {saving && <Spinner size={13} className="mr-1.5" />}
              Áp dụng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

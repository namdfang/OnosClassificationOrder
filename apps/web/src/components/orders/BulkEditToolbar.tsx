import React, { useMemo, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { OrderWorkshopField, WorkshopConfigCategory } from 'shared';
import { ORDER_WORKSHOP_FIELDS } from 'shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';
import { usePermission } from '@/hooks/usePermission';

import { LucideIcon } from '@/pages/workshop-config/IconPicker';

const FIELD_TO_CATEGORY: Record<OrderWorkshopField, WorkshopConfigCategory | null> = {
  printStatus: 'print_status' as WorkshopConfigCategory,
  printStatusNote: 'print_status_note' as WorkshopConfigCategory,
  toolResult: 'tool_result' as WorkshopConfigCategory,
  toolResultNote: 'tool_result_note' as WorkshopConfigCategory,
  errorFile: 'error_file_type' as WorkshopConfigCategory,
  errorFileNote: null,
  assignee: 'assignee' as WorkshopConfigCategory,
  assigneeNote: 'assignee_note' as WorkshopConfigCategory,
  fabricType: 'fabric_type' as WorkshopConfigCategory,
  productionError: 'production_error' as WorkshopConfigCategory,
  productionErrorNote: null,
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
  productionError: 'Lỗi xưởng',
  productionErrorNote: 'Mô tả lỗi xưởng',
};

interface Props {
  selectedIds: string[];
  onClear: () => void;
  onApplied: () => void;
}

export function BulkEditToolbar({ selectedIds, onClear, onApplied }: Props) {
  const { canEditField } = usePermission();
  const byCategory = useWorkshopConfigStore((s) => s.byCategory);

  const [open, setOpen] = useState(false);
  const [field, setField] = useState<OrderWorkshopField | ''>('');
  const [value, setValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [freeText, setFreeText] = useState('');

  const editableFields = useMemo(
    () => ORDER_WORKSHOP_FIELDS.filter((f) => canEditField(f)),
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
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X size={14} /> Bỏ chọn
          </Button>
        </div>
      </div>

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

import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { PRODUCT_LEVEL_MAP, PRODUCT_LEVELS } from 'shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';
import type { ProductConfigRow } from './ProductConfigTab';

interface Option {
  code: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ProductConfigRow | null;
  fabricOptions: Option[];
  toolOptions: Option[];
  /** Cập nhật lạc quan sau khi lưu. */
  onSaved: (id: string, patch: Partial<ProductConfigRow>) => void;
  /** Xoá sản phẩm (đóng dialog sau đó). */
  onDelete: (id: string) => void;
}

const selectCls =
  'w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function ProductConfigEditDialog({
  open,
  onOpenChange,
  item,
  fabricOptions,
  toolOptions,
  onSaved,
  onDelete,
}: Props) {
  const [mockup, setMockup] = useState('');
  const [level, setLevel] = useState<string>('');
  const [fabricType, setFabricType] = useState('');
  const [toolResult, setToolResult] = useState('');
  const [guide, setGuide] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setMockup(item.mockup || '');
      setLevel(item.level != null ? String(item.level) : '');
      setFabricType(item.fabricType || '');
      setToolResult(item.toolResult || '');
      setGuide(item.guide || '');
    }
  }, [item]);

  if (!item) return null;

  const handleSave = async () => {
    const patch: Partial<ProductConfigRow> = {
      mockup: mockup.trim(),
      level: level ? Number(level) : undefined,
      fabricType: fabricType || undefined,
      toolResult: toolResult || undefined,
      guide: guide.trim(),
    };
    try {
      setSaving(true);
      await RepositoryRemote.productConfig.updateProductConfig(item._id, patch as never);
      onSaved(item._id, patch);
      onOpenChange(false);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSaving(false);
    }
  };

  const levelColor = level ? PRODUCT_LEVEL_MAP[Number(level)]?.color : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa sản phẩm</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm">
            <span className="font-medium">{item.fullName}</span>{' '}
            <span className="text-muted-foreground">({item.shortName})</span>
          </div>

          {/* Mockup */}
          <div className="space-y-1.5">
            <Label>Mockup (URL ảnh)</Label>
            <div className="flex items-start gap-3">
              {mockup ? (
                <a href={mockup} target="_blank" rel="noreferrer" title="Mở ảnh">
                  <img
                    src={mockup}
                    alt="mockup"
                    className="w-16 h-16 rounded object-cover border border-border bg-muted"
                  />
                </a>
              ) : (
                <div className="w-16 h-16 rounded border border-dashed border-border shrink-0" />
              )}
              <Input
                value={mockup}
                onChange={(e) => setMockup(e.target.value)}
                placeholder="https://…"
                className="flex-1"
              />
            </div>
          </div>

          {/* Level */}
          <div className="space-y-1.5">
            <Label>Level</Label>
            <div className="flex items-center gap-2">
              {level && (
                <span
                  className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-white shrink-0"
                  style={{ backgroundColor: levelColor }}
                >
                  Lv {level}
                </span>
              )}
              <select value={level} onChange={(e) => setLevel(e.target.value)} className={selectCls}>
                <option value="">— Chưa chọn —</option>
                {PRODUCT_LEVELS.map((lv) => (
                  <option key={lv.value} value={lv.value}>
                    {lv.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Loại vải */}
            <div className="space-y-1.5">
              <Label>Loại vải</Label>
              <select value={fabricType} onChange={(e) => setFabricType(e.target.value)} className={selectCls}>
                <option value="">— Chưa chọn —</option>
                {fabricOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Kết quả Tool */}
            <div className="space-y-1.5">
              <Label>Kết quả Tool</Label>
              <select value={toolResult} onChange={(e) => setToolResult(e.target.value)} className={selectCls}>
                <option value="">— Chưa chọn —</option>
                {toolOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Hướng dẫn */}
          <div className="space-y-1.5">
            <Label>Hướng dẫn</Label>
            <Textarea
              value={guide}
              onChange={(e) => setGuide(e.target.value)}
              placeholder="Hướng dẫn / ghi chú sản phẩm…"
              rows={4}
            />
          </div>
        </div>

        <DialogFooter className="flex items-center sm:justify-between gap-2">
          {/* <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              onOpenChange(false);
              onDelete(item._id);
            }}
          >
            <Trash2 size={14} />
            Xóa sản phẩm
          </Button> */}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Spinner size={14} />}
              Lưu
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

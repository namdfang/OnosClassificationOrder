import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';

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
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';

const EXAMPLE = `Tên đầy đủ sản phẩm có tool Rập	Tên viết tắt	Máy	Xưởng	Loại vải	Kết quả Tool	Phòng
All-over Print Hockey Jersey	hockey Jersey thường	94	MÊ LINH	POLY 2 DA		IN và CẮT LASER
All-Over Print V-neck Soccer Jersey	T-shirt cổ tim	27	MÊ LINH	MÈ 64		IN và CẮT LASER
AOP Long-Sleeve Polo Collar Football Jersey	POLO MXC DÀI TAY		MÊ LINH	MÈ 64	không tool	IN và CẮT LASER
Rectangle Fence Flag	cờ bán nguyệt	94	MÊ LINH	LỤA 4B		IN và CẮT LASER`;

interface ParsedRow {
  fullName: string;
  shortName: string;
  machineNumber?: string;
  factoryLabel: string;
  fabricLabel?: string;
  toolResultLabel?: string;
  departmentLabel: string;
}

const HEADER_KEYWORDS = ['tên đầy đủ', 'tên viết tắt', 'máy', 'xưởng', 'loại vải', 'phòng'];

function parseRows(raw: string): ParsedRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const firstLower = lines[0].toLowerCase();
  const startIdx = HEADER_KEYWORDS.some((kw) => firstLower.includes(kw)) ? 1 : 0;

  const rows: ParsedRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split('\t').map((c) => c.trim());
    if (cols.length < 7) continue;
    const [
      fullName,
      shortName,
      machineNumber,
      factoryLabel,
      fabricLabel,
      toolResultLabel,
      departmentLabel,
    ] = cols;
    if (!fullName || !shortName || !factoryLabel || !departmentLabel) continue;
    rows.push({
      fullName,
      shortName,
      machineNumber: machineNumber || undefined,
      factoryLabel,
      fabricLabel: fabricLabel || undefined,
      toolResultLabel: toolResultLabel || undefined,
      departmentLabel,
    });
  }
  return rows;
}

interface ImportProductConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ImportProductConfigDialog({ open, onOpenChange, onSuccess }: ImportProductConfigDialogProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const rows = parseRows(text);
    if (rows.length === 0) {
      toast.error('Không parse được dòng nào. Kiểm tra format (đủ 7 cột, cách nhau bằng Tab).');
      return;
    }

    try {
      setLoading(true);
      const resp = await RepositoryRemote.productConfig.importProductConfigs({ rows });
      const { imported, updated, skipped } = resp.data.data;
      toast.success(`Imported ${imported}, updated ${updated}, ${skipped.length} cảnh báo`);
      if (skipped.length > 0) {
        // eslint-disable-next-line no-console
        console.warn('Import warnings:', skipped);
      }
      setText('');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Product Config</DialogTitle>
          <DialogDescription>
            Paste dữ liệu từ Excel (tab-separated). 7 cột theo thứ tự: <b>Tên đầy đủ</b> —{' '}
            <b>Tên viết tắt</b> — <b>Máy</b> (số máy, vd 94/27, để trống = không có tool) —{' '}
            <b>Xưởng</b> (vd "MÊ LINH") — <b>Loại vải</b> (POLY 2 DA, MÈ 64, LỤA 4B, LỤA VÂN GỖ…) —{' '}
            <b>Kết quả Tool</b> (để trống = có tool; "không tool" = không có tool) — <b>Phòng</b>{' '}
            (loại máy in, vd "IN và CẮT LASER"). Hệ thống match label theo tên (case-insensitive).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            rows={12}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            {parseRows(text).length} dòng hợp lệ sẽ được import.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Hủy
          </Button>
          <Button onClick={handleImport} disabled={loading || !text.trim()}>
            {loading ? <Spinner size={14} className="text-primary-foreground" /> : <Upload size={14} />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

const EXAMPLE = `Tên đầy đủ sản phẩm có tool Rập	Tên viết tắt	Loại máy tính chạy sản phẩm 694	Máy	Xưởng	Loại vải	Kết quả Tool
all over print christmas ugly sweater	CHRISTMAS		IEN	ML	Cotton Jersey	Có Tool
aop women's briefs	WOM		ICL	US	Polyester Jersey:	Không có Tool
all-over print kids and youth baseball jersey	BRKIDS		HT	TN	2D	Có Tool
all-over print football jersey	FB		IEN	ML	G5000	Không có Tool`;

interface ParsedRow {
  fullName: string;
  shortName: string;
  computerType?: string;
  machineCode: string;
  factoryCode: string;
  fabricLabel?: string;
  toolResultLabel?: string;
}

function parseRows(raw: string): ParsedRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  // Skip header if first row's 5th cell isn't a known factory code (header
  // would have "Xưởng" or similar at that position).
  const firstCols = lines[0].split('\t').map((c) => c.trim());
  const fifth = (firstCols[4] || '').toUpperCase();
  const startIdx = ['ML', 'TN', 'US'].includes(fifth) ? 0 : 1;

  const rows: ParsedRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split('\t').map((c) => c.trim());
    if (cols.length < 5) continue;
    const [fullName, shortName, computerType, machineCode, factoryCode, fabricLabel, toolResultLabel] = cols;
    if (!fullName || !shortName || !machineCode || !factoryCode) continue;
    rows.push({
      fullName,
      shortName,
      computerType: computerType || undefined,
      machineCode,
      factoryCode,
      fabricLabel: fabricLabel || undefined,
      toolResultLabel: toolResultLabel || undefined,
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
      toast.error('Không parse được dòng nào. Kiểm tra format (cột cách nhau bằng Tab).');
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
            Paste dữ liệu từ Excel (tab-separated). 7 cột: <b>Tên đầy đủ</b> — <b>Tên viết tắt</b> —{' '}
            <b>Loại máy tính</b> (optional) — <b>Máy</b> (IEN/ICL/HT...) — <b>Xưởng</b> (ML/TN/US) —{' '}
            <b>Loại vải</b> (Cotton Jersey, Polyester Jersey, 2D, G5000…) — <b>Kết quả Tool</b> (Có Tool / Không có Tool).
            Hệ thống match label theo tên trong Workshop Config (case-insensitive).
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

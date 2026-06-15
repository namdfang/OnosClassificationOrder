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

const EXAMPLE = `Tên đầy đủ sản phẩm có tool Rập	Tên viết tắt	Loại máy tính chạy sản phẩm 694	Máy	Xưởng
all over print christmas ugly sweater	CHRISTMAS		IEN	ML
aop women's briefs	WOM		ICL	US
all-over print kids and youth baseball jersey	BRKIDS		HT	TN
all-over print football jersey	FB		IEN	ML`;

interface ParsedRow {
  fullName: string;
  shortName: string;
  computerType?: string;
  machineCode: string;
  factoryCode: string;
}

function parseRows(raw: string): ParsedRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  // Skip header if first row's last cell isn't a known factory code
  const firstCols = lines[0].split('\t');
  const lastCol = (firstCols[firstCols.length - 1] || '').toUpperCase();
  const startIdx = ['ML', 'TN', 'US'].includes(lastCol) ? 0 : 1;

  const rows: ParsedRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split('\t').map((c) => c.trim());
    if (cols.length < 5) continue;
    const [fullName, shortName, computerType, machineCode, factoryCode] = cols;
    if (!fullName || !shortName || !machineCode || !factoryCode) continue;
    rows.push({ fullName, shortName, computerType: computerType || undefined, machineCode, factoryCode });
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
      toast.success(`Imported ${imported}, updated ${updated}, skipped ${skipped.length}`);
      if (skipped.length > 0) {
        console.warn('Skipped rows:', skipped);
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Product Config</DialogTitle>
          <DialogDescription>
            Paste dữ liệu từ Excel (tab-separated). Hàng đầu là header, các cột: Tên đầy đủ — Tên viết tắt — Loại máy tính
            (optional) — Máy (IEN/ICL/HT) — Xưởng (ML/TN/US).
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

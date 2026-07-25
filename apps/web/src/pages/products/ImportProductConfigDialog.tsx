import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
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
    const [fullName, shortName, machineNumber, factoryLabel, fabricLabel, toolResultLabel, departmentLabel] = cols;
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
  const { t } = useTranslation(['products', 'common']);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const rows = parseRows(text);
    if (rows.length === 0) {
      toast.error(t('importDialog.parseError'));
      return;
    }

    try {
      setLoading(true);
      const resp = await RepositoryRemote.productConfig.importProductConfigs({ rows });
      const { imported, updated, skipped } = resp.data.data;
      toast.success(t('importDialog.importSuccess', { imported, updated, skippedCount: skipped.length }));
      if (skipped.length > 0) {
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
          <DialogTitle>{t('importDialog.title')}</DialogTitle>
          <DialogDescription>
            <Trans t={t} i18nKey="importDialog.description" components={{ b: <b /> }} />
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
          <p className="text-xs text-muted-foreground">{t('importDialog.validRows', { count: parseRows(text).length })}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleImport} disabled={loading || !text.trim()}>
            {loading ? <Spinner size={14} className="text-primary-foreground" /> : <Upload size={14} />}
            {t('common:actions.import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

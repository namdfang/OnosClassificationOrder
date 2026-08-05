import React, { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { FileUp } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { handleAxiosError } from '@/utils';

type ParsedRow = { userSku: string; tier: number };

/** Parse text dán/file .txt/.csv dạng `TÊN TÀI KHOẢN<tab/space>VIP n`. */
function parseTierText(text: string): { rows: ParsedRow[]; invalid: string[] } {
  const rows: ParsedRow[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)[\s,;]+VIP\s*([0-5])$/i);
    if (m) {
      rows.push({ userSku: m[1].trim(), tier: Number(m[2]) });
      continue;
    }
    // Header "TÊN TÀI KHOẢN" (hoặc dòng tiêu đề khác không chứa VIP n) → bỏ qua im lặng.
    if (/tài khoản|tai khoan|account/i.test(line)) continue;
    invalid.push(line);
  }
  return { rows, invalid };
}

function parseTierGrid(grid: unknown[][]): { rows: ParsedRow[]; invalid: string[] } {
  const rows: ParsedRow[] = [];
  const invalid: string[] = [];
  for (const r of grid) {
    const sku = String(r?.[0] ?? '').trim();
    const tierText = String(r?.[1] ?? '').trim();
    if (!sku && !tierText) continue;
    const m = tierText.match(/^VIP\s*([0-5])$/i) || (/^[0-5]$/.test(tierText) ? [tierText, tierText] : null);
    if (sku && m) {
      rows.push({ userSku: sku, tier: Number(m[1]) });
      continue;
    }
    if (/tài khoản|tai khoan|account/i.test(sku)) continue;
    invalid.push([sku, tierText].filter(Boolean).join(' '));
  }
  return { rows, invalid };
}

interface ImportTiersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void> | void;
}

/** Import tier hàng loạt — dời từ CustomerListDialog cũ sang trang /adm/customers, giữ nguyên i18n keys. */
export default function ImportTiersDialog({ open, onOpenChange, onImported }: ImportTiersDialogProps) {
  const { t } = useTranslation(['customerFactoryAssignment', 'common']);
  const [pasteText, setPasteText] = useState('');
  const [parsed, setParsed] = useState<{ rows: ParsedRow[]; invalid: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    matchedSkus: number;
    updatedCustomers: number;
    skippedSkus: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyParsed = (next: { rows: ParsedRow[]; invalid: string[] }) => {
    setParsed(next);
    setImportResult(null);
    if (!next.rows.length) toast.error(t('customerListDialog.import.noValidRows'));
  };

  const handleFile = async (file: File) => {
    try {
      const ext = file.name.toLowerCase().split('.').pop() || '';
      if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false });
        applyParsed(parseTierGrid(grid));
      } else {
        applyParsed(parseTierText(await file.text()));
      }
    } catch {
      toast.error(t('customerListDialog.import.fileReadError'));
    }
  };

  const handleImport = async () => {
    if (!parsed?.rows.length) return;
    try {
      setImporting(true);
      const res = await RepositoryRemote.customer.importTiers(parsed.rows);
      const d = res.data?.data as { matchedSkus: number; updatedCustomers: number; skippedSkus: string[] };
      setImportResult(d);
      await onImported();
      toast.success(
        t('customerListDialog.import.toastSuccess', { updated: d.updatedCustomers, matched: d.matchedSkus }),
      );
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setPasteText('');
    setParsed(null);
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('customerListDialog.import.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('customerListDialog.import.description')}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
            className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-indigo-600 dark:file:bg-indigo-500/15 dark:file:text-indigo-300"
          />
          <textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              if (e.target.value.trim()) applyParsed(parseTierText(e.target.value));
              else {
                setParsed(null);
                setImportResult(null);
              }
            }}
            placeholder={t('customerListDialog.import.pastePlaceholder')}
            rows={5}
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-2 text-xs font-mono text-slate-700 dark:text-slate-200"
          />

          {parsed && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs space-y-1">
              <p className="text-slate-600 dark:text-slate-300">
                <Trans
                  ns="customerFactoryAssignment"
                  i18nKey="customerListDialog.import.validRows"
                  values={{ count: parsed.rows.length }}
                  components={{ b: <b /> }}
                />
                {parsed.invalid.length > 0 && (
                  <Trans
                    ns="customerFactoryAssignment"
                    i18nKey="customerListDialog.import.invalidRowsSuffix"
                    values={{ count: parsed.invalid.length }}
                    components={{ b: <b className="text-rose-500" /> }}
                  />
                )}
                .
              </p>
              {parsed.invalid.slice(0, 3).map((l) => (
                <p key={l} className="font-mono text-rose-400 truncate">
                  {l}
                </p>
              ))}
            </div>
          )}

          {importResult && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs space-y-1">
              <p className="text-emerald-700 dark:text-emerald-400">
                <Trans
                  ns="customerFactoryAssignment"
                  i18nKey="customerListDialog.import.resultSuccess"
                  values={{ updated: importResult.updatedCustomers, matched: importResult.matchedSkus }}
                  components={{ b: <b /> }}
                />
              </p>
              {importResult.skippedSkus.length > 0 && (
                <p className="text-amber-600 dark:text-amber-400">
                  {t('customerListDialog.import.resultSkipped', { count: importResult.skippedSkus.length })}{' '}
                  <span className="font-mono">{importResult.skippedSkus.join(', ')}</span>
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            {t('actions.close', { ns: 'common' })}
          </Button>
          <Button onClick={handleImport} disabled={importing || !parsed?.rows.length}>
            {importing ? <Spinner size={13} className="mr-1.5" /> : <FileUp size={14} />}
            {t('customerListDialog.import.submit')} {parsed?.rows.length ? `(${parsed.rows.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

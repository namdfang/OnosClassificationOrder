import React, { useMemo, useState } from 'react';
import { Upload, FileText, FileCheck2, FilePlus2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';
import { parseOrderRows, parseReworkOrderRows } from './parseOrders';

type ImportMode = 'new' | 'rework';

interface ImportOrderTabProps {
  onImported: () => void;
}

interface NewImportResult {
  imported: number;
  updated: number;
  mapped: number;
  unmapped: number;
  skipped: { row: number; reason: string }[];
}

interface ReworkImportResult {
  updated: number;
  notFound: number;
  cancelled: number;
  assigneeMatched: number;
  skipped: { row: number; reason: string }[];
}

export function ImportOrderTab({ onImported }: ImportOrderTabProps) {
  const [mode, setMode] = useState<ImportMode>('new');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastNewResult, setLastNewResult] = useState<NewImportResult | null>(null);
  const [lastReworkResult, setLastReworkResult] = useState<ReworkImportResult | null>(null);

  const parsedCount = useMemo(() => {
    return mode === 'new' ? parseOrderRows(text).length : parseReworkOrderRows(text).length;
  }, [text, mode]);

  const handleFile = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    try {
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          toast.error('File rỗng — không có sheet nào');
          return;
        }
        const tsv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName], {
          FS: '\t',
          dateNF: 'yyyy-mm-dd HH:mm:ss',
        });
        setText(tsv);
      } else {
        setText(await file.text());
      }
    } catch (err) {
      toast.error('Không đọc được file. Kiểm tra format .xlsx / .csv / .tsv / .txt.');
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  const handleImport = async () => {
    if (mode === 'new') {
      const rows = parseOrderRows(text);
      if (rows.length === 0) {
        toast.error('Không parse được dòng nào. Kiểm tra format (cột cách bằng Tab, có header "Production ID").');
        return;
      }
      try {
        setLoading(true);
        const resp = await RepositoryRemote.order.importOrders({ rows });
        const result = resp.data.data as NewImportResult;
        setLastNewResult(result);
        setLastReworkResult(null);
        toast.success(`Imported ${result.imported}, updated ${result.updated}, mapped ${result.mapped}/${result.mapped + result.unmapped}`);
        onImported();
        setText('');
      } catch (error) {
        handleAxiosError(error);
      } finally {
        setLoading(false);
      }
    } else {
      const rows = parseReworkOrderRows(text);
      if (rows.length === 0) {
        toast.error('Không parse được dòng nào. Header sheet soát phải bắt đầu bằng "Production ID".');
        return;
      }
      try {
        setLoading(true);
        const resp = await RepositoryRemote.order.importRework({ rows });
        const result = resp.data.data as ReworkImportResult;
        setLastReworkResult(result);
        setLastNewResult(null);
        toast.success(
          `Soát: updated ${result.updated}, not-found ${result.notFound}, cancel ${result.cancelled}, gán designer ${result.assigneeMatched}`,
        );
        onImported();
        setText('');
      } catch (error) {
        handleAxiosError(error);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Paste data từ Google Sheets / Excel</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === 'new'
                ? 'Sao chép cả khối (gồm header) từ sheet đơn mới rồi paste vào đây.'
                : 'Sheet soát: cập nhật QC fields (kết quả tool, file lỗi, ghi chú, người thực hiện) cho đơn đã có.'}
            </p>
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <span className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent">
              <FileText size={14} />
              Chọn file
            </span>
          </label>
        </div>

        {/* Mode picker */}
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => {
              setMode('new');
              setText('');
            }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              mode === 'new'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FilePlus2 size={13} /> Import đơn mới
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('rework');
              setText('');
            }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              mode === 'rework'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FileCheck2 size={13} /> Import file soát
          </button>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          className="font-mono text-xs"
          placeholder={
            mode === 'new'
              ? 'Production ID\tUser SKU\tUser email\tType\t...'
              : 'Production ID\tUser SKU\tSize\tTrang_thai_in\t...\tNote_kq_Tool\tFile_sua_loi\tGhi_chu_file_loi\tNguoi_thuc_hien\t...'
          }
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {parsedCount > 0 ? (
              <>
                <Badge variant="secondary">{parsedCount}</Badge> dòng hợp lệ sẵn sàng{' '}
                {mode === 'new' ? 'import' : 'soát'}.
              </>
            ) : (
              'Chưa parse được dòng nào. Header phải bắt đầu bằng "Production ID".'
            )}
          </p>
          <Button onClick={handleImport} disabled={loading || parsedCount === 0}>
            {loading ? <Spinner size={14} className="text-primary-foreground" /> : <Upload size={14} />}
            {mode === 'new' ? 'Import' : 'Soát'} {parsedCount > 0 ? `(${parsedCount})` : ''}
          </Button>
        </div>
      </div>

      {lastNewResult && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Kết quả import lần trước</h3>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Imported" value={lastNewResult.imported} accent="success" />
            <Stat label="Updated" value={lastNewResult.updated} accent="secondary" />
            <Stat label="Đã mapping" value={lastNewResult.mapped} accent="success" />
            <Stat label="Chưa mapping" value={lastNewResult.unmapped} accent="warning" />
          </div>
          <SkippedList items={lastNewResult.skipped} />
        </div>
      )}

      {lastReworkResult && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Kết quả soát lần trước</h3>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Updated" value={lastReworkResult.updated} accent="success" />
            <Stat label="Not found" value={lastReworkResult.notFound} accent="warning" />
            <Stat label="Cancelled" value={lastReworkResult.cancelled} accent="warning" />
            <Stat label="Gán designer" value={lastReworkResult.assigneeMatched} accent="secondary" />
          </div>
          <SkippedList items={lastReworkResult.skipped} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: 'success' | 'warning' | 'secondary' }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-xl font-bold text-foreground mt-1">{value}</p>
      <Badge variant={accent} className="mt-1">
        {accent === 'success' ? 'OK' : accent === 'warning' ? 'Check' : 'Info'}
      </Badge>
    </div>
  );
}

function SkippedList({ items }: { items: { row: number; reason: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-foreground mb-2">Skipped rows ({items.length}):</p>
      <ul className="space-y-1 text-xs text-muted-foreground max-h-40 overflow-auto">
        {items.map((s) => (
          <li key={s.row}>
            Row {s.row}: {s.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

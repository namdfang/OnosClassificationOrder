import React, { useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';
import { parseOrderRows } from './parseOrders';

interface ImportOrderTabProps {
  onImported: () => void;
}

export function ImportOrderTab({ onImported }: ImportOrderTabProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    imported: number;
    updated: number;
    mapped: number;
    unmapped: number;
    skipped: { row: number; reason: string }[];
  } | null>(null);

  const parsedCount = parseOrderRows(text).length;

  const handleFile = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    try {
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        // SheetJS đọc XLSX (binary) và CSV (text, auto-detect delimiter / quoted cell).
        // - `cellDates: true` → cell date thành JS Date object thay vì serial number.
        // - `dateNF: 'yyyy-mm-dd HH:mm:ss'` → format date về ISO-like KÈM giờ phút giây,
        //   không bị cell display format truncate (ví dụ cell hiển thị "22/06/2026" sẽ vẫn ra "2026-06-22 00:30:48").
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
        // .tsv / .txt / không có extension → đọc raw text, giả định sẵn tab-separated
        setText(await file.text());
      }
    } catch (err) {
      toast.error('Không đọc được file. Kiểm tra format .xlsx / .csv / .tsv / .txt.');
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  const handleImport = async () => {
    const rows = parseOrderRows(text);
    if (rows.length === 0) {
      toast.error('Không parse được dòng nào. Kiểm tra format (cột cách bằng Tab, có header "Production ID").');
      return;
    }

    try {
      setLoading(true);
      const resp = await RepositoryRemote.order.importOrders({ rows });
      const result = resp.data.data;
      setLastResult(result);
      toast.success(`Imported ${result.imported}, updated ${result.updated}, mapped ${result.mapped}/${result.mapped + result.unmapped}`);
      onImported();
      setText('');
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Paste data từ Google Sheets / Excel</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sao chép cả khối (gồm header) từ sheet rồi paste vào đây. Hoặc upload file .xlsx / .csv / .tsv / .txt.
              Loại vải sẽ tự gán từ cấu hình sản phẩm.
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

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          className="font-mono text-xs"
          placeholder="Production ID	User SKU	User email	Type	..."
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {parsedCount > 0 ? (
              <>
                <Badge variant="secondary">{parsedCount}</Badge> dòng hợp lệ sẵn sàng import.
              </>
            ) : (
              'Chưa parse được dòng nào. Header phải bắt đầu bằng "Production ID".'
            )}
          </p>
          <Button onClick={handleImport} disabled={loading || parsedCount === 0}>
            {loading ? <Spinner size={14} className="text-primary-foreground" /> : <Upload size={14} />}
            Import {parsedCount > 0 ? `(${parsedCount})` : ''}
          </Button>
        </div>
      </div>

      {lastResult && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Kết quả import lần trước</h3>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Imported" value={lastResult.imported} accent="success" />
            <Stat label="Updated" value={lastResult.updated} accent="secondary" />
            <Stat label="Đã mapping" value={lastResult.mapped} accent="success" />
            <Stat label="Chưa mapping" value={lastResult.unmapped} accent="warning" />
          </div>
          {lastResult.skipped.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-foreground mb-2">Skipped rows ({lastResult.skipped.length}):</p>
              <ul className="space-y-1 text-xs text-muted-foreground max-h-40 overflow-auto">
                {lastResult.skipped.map((s) => (
                  <li key={s.row}>
                    Row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
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

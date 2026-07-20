import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Link2, Loader2, Upload, XCircle } from 'lucide-react';
import type {
  CuttingFileBreakdownRow,
  CuttingFileConflict,
  CuttingFileInvalid,
  CuttingFileMatched,
  CuttingFileNotFound,
} from 'shared';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { handleAxiosError } from '@/utils';

interface ImportCuttingFilesTabProps {
  onApplied: () => void;
}

interface PreviewState {
  matched: CuttingFileMatched[];
  notFound: CuttingFileNotFound[];
  invalid: CuttingFileInvalid[];
  conflicts: CuttingFileConflict[];
  summary: {
    totalLinks: number;
    matched: number;
    withExistingFile: number;
    notFound: number;
    invalid: number;
    conflicts: number;
    byFactory: CuttingFileBreakdownRow[];
    byMachineType: CuttingFileBreakdownRow[];
  };
}

const INVALID_REASON_LABEL: Record<CuttingFileInvalid['reason'], string> = {
  'invalid-url': 'URL không hợp lệ (không phải Drive)',
  'fetch-failed': 'Không tải được tên file (mạng / quyền)',
  'parse-failed': 'Đọc page Drive được nhưng không trích được tên file',
  'no-production-id': 'Tên file không khớp pattern XX-XXXXX-XXXXX (2 chữ cái + 5 số + 5 số)',
};

export function ImportCuttingFilesTab({ onApplied }: ImportCuttingFilesTabProps) {
  const [text, setText] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [overwrite, setOverwrite] = useState(false);

  const links = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    [text],
  );

  // Khi xlsx upload: lấy cột A (index 0) của mọi row, bỏ rỗng. Không header.
  const handleFile = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    try {
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          toast.error('File rỗng — không có sheet nào');
          return;
        }
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
          header: 1,
          blankrows: false,
        });
        const colA = rows.map((r) => (Array.isArray(r) && r[0] != null ? String(r[0]).trim() : '')).filter(Boolean);
        setText(colA.join('\n'));
      } else {
        setText(await file.text());
      }
    } catch (err) {
      toast.error('Không đọc được file. Kiểm tra format .xlsx / .csv / .txt.');

      console.error(err);
    }
  };

  const handlePreview = async () => {
    if (links.length === 0) {
      toast.error('Paste ít nhất 1 link hoặc upload file');
      return;
    }
    if (links.length > 2000) {
      toast.error('Tối đa 2000 link / batch — chia nhỏ file');
      return;
    }
    try {
      setPreviewing(true);
      const resp = await RepositoryRemote.order.previewCuttingFiles({ links });
      setPreview(resp.data.data as PreviewState);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    // Filter ra mapping eligible: matched + (nếu chưa overwrite) bỏ row đã có
    // file cũ. BE cũng tự skip nhưng filter trước cho FE đếm chính xác.
    const mappings = preview.matched
      .filter((m) => (overwrite ? true : !m.existingCuttingFileUrl))
      .map((m) => ({
        orderId: m.orderId,
        cuttingFileUrl: m.link,
        cuttingFileName: m.fileName,
      }));
    if (mappings.length === 0) {
      toast.error('Không có đơn nào để map (bật "Ghi đè" nếu muốn cập nhật đơn đã có file)');
      return;
    }
    try {
      setApplying(true);
      const resp = await RepositoryRemote.order.applyCuttingFiles({ mappings, overwrite });
      const data = resp.data.data as { updated: number; skipped: number };
      if (data.updated === 0) {
        toast.error(
          `Không có đơn nào được cập nhật (skip ${data.skipped}). ` +
            `Kiểm tra console BE — có thể đơn không tồn tại hoặc field bị Mongoose strip.`,
        );
      } else if (data.updated < mappings.length) {
        toast.warning(`Đã map ${data.updated}/${mappings.length} đơn (skip ${data.skipped})`);
      } else {
        toast.success(`Đã map ${data.updated} đơn (skip ${data.skipped})`);
      }
      setPreview(null);
      setText('');
      setOverwrite(false);
      onApplied();
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setApplying(false);
    }
  };

  const eligibleMatchCount = preview
    ? overwrite
      ? preview.matched.length
      : preview.matched.length - preview.summary.withExistingFile
    : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Map file cutting (.pdf) cho đơn</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste hoặc upload list link Google Drive — mỗi link 1 dòng. Tên file dạng{' '}
              <code className="px-1 rounded bg-muted text-foreground">XX-XXXXX-XXXXX-*.pdf</code> (2 chữ cái + 5 số + 5
              số, ví dụ <code className="px-1 rounded bg-muted">BH-96341-30608-*.pdf</code>). Hệ thống tự lấy tên file
              từ Drive (cần share "anyone with link") → parse productionId → match đơn.
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
                e.target.value = '';
              }}
            />
            <span className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent">
              <FileText size={14} />
              Chọn file (.xlsx cột A)
            </span>
          </label>
        </div>

        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (preview) setPreview(null);
          }}
          rows={10}
          className="font-mono text-xs"
          placeholder="https://drive.google.com/file/d/abc.../view&#10;https://drive.google.com/file/d/xyz.../view&#10;..."
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Link2 size={12} />
            {links.length > 0 ? (
              <>
                <Badge variant="secondary">{links.length}</Badge> link sẵn sàng kiểm tra
              </>
            ) : (
              'Chưa có link nào'
            )}
          </p>
          <Button onClick={handlePreview} disabled={previewing || links.length === 0}>
            {previewing ? <Spinner size={14} className="text-primary-foreground" /> : <Upload size={14} />}
            Kiểm tra ({links.length})
          </Button>
        </div>
      </div>

      {preview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Tổng link" value={preview.summary.totalLinks} icon={Link2} tone="neutral" />
            <StatCard label="Khớp đơn" value={preview.summary.matched} icon={CheckCircle2} tone="success" />
            <StatCard
              label="Đã có file cũ"
              value={preview.summary.withExistingFile}
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard label="Không tìm thấy đơn" value={preview.summary.notFound} icon={XCircle} tone="warning" />
            <StatCard
              label="Link lỗi"
              value={preview.summary.invalid + preview.summary.conflicts}
              icon={XCircle}
              tone="danger"
            />
          </div>

          {(preview.summary.byFactory.length > 0 || preview.summary.byMachineType.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <BreakdownCard title="Phân bổ theo xưởng" rows={preview.summary.byFactory} />
              <BreakdownCard title="Phân bổ theo máy" rows={preview.summary.byMachineType} />
            </div>
          )}

          {preview.conflicts.length > 0 && (
            <Section
              title={`Conflict (${preview.conflicts.length}) — cùng productionId xuất hiện > 1 link, vui lòng xoá bớt`}
              tone="danger"
            >
              <ul className="text-xs space-y-1.5">
                {preview.conflicts.map((c) => (
                  <li key={c.productionId} className="space-y-1">
                    <span className="font-mono font-semibold text-foreground">{c.productionId}</span>{' '}
                    <span className="text-muted-foreground">— {c.links.length} link:</span>
                    <ul className="ml-3 space-y-0.5">
                      {c.links.map((l) => (
                        <li key={l} className="font-mono text-[10px] text-muted-foreground break-all">
                          · {l}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {preview.invalid.length > 0 && (
            <Section title={`Link lỗi (${preview.invalid.length})`} tone="warning">
              <ul className="text-xs space-y-1">
                {preview.invalid.map((iv, idx) => (
                  <li key={`${iv.link}-${idx}`}>
                    <span className="text-rose-700 dark:text-rose-300">{INVALID_REASON_LABEL[iv.reason]}</span>
                    {iv.fileName && <span className="text-muted-foreground"> — {iv.fileName}</span>}
                    <div className="font-mono text-[10px] text-muted-foreground break-all">{iv.link}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {preview.notFound.length > 0 && (
            <Section title={`Không tìm thấy đơn (${preview.notFound.length})`} tone="warning">
              <ul className="text-xs space-y-1">
                {preview.notFound.map((nf) => (
                  <li key={nf.link}>
                    <span className="font-mono font-semibold text-foreground">{nf.productionId}</span>{' '}
                    <span className="text-muted-foreground">— {nf.fileName}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {preview.matched.length > 0 && (
            <Section title={`Sẵn sàng map (${preview.matched.length})`} tone="success" defaultOpen>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Production ID</th>
                      <th className="text-left p-2">Xưởng</th>
                      <th className="text-left p-2">Máy</th>
                      <th className="text-left p-2">File mới</th>
                      <th className="text-left p-2">File cũ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.matched.map((m) => (
                      <tr key={m.orderId} className="border-t border-border/40">
                        <td className="p-2 font-mono font-semibold">{m.productionId}</td>
                        <td className="p-2">{m.factoryName || '—'}</td>
                        <td className="p-2">{m.machineTypeName || '—'}</td>
                        <td className="p-2 text-muted-foreground line-clamp-1 max-w-[280px]">{m.fileName}</td>
                        <td className="p-2">
                          {m.existingCuttingFileUrl ? (
                            <Badge variant="warning">{m.existingCuttingFileName || 'Có file cũ'}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Ghi đè file cũ ({preview.summary.withExistingFile} đơn đã có file)
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Sẽ map <strong className="text-foreground">{eligibleMatchCount}</strong> đơn
              </span>
              <Button onClick={handleApply} disabled={applying || eligibleMatchCount === 0}>
                {applying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Mapping ({eligibleMatchCount})
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneCls = {
    neutral: 'text-muted-foreground bg-muted/40',
    success: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20',
    warning: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20',
    danger: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20',
  }[tone];
  return (
    <div className={`rounded-lg border border-border p-3 ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
        <Icon size={12} /> {label}
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: CuttingFileBreakdownRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="text-xs font-semibold text-foreground mb-2">{title}</h4>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id ?? '__none'} className="flex items-center justify-between text-xs">
            <span className="text-foreground">{r.name}</span>
            <Badge variant="secondary">{r.count}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
  defaultOpen = false,
}: {
  title: string;
  tone: 'success' | 'warning' | 'danger';
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toneCls = {
    success: 'border-emerald-300 dark:border-emerald-700/50',
    warning: 'border-amber-300 dark:border-amber-700/50',
    danger: 'border-rose-300 dark:border-rose-700/50',
  }[tone];
  return (
    <div className={`rounded-lg border bg-card ${toneCls}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-2.5 text-left text-sm font-semibold flex items-center justify-between"
      >
        <span className="text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{open ? 'Ẩn' : 'Mở'}</span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

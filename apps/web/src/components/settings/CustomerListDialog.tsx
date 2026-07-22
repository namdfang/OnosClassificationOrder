import React, { useMemo, useRef, useState } from 'react';
import { FileUp, Search } from 'lucide-react';
import type { Customer } from 'shared';
import { CUSTOMER_TIERS } from 'shared';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

/** Màu badge theo tier VIP 0..5; khách lẻ (tier null) dùng style riêng. */
const TIER_STYLES: Record<number, string> = {
  0: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  1: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  2: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  3: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  4: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-400',
  5: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
};
const RETAIL_STYLE = 'bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400';

export function TierBadge({ tier }: { tier: number | null | undefined }) {
  const isVip = typeof tier === 'number' && tier >= 0 && tier <= 5;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap',
        isVip ? TIER_STYLES[tier as number] : RETAIL_STYLE,
      )}
    >
      {isVip ? `VIP ${tier}` : 'Khách lẻ'}
    </span>
  );
}

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

interface CustomerListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  onReload: () => Promise<void>;
}

type TierFilter = 'all' | 'retail' | `${number}`;

export default function CustomerListDialog({ open, onOpenChange, customers, onReload }: CustomerListDialogProps) {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [savingId, setSavingId] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [parsed, setParsed] = useState<{ rows: ParsedRow[]; invalid: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    matchedSkus: number;
    updatedCustomers: number;
    skippedSkus: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tierCounts = useMemo(() => {
    const m = new Map<TierFilter, number>([['all', customers.length], ['retail', 0]]);
    for (const t of CUSTOMER_TIERS) m.set(`${t}`, 0);
    for (const c of customers) {
      const key: TierFilter = typeof c.tier === 'number' ? (`${c.tier}` as TierFilter) : 'retail';
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (tierFilter === 'retail' && typeof c.tier === 'number') return false;
      if (tierFilter !== 'all' && tierFilter !== 'retail' && `${c.tier}` !== tierFilter) return false;
      if (q && !c.userSku.toLowerCase().includes(q) && !(c.userEmail || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [customers, search, tierFilter]);

  const handleTierChange = async (c: Customer, value: string) => {
    const tier = value === '' ? null : Number(value);
    try {
      setSavingId(String(c._id));
      await RepositoryRemote.customer.updateTier(String(c._id), tier);
      await onReload();
      toast.success(`${c.userSku}: ${tier === null ? 'Khách lẻ' : `VIP ${tier}`}`);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSavingId('');
    }
  };

  const applyParsed = (next: { rows: ParsedRow[]; invalid: string[] }) => {
    setParsed(next);
    setImportResult(null);
    if (!next.rows.length) toast.error('Không đọc được dòng hợp lệ nào (định dạng: TÊN TÀI KHOẢN + VIP 0..5)');
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
      toast.error('Không đọc được file');
    }
  };

  const handleImport = async () => {
    if (!parsed?.rows.length) return;
    try {
      setImporting(true);
      const res = await RepositoryRemote.customer.importTiers(parsed.rows);
      const d = res.data?.data as { matchedSkus: number; updatedCustomers: number; skippedSkus: string[] };
      setImportResult(d);
      await onReload();
      toast.success(`Đã gán tier cho ${d.updatedCustomers} khách (${d.matchedSkus} tài khoản khớp)`);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setPasteText('');
    setParsed(null);
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const filterChip = (key: TierFilter, label: React.ReactNode) => (
    <button
      key={key}
      type="button"
      onClick={() => setTierFilter(key)}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border transition-colors',
        tierFilter === key
          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
          : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300',
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{tierCounts.get(key) || 0}</span>
    </button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Danh sách khách hàng ({customers.length})</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo SKU / email..."
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <FileUp size={14} /> Import tier
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {filterChip('all', 'Tất cả')}
              {filterChip('retail', <TierBadge tier={null} />)}
              {CUSTOMER_TIERS.map((t) => filterChip(`${t}` as TierFilter, <TierBadge tier={t} />))}
            </div>

            <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-[11px] uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Tài khoản (SKU)</th>
                    <th className="text-left px-3 py-2 font-medium">Email</th>
                    <th className="text-left px-3 py-2 font-medium w-36">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {filtered.map((c) => {
                    const id = String(c._id);
                    return (
                      <tr key={id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200">{c.userSku}</td>
                        <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
                          {c.userEmail || '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="inline-flex items-center gap-1.5">
                            <span className="relative inline-flex" title="Bấm để đổi tier">
                              <TierBadge tier={c.tier} />
                              <select
                                value={typeof c.tier === 'number' ? `${c.tier}` : ''}
                                onChange={(ev) => handleTierChange(c, ev.target.value)}
                                disabled={savingId === id}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                              >
                                <option value="">Khách lẻ</option>
                                {CUSTOMER_TIERS.map((t) => (
                                  <option key={t} value={t}>{`VIP ${t}`}</option>
                                ))}
                              </select>
                            </span>
                            {savingId === id && <Spinner size={12} className="text-slate-400" />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-400">
                        Không có khách nào khớp bộ lọc.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) resetImport();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import tier khách hàng</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Upload file <span className="font-mono">.xlsx / .csv / .txt</span> hoặc dán trực tiếp, mỗi dòng:{' '}
              <span className="font-mono">TÊN TÀI KHOẢN&nbsp;&nbsp;VIP 0..5</span>. Khớp theo SKU (không phân biệt
              hoa/thường), gán cho mọi email trùng SKU; tài khoản chưa có trong danh sách sẽ bị bỏ qua.
            </p>
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
              placeholder={'Hoặc dán vào đây, VD:\nTIENHC\tVIP 0\nMERCHFOX\tVIP 2'}
              rows={5}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-2 text-xs font-mono text-slate-700 dark:text-slate-200"
            />

            {parsed && (
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs space-y-1">
                <p className="text-slate-600 dark:text-slate-300">
                  Đọc được <b>{parsed.rows.length}</b> dòng hợp lệ
                  {parsed.invalid.length > 0 && (
                    <>
                      , <b className="text-rose-500">{parsed.invalid.length}</b> dòng không hợp lệ (bỏ qua)
                    </>
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
                  Đã gán tier cho <b>{importResult.updatedCustomers}</b> khách ({importResult.matchedSkus} tài khoản
                  khớp).
                </p>
                {importResult.skippedSkus.length > 0 && (
                  <p className="text-amber-600 dark:text-amber-400">
                    Bỏ qua {importResult.skippedSkus.length} tài khoản chưa có trong danh sách:{' '}
                    <span className="font-mono">{importResult.skippedSkus.join(', ')}</span>
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              Đóng
            </Button>
            <Button onClick={handleImport} disabled={importing || !parsed?.rows.length}>
              {importing ? <Spinner size={13} className="mr-1.5" /> : <FileUp size={14} />}
              Import {parsed?.rows.length ? `(${parsed.rows.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

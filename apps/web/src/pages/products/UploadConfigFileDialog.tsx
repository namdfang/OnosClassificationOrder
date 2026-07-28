import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Upload } from 'lucide-react';
import type { ImportProductConfigRow } from 'shared';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { handleAxiosError } from '@/utils';

const normalize = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** 1 dòng parse từ file — `autoShort` = file thiếu Tên viết tắt, đã tự sinh từ tên sản phẩm. */
interface ParsedFileRow extends ImportProductConfigRow {
  autoShort?: boolean;
}

interface ParseResult {
  rows: ParsedFileRow[];
  /** Số dòng có tên nhưng thiếu Xưởng/Phòng — không import được, chỉ báo số lượng. */
  invalidCount: number;
}

/**
 * Parse file Excel dạng "SKU THÁI NGUYÊN-MÊ LINH" — tìm dòng header chứa
 * "Tên SP"/"Tên đầy đủ" rồi map cột theo tên header (cột tên viết tắt thường
 * KHÔNG có header → lấy cột ngay sau cột Tên SP). Chịu được cả format 7 cột
 * của dialog import paste (Máy / Loại vải / Kết quả Tool). Dòng thiếu Tên
 * viết tắt KHÔNG bị loại — tự sinh từ tên sản phẩm (đánh dấu `autoShort`);
 * chỉ loại dòng thiếu Xưởng/Phòng (import endpoint bắt buộc 2 cột này).
 */
function parseWorkbook(wb: XLSX.WorkBook): ParseResult {
  const rows: ParsedFileRow[] = [];
  const seen = new Set<string>();
  let invalidCount = 0;

  for (const sheetName of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
    const headerIdx = aoa.findIndex((r) =>
      r.some((c) => /tên sp|tên đầy đủ/.test(normalize(c))),
    );
    if (headerIdx < 0) continue;

    const header = aoa[headerIdx].map(normalize);
    const findCol = (re: RegExp) => header.findIndex((h) => re.test(h));
    const fullCol = findCol(/tên sp|tên đầy đủ/);
    const shortByHeader = findCol(/viết tắt/);
    const shortCol = shortByHeader >= 0 ? shortByHeader : fullCol + 1;
    const factoryCol = findCol(/nhà máy|xưởng/);
    const deptCol = findCol(/phòng/);
    const machineCol = header.findIndex((h) => h === 'máy');
    const fabricCol = findCol(/loại vải/);
    const toolCol = findCol(/kết quả/);
    if (factoryCol < 0 || deptCol < 0) continue;

    for (let i = headerIdx + 1; i < aoa.length; i++) {
      const r = aoa[i];
      const cell = (idx: number) => (idx >= 0 ? String(r[idx] ?? '').trim() : '');
      const fullName = cell(fullCol);
      if (!fullName) continue;
      const factoryLabel = cell(factoryCol);
      const departmentLabel = cell(deptCol);
      if (!factoryLabel || !departmentLabel) {
        invalidCount++;
        continue;
      }
      const key = normalize(fullName);
      if (seen.has(key)) continue;
      seen.add(key);
      const shortName = cell(shortCol);
      rows.push({
        fullName,
        // shortName trống trong file → dùng chính tên sản phẩm (BE tự uppercase), max 60 theo schema.
        shortName: shortName || fullName.slice(0, 60),
        autoShort: !shortName,
        factoryLabel,
        departmentLabel,
        machineNumber: cell(machineCol) || undefined,
        fabricLabel: cell(fabricCol) || undefined,
        toolResultLabel: cell(toolCol) || undefined,
      });
    }
  }
  return { rows, invalidCount };
}

interface UploadConfigFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UploadConfigFileDialog({ open, onOpenChange, onSuccess }: UploadConfigFileDialogProps) {
  const { t } = useTranslation(['products', 'common']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  /** Số dòng hợp lệ trong file (kể cả đã có config). */
  const [totalRows, setTotalRows] = useState(0);
  /** Số dòng đã có config (bị loại khỏi danh sách chọn). */
  const [existingCount, setExistingCount] = useState(0);
  /** Số dòng có tên nhưng thiếu Xưởng/Phòng — không import được. */
  const [invalidCount, setInvalidCount] = useState(0);
  /** Các dòng CHƯA có trong config — hiển thị để chọn. */
  const [freshRows, setFreshRows] = useState<ParsedFileRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reset = () => {
    setFileName('');
    setTotalRows(0);
    setExistingCount(0);
    setInvalidCount(0);
    setFreshRows([]);
    setSelected(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFile = async (file: File) => {
    try {
      setParsing(true);
      setFileName(file.name);
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const { rows, invalidCount: invalid } = parseWorkbook(wb);
      if (rows.length === 0) {
        toast.error(t('uploadConfigDialog.parseError'));
        reset();
        return;
      }
      // So với config hiện có theo fullName (case-insensitive) — chỉ hiện dòng CHƯA có.
      const res = await RepositoryRemote.productConfig.getProductConfigs('?page=1&limit=5000');
      const known = new Set(
        ((res.data?.data || []) as Array<{ fullName: string }>).map((c) => normalize(c.fullName)),
      );
      const fresh = rows.filter((r) => !known.has(normalize(r.fullName)));
      setTotalRows(rows.length);
      setExistingCount(rows.length - fresh.length);
      setInvalidCount(invalid);
      setFreshRows(fresh);
      setSelected(new Set(fresh.map((r) => normalize(r.fullName))));
    } catch (error) {
      handleAxiosError(error);
      reset();
    } finally {
      setParsing(false);
    }
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allSelected = freshRows.length > 0 && selected.size === freshRows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(freshRows.map((r) => normalize(r.fullName))));

  const handleImport = async () => {
    const rows: ImportProductConfigRow[] = freshRows
      .filter((r) => selected.has(normalize(r.fullName)))
      .map(({ autoShort: _autoShort, ...row }) => row);
    if (rows.length === 0) return;
    try {
      setImporting(true);
      const resp = await RepositoryRemote.productConfig.importProductConfigs({ rows });
      const { imported, updated, skipped } = resp.data.data;
      toast.success(
        t('uploadConfigDialog.importSuccess', { imported: imported + updated, skippedCount: skipped.length }),
      );
      if (skipped.length > 0) {
        // Lý do bỏ qua (xưởng/phòng không khớp danh mục) — hiện tối đa 3 dòng đầu.
        skipped.slice(0, 3).forEach((s: { row: number; reason: string }) => toast.warning(s.reason));
      }
      handleOpenChange(false);
      onSuccess();
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('uploadConfigDialog.title')}</DialogTitle>
          <DialogDescription>{t('uploadConfigDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={parsing || importing}>
              {parsing ? <Spinner size={14} /> : <FileSpreadsheet size={14} />}
              {t('uploadConfigDialog.chooseFile')}
            </Button>
            {fileName && <span className="text-xs text-muted-foreground truncate">{fileName}</span>}
          </div>

          {totalRows > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('uploadConfigDialog.parsed', {
                total: totalRows,
                existing: existingCount,
                fresh: freshRows.length,
              })}
              {invalidCount > 0 && <> {t('uploadConfigDialog.invalidRows', { count: invalidCount })}</>}
            </p>
          )}

          {totalRows > 0 && freshRows.length === 0 && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{t('uploadConfigDialog.noNew')}</p>
          )}

          {freshRows.length > 0 && (
            <div className="rounded-lg border border-border max-h-[45vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 accent-primary cursor-pointer"
                        title={t('uploadConfigDialog.selectAll')}
                      />
                    </TableHead>
                    <TableHead>{t('uploadConfigDialog.table.name')}</TableHead>
                    <TableHead>{t('uploadConfigDialog.table.shortName')}</TableHead>
                    <TableHead>{t('uploadConfigDialog.table.factory')}</TableHead>
                    <TableHead>{t('uploadConfigDialog.table.department')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {freshRows.map((r) => {
                    const key = normalize(r.fullName);
                    return (
                      <TableRow key={key} className="cursor-pointer" onClick={() => toggle(key)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(key)}
                            onChange={() => toggle(key)}
                            className="h-4 w-4 accent-primary cursor-pointer"
                          />
                        </TableCell>
                        <TableCell className="text-sm font-medium">{r.fullName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            {r.shortName}
                            {r.autoShort && (
                              <Badge
                                variant="outline"
                                className="border-amber-400 text-amber-600 dark:text-amber-400 text-[10px] px-1 py-0 font-normal"
                                title={t('uploadConfigDialog.autoShortTitle')}
                              >
                                {t('uploadConfigDialog.autoShortBadge')}
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.factoryLabel}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.departmentLabel}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={importing}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleImport} disabled={importing || selected.size === 0}>
            {importing ? <Spinner size={14} className="text-primary-foreground" /> : <Upload size={14} />}
            {t('uploadConfigDialog.importButton', { count: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

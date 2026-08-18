import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Upload } from 'lucide-react';
import type { ImportFullProduct, ProductVariation } from 'shared';
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

const num = (s: string): number | undefined => {
  const cleaned = s.replace(/,/g, '.').replace(/[^0-9.-]/g, '');
  if (!cleaned) return undefined;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : undefined;
};

/** Tách cell nhiều giá trị (ảnh phụ / collection): xuống dòng, `|` hoặc `,` (URL không chứa `,`). */
const splitMulti = (s: string, allowComma: boolean): string[] =>
  s
    .split(allowComma ? /[\n|,]+/ : /[\n|]+/)
    .map((v) => v.trim())
    .filter(Boolean);

/** "Nhãn: giá trị" mỗi dòng → itemSpecifics (bỏ dòng không có `:`). */
const parseSpecifics = (s: string): Array<{ label: string; value: string }> =>
  s
    .split(/\n+/)
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx <= 0) return null;
      const label = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      return label && value ? { label, value } : null;
    })
    .filter((v): v is { label: string; value: string } => v !== null)
    .slice(0, 50);

/**
 * Parse file "sản phẩm hoàn chỉnh": map cột theo TÊN header (không positional),
 * biến thể trải NHIỀU DÒNG — dòng có "Tên SP" bắt đầu sản phẩm mới (kèm biến
 * thể đầu nếu có SKU), dòng dưới để trống Tên SP + có SKU = biến thể tiếp theo
 * của sản phẩm đó. Quét mọi sheet, nhận sheet đầu tiên có đủ header Tên SP.
 */
function parseFullWorkbook(wb: XLSX.WorkBook): { products: ImportFullProduct[]; skippedRows: number } {
  for (const sheetName of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
    const headerIdx = aoa.findIndex((r) => r.some((c) => /tên sp|tên đầy đủ/.test(normalize(c))));
    if (headerIdx < 0) continue;

    const header = aoa[headerIdx].map(normalize);
    const col = (re: RegExp) => header.findIndex((h) => re.test(h));
    const cols = {
      fullName: col(/tên sp|tên đầy đủ/),
      shortName: col(/viết tắt/),
      factory: col(/nhà máy|xưởng/),
      department: col(/phòng/),
      category: col(/danh mục/),
      collections: col(/collection|bộ sưu tập/),
      printMethod: col(/print method|phương pháp in/),
      mockup: col(/^mockup/),
      images: col(/ảnh phụ/),
      sizeChart: col(/bảng size/),
      shortDescription: col(/mô tả ngắn/),
      description: header.findIndex((h) => h === 'mô tả'),
      specifics: col(/thông số/),
      maxProductionTime: col(/thời gian sx|thời gian sản xuất/),
      maxShippingTime: col(/thời gian ship/),
      weight: col(/^cân nặng|^nặng/),
      width: col(/^rộng/),
      height: col(/^cao/),
      length: col(/^dài/),
      sku: col(/^sku/),
      color: col(/^màu/),
      size: header.findIndex((h) => h === 'size'),
      cost: col(/giá vốn/),
      nonShipCost: col(/nonship|non-ship|non ship/),
      retailPrice: col(/giá bán lẻ|bán lẻ/),
      wholesalePrice: col(/giá sỉ|bán sỉ/),
    };
    // Sheet "file SKU" cũ cũng có "Tên SP" — phân biệt bằng cột SKU biến thể
    // hoặc cột catalog (Danh mục/Mockup): thiếu cả 2 thì thử sheet kế.
    if (cols.sku < 0 && cols.category < 0 && cols.mockup < 0) continue;

    const products: ImportFullProduct[] = [];
    let skippedRows = 0;
    let current: ImportFullProduct | null = null;

    const buildVariation = (r: unknown[]): ProductVariation | null => {
      const cell = (idx: number) => (idx >= 0 ? String(r[idx] ?? '').trim() : '');
      const sku = cell(cols.sku);
      if (!sku) return null;
      const attributes: Array<{ label: string; value: string }> = [];
      const color = cell(cols.color);
      const size = cell(cols.size);
      if (color) attributes.push({ label: 'Màu', value: color });
      if (size) attributes.push({ label: 'Size', value: size });
      return {
        sku: sku.toUpperCase(),
        ...(attributes.length > 0 ? { attributes } : {}),
        ...(num(cell(cols.cost)) !== undefined ? { cost: num(cell(cols.cost)) } : {}),
        ...(num(cell(cols.nonShipCost)) !== undefined ? { nonShipCost: num(cell(cols.nonShipCost)) } : {}),
        ...(num(cell(cols.retailPrice)) !== undefined ? { retailPrice: num(cell(cols.retailPrice)) } : {}),
        ...(num(cell(cols.wholesalePrice)) !== undefined ? { wholesalePrice: num(cell(cols.wholesalePrice)) } : {}),
      } as ProductVariation;
    };

    for (let i = headerIdx + 1; i < aoa.length; i++) {
      const r = aoa[i];
      const cell = (idx: number) => (idx >= 0 ? String(r[idx] ?? '').trim() : '');
      const fullName = cell(cols.fullName);

      if (fullName) {
        const images = splitMulti(cell(cols.images), false);
        const collections = splitMulti(cell(cols.collections), true);
        const specifics = parseSpecifics(cell(cols.specifics));
        current = {
          fullName,
          ...(cell(cols.shortName) ? { shortName: cell(cols.shortName) } : {}),
          ...(cell(cols.factory) ? { factoryLabel: cell(cols.factory) } : {}),
          ...(cell(cols.department) ? { departmentLabel: cell(cols.department) } : {}),
          ...(cell(cols.category) ? { categoryLabel: cell(cols.category) } : {}),
          ...(collections.length > 0 ? { collectionLabels: collections } : {}),
          ...(cell(cols.printMethod) ? { printMethod: cell(cols.printMethod) } : {}),
          ...(cell(cols.mockup) ? { mockup: cell(cols.mockup) } : {}),
          ...(images.length > 0 ? { images } : {}),
          ...(cell(cols.sizeChart) ? { sizeChartUrl: cell(cols.sizeChart) } : {}),
          ...(cell(cols.description) ? { description: cell(cols.description) } : {}),
          ...(cell(cols.shortDescription) ? { shortDescription: cell(cols.shortDescription) } : {}),
          ...(specifics.length > 0 ? { itemSpecifics: specifics } : {}),
          ...(num(cell(cols.maxProductionTime)) !== undefined
            ? { maxProductionTime: num(cell(cols.maxProductionTime)) }
            : {}),
          ...(num(cell(cols.maxShippingTime)) !== undefined
            ? { maxShippingTime: num(cell(cols.maxShippingTime)) }
            : {}),
          ...(num(cell(cols.weight)) !== undefined ? { weight: num(cell(cols.weight)) } : {}),
          ...(num(cell(cols.width)) !== undefined ? { width: num(cell(cols.width)) } : {}),
          ...(num(cell(cols.height)) !== undefined ? { height: num(cell(cols.height)) } : {}),
          ...(num(cell(cols.length)) !== undefined ? { length: num(cell(cols.length)) } : {}),
        };
        products.push(current);
        const variation = buildVariation(r);
        if (variation) current.variations = [variation];
        continue;
      }

      // Dòng không có Tên SP: biến thể của sản phẩm ngay trên (cần SKU).
      const variation = buildVariation(r);
      if (variation && current) {
        current.variations = [...(current.variations ?? []), variation];
      } else if (r.some((c) => String(c ?? '').trim())) {
        skippedRows++;
      }
    }

    if (products.length > 0) return { products, skippedRows };
  }
  return { products: [], skippedRows: 0 };
}

interface ImportFullProductFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/**
 * Import SẢN PHẨM HOÀN CHỈNH từ file xlsx (khác `UploadConfigFileDialog` chỉ
 * config tối thiểu): đủ catalog + biến thể/giá, gọi `POST
 * /product-configs/import-full` — sản phẩm ĐÃ có sẽ được CẬP NHẬT (badge
 * "Cập nhật"), field trống trong file giữ nguyên giá trị cũ.
 */
export function ImportFullProductFileDialog({ open, onOpenChange, onSuccess }: ImportFullProductFileDialogProps) {
  const { t } = useTranslation(['products', 'common']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [products, setProducts] = useState<ImportFullProduct[]>([]);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [skippedRows, setSkippedRows] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reset = () => {
    setFileName('');
    setProducts([]);
    setExistingNames(new Set());
    setSkippedRows(0);
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
      const { products: parsed, skippedRows: skippedCount } = parseFullWorkbook(wb);
      if (parsed.length === 0) {
        toast.error(t('importFullDialog.parseError'));
        reset();
        return;
      }
      const res = await RepositoryRemote.productConfig.getProductConfigs('?page=1&limit=5000');
      const known = new Set(((res.data?.data || []) as Array<{ fullName: string }>).map((c) => normalize(c.fullName)));
      setProducts(parsed);
      setExistingNames(known);
      setSkippedRows(skippedCount);
      setSelected(new Set(parsed.map((p) => normalize(p.fullName))));
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

  const allSelected = products.length > 0 && selected.size === products.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(products.map((p) => normalize(p.fullName))));

  const handleImport = async () => {
    const chosen = products.filter((p) => selected.has(normalize(p.fullName)));
    if (chosen.length === 0) return;
    try {
      setImporting(true);
      const resp = await RepositoryRemote.productConfig.importFullProducts({ products: chosen });
      const { imported, updated, skipped, warnings } = resp.data.data;
      toast.success(t('importFullDialog.importSuccess', { imported, updated, skippedCount: skipped.length }));
      [...skipped, ...warnings].slice(0, 4).forEach((s: { product: string; reason: string }) =>
        toast.warning(`${s.product}: ${s.reason}`),
      );
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('importFullDialog.title')}</DialogTitle>
          <DialogDescription>{t('importFullDialog.description')}</DialogDescription>
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
              {t('importFullDialog.chooseFile')}
            </Button>
            {fileName && <span className="text-xs text-muted-foreground truncate">{fileName}</span>}
          </div>

          {products.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('importFullDialog.parsed', {
                total: products.length,
                variations: products.reduce((sum, p) => sum + (p.variations?.length ?? 0), 0),
              })}
              {skippedRows > 0 && <> {t('importFullDialog.skippedRows', { count: skippedRows })}</>}
            </p>
          )}

          {products.length > 0 && (
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
                        title={t('importFullDialog.selectAll')}
                      />
                    </TableHead>
                    <TableHead>{t('importFullDialog.table.name')}</TableHead>
                    <TableHead>{t('importFullDialog.table.factory')}</TableHead>
                    <TableHead>{t('importFullDialog.table.category')}</TableHead>
                    <TableHead className="text-right">{t('importFullDialog.table.variations')}</TableHead>
                    <TableHead>{t('importFullDialog.table.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const key = normalize(p.fullName);
                    const exists = existingNames.has(key);
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
                        <TableCell className="text-sm font-medium">{p.fullName}</TableCell>
                        <TableCell>
                          {p.factoryLabel ? <Badge variant="outline">{p.factoryLabel}</Badge> : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.categoryLabel}</TableCell>
                        <TableCell className="text-right text-sm">{p.variations?.length ?? 0}</TableCell>
                        <TableCell>
                          {exists ? (
                            <Badge
                              variant="outline"
                              className="border-amber-400 text-amber-600 dark:text-amber-400 text-[10px]"
                            >
                              {t('importFullDialog.updateBadge')}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-emerald-400 text-emerald-600 dark:text-emerald-400 text-[10px]"
                            >
                              {t('importFullDialog.newBadge')}
                            </Badge>
                          )}
                        </TableCell>
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
            {importing ? <Spinner size={14} /> : <Upload size={14} />}
            {t('importFullDialog.importButton', { count: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

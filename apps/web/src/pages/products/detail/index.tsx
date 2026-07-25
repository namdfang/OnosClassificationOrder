import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { ArrowLeft, ImageIcon, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import type { ProductItemSpecific, ProductPrintArea, ProductVariation } from 'shared';
import { PRODUCT_LEVELS, PRODUCT_PRINT_AREAS, ProductConfigStatus, Status, WorkshopConfigCategory } from 'shared';
import { toast } from 'sonner';

import { PATHS } from '@/constants/paths';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import { handleAxiosError } from '@/utils';
import { sortCategoryTree } from '@/utils/categoryTree';
import { cn } from '@/utils/cn';

import type { ProductConfigRow, RefItem } from '../ProductConfigTab';
import { buildStatusMeta } from '../ProductConfigTab';

const selectCls =
  'w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const emptyVariation = (): ProductVariation => ({ sku: '', status: Status.Active });

/** Ảnh sản phẩm (mockup / bảng size) — upload file thay vì dán URL, mỗi sản phẩm chỉ giữ 1 ảnh (upload mới ghi đè). */
/**
 * Chọn ảnh CHỈ preview local (object URL) — KHÔNG upload ngay. Upload thật sự
 * xảy ra ở `handleSave` của trang cha (chỉ khi bấm "Lưu thay đổi"), tránh tốn
 * lưu trữ cho ảnh chọn nhầm/không lưu.
 */
function ImageUploadField({
  value,
  pendingFile,
  onFileSelected,
  aspectClassName,
}: {
  value: string;
  pendingFile: File | null;
  onFileSelected: (file: File) => void;
  aspectClassName: string;
}) {
  const { t } = useTranslation('products');
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const displayValue = previewUrl || value;

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          'relative w-full rounded-md border border-border bg-muted overflow-hidden group',
          aspectClassName,
        )}
        title={t('detail.imageUpload.title')}
      >
        {displayValue ? (
          <img src={displayValue} alt="preview" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-md">
            <ImageIcon size={22} />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
          <span className="flex items-center gap-1 text-xs font-medium text-white opacity-0 group-hover:opacity-100">
            <Upload size={14} /> {pendingFile ? t('detail.imageUpload.change') : t('detail.imageUpload.choose')}
          </span>
        </div>
      </button>
      {pendingFile && <p className="text-[11px] text-amber-600">{t('detail.imageUpload.pendingHint')}</p>}
    </div>
  );
}

/**
 * SKU biến thể LUÔN theo cấu trúc `{SKU sản phẩm}-{giá trị thuộc tính 1}-{giá trị thuộc tính 2}…`
 * — ép theo quy ước để dễ mapping với hệ thống cũ / POD. Chỉ dùng để RENDER preview cho biến
 * thể mới chưa có sku lưu DB; biến thể đã có sku giữ nguyên giá trị DB (admin muốn khác quy ước
 * thì sửa trực tiếp trong database).
 */
/** Bỏ dấu tiếng Việt + uppercase + chỉ giữ A-Z0-9 — SKU biến thể luôn "không dấu". */
const removeDiacritics = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');

const computeVariationSku = (productSku: string, attributes: ProductItemSpecific[]): string => {
  const base = removeDiacritics(productSku);
  const parts = attributes.filter((a) => a.value.trim()).map((a) => removeDiacritics(a.value));
  return [base, ...parts].filter(Boolean).join('-');
};

/** Gợi ý tên + ví dụ giá trị theo thứ tự thuộc tính thường gặp — dùng chung cho popover từng biến thể lẫn "Tạo nhanh biến thể"; dòng thứ 4 trở đi dùng nhãn chung. */
const buildAttributePlaceholders = (t: TFunction<'products'>): { label: string; value: string }[] => [
  { label: t('detail.attributes.sizeLabel'), value: t('detail.attributes.sizeExample') },
  { label: t('detail.attributes.colorLabel'), value: t('detail.attributes.colorExample') },
  { label: t('detail.attributes.typeLabel'), value: t('detail.attributes.typeExample') },
];
const getAttributePlaceholder = (t: TFunction<'products'>, idx: number) =>
  buildAttributePlaceholders(t)[idx] || {
    label: t('detail.attributes.genericLabel'),
    value: t('detail.attributes.genericValue'),
  };

/** Popover chỉnh thuộc tính 1 biến thể dạng key-value tự do (KHÔNG định nghĩa cứng màu/size). */
function VariationAttributesEditor({
  attributes,
  onChange,
}: {
  attributes: ProductItemSpecific[];
  onChange: (next: ProductItemSpecific[]) => void;
}) {
  const { t } = useTranslation(['products', 'common']);
  const [open, setOpen] = useState(false);
  const update = (idx: number, patch: Partial<ProductItemSpecific>) =>
    onChange(attributes.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  const remove = (idx: number) => onChange(attributes.filter((_, i) => i !== idx));
  const add = () => onChange([...attributes, { label: '', value: '' }]);

  const summary = attributes
    .filter((a) => a.label.trim() || a.value.trim())
    .map((a) => (a.label && a.value ? `${a.label}: ${a.value}` : a.label || a.value))
    .join(' · ');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-8 text-left text-xs rounded-md border border-input bg-background px-2 hover:bg-muted truncate"
        >
          {summary || <span className="text-muted-foreground">{t('detail.attributes.addAttribute')}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2" align="start">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">{t('detail.attributes.variantAttributes')}</p>
          <Button variant="outline" size="sm" onClick={add}>
            <Plus size={12} /> {t('common:actions.add')}
          </Button>
        </div>
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {attributes.map((a, idx) => {
            const ph = getAttributePlaceholder(t, idx);
            return (
            <div key={idx} className="flex items-center gap-1.5">
              <Input
                value={a.label}
                onChange={(e) => update(idx, { label: e.target.value })}
                placeholder={ph.label}
                className="h-8 text-xs flex-1"
              />
              <Input
                value={a.value}
                onChange={(e) => update(idx, { value: e.target.value })}
                placeholder={ph.value}
                className="h-8 text-xs flex-1"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(idx)}>
                <Trash2 size={12} className="text-destructive" />
              </Button>
            </div>
            );
          })}
          {attributes.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">{t('detail.attributes.empty')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface BulkDimension {
  label: string;
  /** Danh sách giá trị cách nhau bởi dấu phẩy (VD: "Đỏ, Xanh, Vàng"). */
  values: string;
}

/** Ví dụ danh sách giá trị (số nhiều) theo cùng thứ tự với `buildAttributePlaceholders` — dùng cho "Tạo nhanh biến thể". */
const buildBulkDimValuesExamples = (t: TFunction<'products'>): string[] => [
  t('detail.bulkGenerate.sizeValuesExample'),
  t('detail.bulkGenerate.colorValuesExample'),
  t('detail.bulkGenerate.typeValuesExample'),
];
const getBulkDimPlaceholder = (t: TFunction<'products'>, idx: number) => ({
  label: getAttributePlaceholder(t, idx).label,
  values: buildBulkDimValuesExamples(t)[idx] || t('detail.bulkGenerate.genericValuesExample'),
});

/** Popover "Tạo nhanh biến thể" — cartesian product giữa các thuộc tính (VD: Màu × Size) thành nhiều dòng biến thể 1 lần. */
function BulkGenerateVariantsPopover({ onGenerate }: { onGenerate: (rows: ProductVariation[]) => void }) {
  const { t } = useTranslation('products');
  const [open, setOpen] = useState(false);
  const [dims, setDims] = useState<BulkDimension[]>([{ label: '', values: '' }]);

  const updateDim = (idx: number, patch: Partial<BulkDimension>) =>
    setDims((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  const removeDim = (idx: number) => setDims((prev) => prev.filter((_, i) => i !== idx));

  const previewCount = dims
    .map((d) => d.values.split(',').map((v) => v.trim()).filter(Boolean).length)
    .filter((n) => n > 0)
    .reduce((acc, n) => acc * n, 1);

  const handleGenerate = () => {
    const cleanDims = dims
      .map((d) => ({ label: d.label.trim(), values: d.values.split(',').map((v) => v.trim()).filter(Boolean) }))
      .filter((d) => d.label && d.values.length > 0);
    if (cleanDims.length === 0) return;

    let combos: ProductItemSpecific[][] = [[]];
    for (const dim of cleanDims) {
      const next: ProductItemSpecific[][] = [];
      for (const combo of combos) {
        for (const value of dim.values) next.push([...combo, { label: dim.label, value }]);
      }
      combos = next;
    }

    onGenerate(combos.map((attributes) => ({ sku: '', attributes, status: Status.Active })));
    setDims([{ label: '', values: '' }]);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles size={14} /> {t('detail.bulkGenerate.trigger')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-2" align="end">
        <p className="text-xs font-medium text-foreground">{t('detail.bulkGenerate.title')}</p>
        <p className="text-xs text-muted-foreground">{t('detail.bulkGenerate.description')}</p>
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {dims.map((d, idx) => {
            const ph = getBulkDimPlaceholder(t, idx);
            return (
              <div key={idx} className="flex items-center gap-1.5">
                <Input
                  value={d.label}
                  onChange={(e) => updateDim(idx, { label: e.target.value })}
                  placeholder={ph.label}
                  className="h-8 text-xs w-24 shrink-0"
                />
                <Input
                  value={d.values}
                  onChange={(e) => updateDim(idx, { values: e.target.value })}
                  placeholder={ph.values}
                  className="h-8 text-xs flex-1"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeDim(idx)}>
                  <Trash2 size={12} className="text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between pt-1">
          <Button variant="outline" size="sm" onClick={() => setDims((prev) => [...prev, { label: '', values: '' }])}>
            <Plus size={12} /> {t('detail.bulkGenerate.addAttribute')}
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={previewCount === 0}>
            {previewCount > 0 ? t('detail.bulkGenerate.generateCount', { count: previewCount }) : t('detail.bulkGenerate.generate')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Form fields quan tâm khi so sánh dirty — không gồm data chỉ để hiển thị (factory/machineType/productCategory object). */
interface FormSnapshot {
  shortName: string;
  sku: string;
  status: ProductConfigStatus;
  machineNumber: string;
  mockup: string;
  level: string;
  fabricType: string;
  toolResult: string;
  guide: string;
  factoryId: string;
  machineTypeId: string;
  productCategoryId: string;
  printMethod: string;
  printArea: ProductPrintArea;
  sizeChartUrl: string;
  description: string;
  itemSpecifics: ProductItemSpecific[];
  weight: string;
  width: string;
  height: string;
  length: string;
  variations: ProductVariation[];
}

export default function ProductDetailPage() {
  const { t } = useTranslation(['products', 'common']);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const STATUS_META = useMemo(() => buildStatusMeta(t), [t]);

  const [item, setItem] = useState<ProductConfigRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [factories, setFactories] = useState<RefItem[]>([]);
  const [machineTypes, setMachineTypes] = useState<RefItem[]>([]);
  const [productCategoryOptions, setProductCategoryOptions] = useState<RefItem[]>([]);
  const fabricOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.FabricType] || []);
  const toolOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.ToolResult] || []);
  const printMethodOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.PrintMethod] || []);
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);

  const [shortName, setShortName] = useState('');
  const [sku, setSku] = useState('');
  const [status, setStatus] = useState<ProductConfigStatus>(ProductConfigStatus.Active);
  const [machineNumber, setMachineNumber] = useState('');
  const [mockup, setMockup] = useState('');
  // File vừa chọn nhưng CHƯA upload — chỉ thật sự upload khi bấm Lưu (handleSave).
  const [mockupFile, setMockupFile] = useState<File | null>(null);
  const [sizeChartFile, setSizeChartFile] = useState<File | null>(null);
  const [level, setLevel] = useState<string>('');
  const [fabricType, setFabricType] = useState('');
  const [toolResult, setToolResult] = useState('');
  const [guide, setGuide] = useState('');
  const [factoryId, setFactoryId] = useState('');
  const [machineTypeId, setMachineTypeId] = useState('');

  const [productCategoryId, setProductCategoryId] = useState('');
  const [printMethod, setPrintMethod] = useState('');
  const [printArea, setPrintArea] = useState<ProductPrintArea>([]);
  const [sizeChartUrl, setSizeChartUrl] = useState('');
  const [description, setDescription] = useState('');
  const [itemSpecifics, setItemSpecifics] = useState<ProductItemSpecific[]>([]);
  const [weight, setWeight] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [variations, setVariations] = useState<ProductVariation[]>([]);

  const [baseline, setBaseline] = useState('');

  // Nhập nhanh giá — chỉ ghi đè field nào người dùng thực sự nhập (để trống = giữ nguyên giá cũ từng dòng).
  const [bulkCost, setBulkCost] = useState('');
  const [bulkNonShipCost, setBulkNonShipCost] = useState('');
  const [bulkRetailPrice, setBulkRetailPrice] = useState('');

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  useEffect(() => {
    (async () => {
      try {
        const [fRes, mRes, cRes] = await Promise.all([
          RepositoryRemote.factory.getFactories('?page=1&limit=200'),
          RepositoryRemote.machineType.getMachineTypes('?page=1&limit=200'),
          RepositoryRemote.productCategory.getProductCategories('?page=1&limit=200'),
        ]);
        setFactories((fRes.data?.data || []) as RefItem[]);
        setMachineTypes((mRes.data?.data || []) as RefItem[]);
        setProductCategoryOptions((cRes.data?.data || []) as RefItem[]);
      } catch (error) {
        handleAxiosError(error);
      }
    })();
  }, []);

  const snapshot = (s: FormSnapshot): string => JSON.stringify(s);

  const applyItem = (row: ProductConfigRow) => {
    setItem(row);
    const s: FormSnapshot = {
      shortName: row.shortName || '',
      sku: row.sku || '',
      status: row.status || ProductConfigStatus.Active,
      machineNumber: row.machineNumber || '',
      mockup: row.mockup || '',
      level: row.level != null ? String(row.level) : '',
      fabricType: row.fabricType || '',
      toolResult: row.toolResult || '',
      guide: row.guide || '',
      factoryId: row.factoryId || '',
      machineTypeId: row.machineTypeId || '',
      productCategoryId: row.productCategoryId || '',
      printMethod: row.printMethod || '',
      printArea: row.printArea || [],
      sizeChartUrl: row.sizeChartUrl || '',
      description: row.description || '',
      itemSpecifics: row.itemSpecifics || [],
      weight: row.weight != null ? String(row.weight) : '',
      width: row.width != null ? String(row.width) : '',
      height: row.height != null ? String(row.height) : '',
      length: row.length != null ? String(row.length) : '',
      variations: row.variations || [],
    };
    setShortName(s.shortName);
    setSku(s.sku);
    setStatus(s.status);
    setMachineNumber(s.machineNumber);
    setMockup(s.mockup);
    setLevel(s.level);
    setFabricType(s.fabricType);
    setToolResult(s.toolResult);
    setGuide(s.guide);
    setFactoryId(s.factoryId);
    setMachineTypeId(s.machineTypeId);
    setProductCategoryId(s.productCategoryId);
    setPrintMethod(s.printMethod);
    setPrintArea(s.printArea);
    setSizeChartUrl(s.sizeChartUrl);
    setDescription(s.description);
    setItemSpecifics(s.itemSpecifics);
    setWeight(s.weight);
    setWidth(s.width);
    setHeight(s.height);
    setLength(s.length);
    setVariations(s.variations);
    setBaseline(snapshot(s));
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.productConfig.getProductConfig(id);
        applyItem(res.data.data as ProductConfigRow);
      } catch (error) {
        handleAxiosError(error);
        navigate(PATHS.PRODUCTS);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dirty = useMemo(() => {
    if (!item) return false;
    return (
      snapshot({
        shortName,
        sku,
        status,
        machineNumber,
        mockup,
        level,
        fabricType,
        toolResult,
        guide,
        factoryId,
        machineTypeId,
        productCategoryId,
        printMethod,
        printArea,
        sizeChartUrl,
        description,
        itemSpecifics,
        weight,
        width,
        height,
        length,
        variations,
      }) !== baseline ||
      mockupFile !== null ||
      sizeChartFile !== null
    );
  }, [
    item,
    baseline,
    mockupFile,
    sizeChartFile,
    shortName,
    sku,
    status,
    machineNumber,
    mockup,
    level,
    fabricType,
    toolResult,
    guide,
    factoryId,
    machineTypeId,
    productCategoryId,
    printMethod,
    printArea,
    sizeChartUrl,
    description,
    itemSpecifics,
    weight,
    width,
    height,
    length,
    variations,
  ]);

  // Guard thoát khi có thay đổi chưa lưu: beforeunload (đóng tab/reload) + chặn
  // click link trong app (BrowserRouter không có API block điều hướng).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClickCapture = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href || href.startsWith('#')) return;
      const ok = window.confirm(t('detail.unsavedConfirm'));
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, [dirty, t]);

  const handleBack = () => {
    if (dirty && !window.confirm(t('detail.unsavedConfirm'))) return;
    navigate(PATHS.PRODUCTS);
  };

  if (loading || !item) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  const updateSpecific = (idx: number, patch: Partial<ProductItemSpecific>) => {
    setItemSpecifics((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeSpecific = (idx: number) => setItemSpecifics((prev) => prev.filter((_, i) => i !== idx));

  const togglePrintArea = (key: ProductPrintArea[number], checked: boolean) => {
    setPrintArea((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
  };

  const updateVariation = (idx: number, patch: Partial<ProductVariation>) => {
    setVariations((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };
  const removeVariation = (idx: number) => setVariations((prev) => prev.filter((_, i) => i !== idx));

  const applyBulkPrice = () => {
    if (!bulkCost && !bulkNonShipCost && !bulkRetailPrice) return;
    if (!window.confirm(t('detail.applyBulkPriceConfirm', { count: variations.length }))) return;
    setVariations((prev) =>
      prev.map((v) => ({
        ...v,
        ...(bulkCost ? { cost: Number(bulkCost) } : {}),
        ...(bulkNonShipCost ? { nonShipCost: Number(bulkNonShipCost) } : {}),
        ...(bulkRetailPrice ? { retailPrice: Number(bulkRetailPrice) } : {}),
      })),
    );
  };

  const uploadPendingImage = async (file: File, type: 'mockup' | 'size-chart'): Promise<string> => {
    const formData = new FormData();
    formData.append('type', type);
    formData.append('file', file);
    const res = await RepositoryRemote.productConfig.uploadProductImage(formData);
    return res.data.data.url;
  };

  const handleSave = async () => {
    if (!shortName.trim()) {
      toast.error(t('detail.shortNameRequired'));
      return;
    }

    setSaving(true);
    let finalMockup = mockup.trim();
    let finalSizeChartUrl = sizeChartUrl.trim();
    try {
      if (mockupFile) finalMockup = await uploadPendingImage(mockupFile, 'mockup');
      if (sizeChartFile) finalSizeChartUrl = await uploadPendingImage(sizeChartFile, 'size-chart');
    } catch (error) {
      handleAxiosError(error);
      setSaving(false);
      return;
    }

    const patch: Partial<ProductConfigRow> = {
      shortName: shortName.trim(),
      sku: sku.trim() || undefined,
      status,
      machineNumber: machineNumber.trim() || undefined,
      mockup: finalMockup,
      level: level ? Number(level) : undefined,
      fabricType: fabricType || undefined,
      toolResult: toolResult || undefined,
      guide: guide.trim(),
      ...(factoryId ? { factoryId } : {}),
      ...(machineTypeId ? { machineTypeId } : {}),
      productCategoryId: productCategoryId || undefined,
      printMethod: printMethod || undefined,
      printArea,
      sizeChartUrl: finalSizeChartUrl || undefined,
      description: description.trim() || undefined,
      itemSpecifics: itemSpecifics.filter((x) => x.label.trim() && x.value.trim()),
      weight: weight ? Number(weight) : undefined,
      width: width ? Number(width) : undefined,
      height: height ? Number(height) : undefined,
      length: length ? Number(length) : undefined,
      variations: variations
        .map((v) => {
          const cleanedAttributes = (v.attributes || []).filter((a) => a.label.trim() && a.value.trim());
          const finalSku = v.sku.trim() ? v.sku.trim().toUpperCase() : computeVariationSku(sku, cleanedAttributes);
          return { ...v, sku: finalSku, attributes: cleanedAttributes };
        })
        .filter((v) => v.sku.trim()),
    };
    const f = factories.find((x) => x._id === factoryId);
    if (f) patch.factory = { name: f.name, shortName: f.shortName };
    const m = machineTypes.find((x) => x._id === machineTypeId);
    if (m) patch.machineType = { name: m.name, shortName: m.shortName };
    const c = productCategoryOptions.find((x) => x._id === productCategoryId);
    patch.productCategory = c ? { name: c.name, shortName: c.shortName } : undefined;
    try {
      await RepositoryRemote.productConfig.updateProductConfig(item._id, patch as never);
      applyItem({ ...item, ...patch });
      setMockupFile(null);
      setSizeChartFile(null);
      toast.success(t('detail.saveSuccess'));
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header — sticky để luôn thấy nút Lưu kể cả khi cuộn dài. */}
      <div className="sticky top-0 z-10 -mx-4 md:-mx-6 -mt-4 md:-mt-6 px-4 md:px-6 py-3 bg-background/95 backdrop-blur border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={handleBack} title={t('detail.backToList')} className="shrink-0">
            <ArrowLeft size={18} />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">{item.fullName}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground shrink-0">{t('detail.header.shortName')}</Label>
                <Input
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  className="h-7 w-24 text-xs uppercase"
                />
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground shrink-0">SKU</Label>
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="—"
                  className="h-7 w-28 text-xs"
                />
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductConfigStatus)}
                className={cn(
                  'h-7 rounded-md border px-2 text-xs font-medium text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  STATUS_META[status].className,
                )}
              >
                <option value={ProductConfigStatus.Active}>{STATUS_META[ProductConfigStatus.Active].label}</option>
                <option value={ProductConfigStatus.Inactive}>{STATUS_META[ProductConfigStatus.Inactive].label}</option>
                <option value={ProductConfigStatus.Hidden}>{STATUS_META[ProductConfigStatus.Hidden].label}</option>
              </select>
              {dirty && (
                <Badge className="bg-amber-500 text-white font-normal border-amber-500 shrink-0">
                  {t('detail.header.unsaved')}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving || !dirty} className="shrink-0">
          {saving && <Spinner size={14} />}
          {t('detail.header.saveChanges')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-start">
        {/* Sidebar — thông tin sản xuất, cố định bên trái, luôn thấy khi cuộn tab bên phải. */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-4 lg:sticky lg:top-[76px]">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('detail.sidebar.mockup')}</Label>
            <ImageUploadField
              value={mockup}
              pendingFile={mockupFile}
              onFileSelected={setMockupFile}
              aspectClassName="aspect-square"
            />
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('detail.sidebar.level')}</Label>
            <div className="flex flex-wrap gap-1">
              {PRODUCT_LEVELS.map((lv) => {
                const active = level === String(lv.value);
                return (
                  <button
                    key={lv.value}
                    type="button"
                    onClick={() => setLevel(active ? '' : String(lv.value))}
                    title={lv.label}
                    className={cn(
                      'w-7 h-7 rounded-md text-xs font-semibold border transition-colors',
                      active ? 'text-white' : 'bg-background text-muted-foreground hover:bg-muted',
                    )}
                    style={active ? { backgroundColor: lv.color, borderColor: lv.color } : { borderColor: lv.color }}
                  >
                    {lv.value}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('detail.sidebar.machineNumber')}</Label>
            <Input
              value={machineNumber}
              onChange={(e) => setMachineNumber(e.target.value)}
              placeholder={t('detail.sidebar.machineNumberPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('detail.sidebar.factory')}</Label>
              <select value={factoryId} onChange={(e) => setFactoryId(e.target.value)} className={selectCls}>
                {!factoryId && <option value="">{t('detail.notSelected')}</option>}
                {factories.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.shortName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('detail.sidebar.department')}</Label>
              <select value={machineTypeId} onChange={(e) => setMachineTypeId(e.target.value)} className={selectCls}>
                {!machineTypeId && <option value="">{t('detail.notSelected')}</option>}
                {machineTypes.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.shortName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('detail.sidebar.fabricType')}</Label>
              <select value={fabricType} onChange={(e) => setFabricType(e.target.value)} className={selectCls}>
                <option value="">{t('detail.notSelected')}</option>
                {fabricOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('detail.sidebar.toolResult')}</Label>
              <select value={toolResult} onChange={(e) => setToolResult(e.target.value)} className={selectCls}>
                <option value="">{t('detail.notSelected')}</option>
                {toolOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('detail.sidebar.guide')}</Label>
            <Textarea
              value={guide}
              onChange={(e) => setGuide(e.target.value)}
              placeholder={t('detail.sidebar.guidePlaceholder')}
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        {/* Nội dung chính — catalog cho khách hàng + biến thể. */}
        <div className="rounded-lg border border-border bg-card p-4 md:p-5">
          <Tabs defaultValue="detail">
            <TabsList>
              <TabsTrigger value="detail">{t('detail.tabs.detail')}</TabsTrigger>
              <TabsTrigger value="variations">{t('detail.tabs.variations', { count: variations.length })}</TabsTrigger>
            </TabsList>

            <TabsContent value="detail" className="space-y-5 pt-1">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">{t('detail.classification.title')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('detail.classification.productCategory')}</Label>
                    <select
                      value={productCategoryId}
                      onChange={(e) => setProductCategoryId(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">{t('detail.notSelected')}</option>
                      {sortCategoryTree(productCategoryOptions).map((opt) => (
                        <option key={opt._id} value={opt._id}>
                          {'—'.repeat(opt.depth)} {opt.shortName} · {opt.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('detail.classification.printMethod')}</Label>
                    <select value={printMethod} onChange={(e) => setPrintMethod(e.target.value)} className={selectCls}>
                      <option value="">{t('detail.notSelected')}</option>
                      {printMethodOptions.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">{t('detail.customerDisplay.title')}</h3>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('detail.customerDisplay.printArea')}</Label>
                  <p className="text-xs text-muted-foreground">
                    <Trans
                      t={t}
                      i18nKey="detail.customerDisplay.printAreaHint"
                      components={{ code: <span className="font-mono">order.designs</span> }}
                    />
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2 rounded-md border border-border p-3">
                    {PRODUCT_PRINT_AREAS.map((pa) => (
                      <label key={pa.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={printArea.includes(pa.key)}
                          onChange={(e) => togglePrintArea(pa.key, e.target.checked)}
                          className="rounded border-input"
                        />
                        {t(`printAreas.${pa.key}`, { defaultValue: pa.label })}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('detail.customerDisplay.sizeChart')}</Label>
                  <div className="max-w-[220px]">
                    <ImageUploadField
                      value={sizeChartUrl}
                      pendingFile={sizeChartFile}
                      onFileSelected={setSizeChartFile}
                      aspectClassName="aspect-[3/4]"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('detail.customerDisplay.description')}</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('detail.customerDisplay.descriptionPlaceholder')}
                    rows={3}
                  />
                </div>
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">{t('detail.packaging.title')}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('detail.packaging.weight')}</Label>
                    <Input type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('detail.packaging.width')}</Label>
                    <Input type="number" min={0} value={width} onChange={(e) => setWidth(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('detail.packaging.height')}</Label>
                    <Input type="number" min={0} value={height} onChange={(e) => setHeight(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('detail.packaging.length')}</Label>
                    <Input type="number" min={0} value={length} onChange={(e) => setLength(e.target.value)} />
                  </div>
                </div>
              </section>

              <Separator />

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">{t('detail.itemSpecifics.title')}</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setItemSpecifics((prev) => [...prev, { label: '', value: '' }])}
                  >
                    <Plus size={14} /> {t('detail.itemSpecifics.addRow')}
                  </Button>
                </div>
                <div className="space-y-2">
                  {itemSpecifics.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={s.label}
                        onChange={(e) => updateSpecific(idx, { label: e.target.value })}
                        placeholder={t('detail.itemSpecifics.labelPlaceholder')}
                        className="flex-1"
                      />
                      <Input
                        value={s.value}
                        onChange={(e) => updateSpecific(idx, { value: e.target.value })}
                        placeholder={t('detail.itemSpecifics.valuePlaceholder')}
                        className="flex-1"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeSpecific(idx)}>
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {itemSpecifics.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('detail.itemSpecifics.empty')}</p>
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="variations" className="space-y-3 pt-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {t('detail.variations.skuHintPrefix')}{' '}
                  <span className="font-mono">{t('detail.variations.skuFormat')}</span>
                  {t('detail.variations.skuHintSuffix')}
                  {!sku.trim() && <span className="text-amber-600"> {t('detail.variations.noSkuWarning')}</span>}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <BulkGenerateVariantsPopover
                    onGenerate={(rows) => setVariations((prev) => [...prev, ...rows])}
                  />
                  <Button variant="outline" size="sm" onClick={() => setVariations((prev) => [...prev, emptyVariation()])}>
                    <Plus size={14} /> {t('detail.variations.addVariation')}
                  </Button>
                </div>
              </div>

              {variations.length > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-2.5">
                  <span className="text-xs text-muted-foreground shrink-0">{t('detail.variations.bulkPriceLabel')}</span>
                  <Input
                    type="number"
                    min={0}
                    value={bulkCost}
                    onChange={(e) => setBulkCost(e.target.value)}
                    placeholder={t('detail.variations.cost')}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={bulkNonShipCost}
                    onChange={(e) => setBulkNonShipCost(e.target.value)}
                    placeholder={t('detail.variations.nonShipCost')}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={bulkRetailPrice}
                    onChange={(e) => setBulkRetailPrice(e.target.value)}
                    placeholder={t('detail.variations.retailPrice')}
                    className="h-8 text-xs"
                  />
                  <Button variant="outline" size="sm" className="shrink-0" onClick={applyBulkPrice}>
                    {t('detail.variations.applyToCount', { count: variations.length })}
                  </Button>
                </div>
              )}

              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[130px]">SKU</TableHead>
                      <TableHead className="min-w-[180px]">{t('detail.variations.attributes')}</TableHead>
                      <TableHead className="min-w-[100px]">{t('detail.variations.cost')}</TableHead>
                      <TableHead className="min-w-[110px]">{t('detail.variations.nonShipCost')}</TableHead>
                      <TableHead className="min-w-[100px]">{t('detail.variations.retailPrice')}</TableHead>
                      <TableHead className="min-w-[110px]">{t('detail.variations.status')}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variations.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                          {t('detail.variations.empty')}
                        </TableCell>
                      </TableRow>
                    )}
                    {variations.map((v, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div
                            className="h-8 flex items-center px-2 rounded-md border border-dashed border-border bg-muted/40 font-mono text-xs text-muted-foreground truncate"
                            title={t('detail.variations.skuGeneratedTitle')}
                          >
                            {v.sku.trim() || computeVariationSku(sku, v.attributes || []) || (
                              <span className="italic">{t('detail.variations.skuMissing')}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <VariationAttributesEditor
                            attributes={v.attributes || []}
                            onChange={(attributes) => updateVariation(idx, { attributes })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={v.cost ?? ''}
                            onChange={(e) => updateVariation(idx, { cost: e.target.value ? Number(e.target.value) : undefined })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={v.nonShipCost ?? ''}
                            onChange={(e) =>
                              updateVariation(idx, { nonShipCost: e.target.value ? Number(e.target.value) : undefined })
                            }
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={v.retailPrice ?? ''}
                            onChange={(e) =>
                              updateVariation(idx, { retailPrice: e.target.value ? Number(e.target.value) : undefined })
                            }
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={v.status === Status.Active}
                              onCheckedChange={(checked) =>
                                updateVariation(idx, { status: checked ? Status.Active : Status.Inactive })
                              }
                            />
                            <Badge variant={v.status === Status.Active ? 'secondary' : 'outline'} className="font-normal">
                              {v.status === Status.Active ? t('detail.variations.selling') : t('detail.variations.stopped')}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeVariation(idx)}>
                            <Trash2 size={14} className="text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

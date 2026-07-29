import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, ChevronDown, ChevronUp, Factory, ImageIcon, Info, Layers, Plus, Printer, Trash2, Upload } from 'lucide-react';
import type { ProductItemSpecific, ProductPrintArea, ProductVariation } from 'shared';
import { PRODUCT_LEVELS, PRODUCT_PRINT_AREAS, ProductConfigStatus, WorkshopConfigCategory } from 'shared';
import { toast } from 'sonner';

import { PATHS } from '@/constants/paths';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { RichTextEditor } from '@/components/common/RichTextEditor';
import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { handleAxiosError } from '@/utils';
import { sortCategoryTree } from '@/utils/categoryTree';
import { cn } from '@/utils/cn';

import type { ProductConfigRow, RefItem } from '../ProductConfigTab';
import { buildStatusMeta } from '../ProductConfigTab';
import { BatchEditBar } from '../productForm/BatchEditBar';
import { BulkGeneratePopover } from '../productForm/BulkGeneratePopover';
import type { GalleryImage } from '../productForm/MockupImagesEditor';
import { galleryImageSrc, MockupImagesEditor } from '../productForm/MockupImagesEditor';
import { VariantsTable } from '../productForm/VariantsTable';
import type { VariationGroup } from '../productForm/variantUtils';
import {
  buildCombos,
  cleanGroups,
  computeVariationSku,
  deriveGroups,
  generateVariants,
  matchesSelection,
  VARIANT_GROUP_MAX,
  VARIANTS_MAX,
} from '../productForm/variantUtils';
import { VariationItem } from '../productForm/VariationItem';

const selectCls =
  'w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Ảnh đơn (bảng size) — CHỈ preview local khi chọn, upload thật ở `handleSave` (deferred, xem §2.4a Products.md). */
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
        className={cn('relative w-full rounded-md border border-border bg-muted overflow-hidden group', aspectClassName)}
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

type SectionId = 'sec-production' | 'sec-detail' | 'sec-variants' | 'sec-print-areas';

interface SectionMeta {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  desc: string;
  tile: string;
  accent: string;
}

/**
 * Trang chi tiết 1-trang-dọc: tab sticky chỉ là ANCHOR NAV (click scroll tới
 * section, cuộn tay thì scrollspy tự sáng tab). Mỗi section 1 màu nhận diện
 * riêng (icon tile + viền trái) để phân vùng rõ ràng.
 */
const buildSections = (t: TFunction<'products'>): SectionMeta[] => [
  {
    id: 'sec-production',
    label: t('detail.sections.production.label'),
    icon: Factory,
    desc: t('detail.sections.production.desc'),
    tile: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300',
    accent: 'border-l-indigo-400',
  },
  {
    id: 'sec-detail',
    label: t('detail.sections.details.label'),
    icon: Info,
    desc: t('detail.sections.details.desc'),
    tile: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300',
    accent: 'border-l-sky-400',
  },
  {
    id: 'sec-variants',
    label: t('detail.sections.variants.label'),
    icon: Layers,
    desc: t('detail.sections.variants.desc'),
    tile: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300',
    accent: 'border-l-violet-400',
  },
  {
    id: 'sec-print-areas',
    label: t('detail.sections.printAreas.label'),
    icon: Printer,
    desc: t('detail.sections.printAreas.desc'),
    tile: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
    accent: 'border-l-amber-400',
  },
];

function SectionCard({
  meta,
  number,
  badge,
  children,
}: {
  meta: SectionMeta;
  number: number;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={meta.id} className={`scroll-mt-36 rounded-lg border border-border border-l-4 ${meta.accent} bg-card shadow-sm`}>
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-muted/40 rounded-tr-lg">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.tile}`}>
          <meta.icon size={18} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="text-muted-foreground font-normal">{number}.</span> {meta.label}
            {badge && (
              <Badge variant="secondary" className="font-normal">
                {badge}
              </Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Form fields quan tâm khi so sánh dirty — không gồm data chỉ để hiển thị (factory/machineType/productCategory object). */
interface FormSnapshot {
  fullName: string;
  shortName: string;
  sku: string;
  slug: string;
  status: ProductConfigStatus;
  machineNumber: string;
  galleryUrls: string[];
  level: string;
  fabricType: string;
  toolResult: string;
  guide: string;
  factoryId: string;
  machineTypeId: string;
  productCategoryId: string;
  collectionIds: string[];
  printMethod: string;
  printArea: ProductPrintArea;
  sizeChartUrl: string;
  description: string;
  shortDescription: string;
  templateDescription: string;
  maxProductionTime: string;
  maxShippingTime: string;
  hideForSeller: boolean;
  enableDesignCheck: boolean;
  enableAffiliate: boolean;
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
  const isNew = id === 'new';
  const navigate = useNavigate();
  const STATUS_META = useMemo(() => buildStatusMeta(t), [t]);
  const SECTIONS = useMemo(() => buildSections(t), [t]);

  const [item, setItem] = useState<ProductConfigRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('sec-production');
  // Đang smooth-scroll do click tab → tạm khóa scrollspy để tab không nhấp nháy.
  const clickScrollUntil = useRef(0);

  const [factories, setFactories] = useState<RefItem[]>([]);
  const [machineTypes, setMachineTypes] = useState<RefItem[]>([]);
  const [productCategoryOptions, setProductCategoryOptions] = useState<RefItem[]>([]);
  const [collectionOptions, setCollectionOptions] = useState<RefItem[]>([]);
  const fabricOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.FabricType] || []);
  const toolOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.ToolResult] || []);
  const printMethodOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.PrintMethod] || []);
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);

  const [fullName, setFullName] = useState('');
  const [shortName, setShortName] = useState('');
  const [sku, setSku] = useState('');
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState<ProductConfigStatus>(ProductConfigStatus.Active);
  const [machineNumber, setMachineNumber] = useState('');
  /** Gallery ảnh — index 0 = ảnh CHÍNH (`mockup`), còn lại `images[]`; entry có `file` = chờ upload khi Lưu. */
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [sizeChartFile, setSizeChartFile] = useState<File | null>(null);
  const [level, setLevel] = useState<string>('');
  const [fabricType, setFabricType] = useState('');
  const [toolResult, setToolResult] = useState('');
  const [guide, setGuide] = useState('');
  const [factoryId, setFactoryId] = useState('');
  const [machineTypeId, setMachineTypeId] = useState('');

  const [productCategoryId, setProductCategoryId] = useState('');
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [printMethod, setPrintMethod] = useState('');
  const [printArea, setPrintArea] = useState<ProductPrintArea>([]);
  const [sizeChartUrl, setSizeChartUrl] = useState('');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [maxProductionTime, setMaxProductionTime] = useState('');
  const [maxShippingTime, setMaxShippingTime] = useState('');
  const [hideForSeller, setHideForSeller] = useState(false);
  const [enableDesignCheck, setEnableDesignCheck] = useState(false);
  const [enableAffiliate, setEnableAffiliate] = useState(false);
  const [itemSpecifics, setItemSpecifics] = useState<ProductItemSpecific[]>([]);
  const [weight, setWeight] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [groups, setGroups] = useState<VariationGroup[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  /** Bộ chọn Batch Edit từng nhóm (Set rỗng = All) — thẳng hàng với `effectiveGroups`. */
  const [batchSelected, setBatchSelected] = useState<Array<Set<string>>>([]);

  const [baseline, setBaseline] = useState('');

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  useEffect(() => {
    (async () => {
      try {
        const [fRes, mRes, cRes, colRes] = await Promise.all([
          RepositoryRemote.factory.getFactories('?page=1&limit=200'),
          RepositoryRemote.machineType.getMachineTypes('?page=1&limit=200'),
          RepositoryRemote.productCategory.getProductCategories('?page=1&limit=200'),
          RepositoryRemote.collection.getCollections('?page=1&limit=200'),
        ]);
        setFactories((fRes.data?.data || []) as RefItem[]);
        setMachineTypes((mRes.data?.data || []) as RefItem[]);
        setProductCategoryOptions((cRes.data?.data || []) as RefItem[]);
        setCollectionOptions((colRes.data?.data || []) as RefItem[]);
      } catch (error) {
        handleAxiosError(error);
      }
    })();
  }, []);

  const snapshot = (s: FormSnapshot): string => JSON.stringify(s);

  const buildSnapshot = (): FormSnapshot => ({
    fullName,
    shortName,
    sku,
    slug,
    status,
    machineNumber,
    galleryUrls: gallery.filter((g) => g.url).map((g) => g.url as string),
    level,
    fabricType,
    toolResult,
    guide,
    factoryId,
    machineTypeId,
    productCategoryId,
    collectionIds,
    printMethod,
    printArea,
    sizeChartUrl,
    description,
    shortDescription,
    templateDescription,
    maxProductionTime,
    maxShippingTime,
    hideForSeller,
    enableDesignCheck,
    enableAffiliate,
    itemSpecifics,
    weight,
    width,
    height,
    length,
    variations,
  });

  const applyItem = (row: ProductConfigRow) => {
    setItem(row);
    const s: FormSnapshot = {
      fullName: row.fullName || '',
      shortName: row.shortName || '',
      sku: row.sku || '',
      slug: row.slug || '',
      status: row.status || ProductConfigStatus.Active,
      machineNumber: row.machineNumber || '',
      galleryUrls: [...(row.mockup ? [row.mockup] : []), ...(row.images || [])],
      level: row.level != null ? String(row.level) : '',
      fabricType: row.fabricType || '',
      toolResult: row.toolResult || '',
      guide: row.guide || '',
      factoryId: row.factoryId || '',
      machineTypeId: row.machineTypeId || '',
      productCategoryId: row.productCategoryId || '',
      collectionIds: row.collectionIds || [],
      printMethod: row.printMethod || '',
      printArea: row.printArea || [],
      sizeChartUrl: row.sizeChartUrl || '',
      description: row.description || '',
      shortDescription: row.shortDescription || '',
      templateDescription: row.templateDescription || '',
      maxProductionTime: row.maxProductionTime != null ? String(row.maxProductionTime) : '',
      maxShippingTime: row.maxShippingTime != null ? String(row.maxShippingTime) : '',
      hideForSeller: !!row.hideForSeller,
      enableDesignCheck: !!row.enableDesignCheck,
      enableAffiliate: !!row.enableAffiliate,
      itemSpecifics: row.itemSpecifics || [],
      weight: row.weight != null ? String(row.weight) : '',
      width: row.width != null ? String(row.width) : '',
      height: row.height != null ? String(row.height) : '',
      length: row.length != null ? String(row.length) : '',
      variations: row.variations || [],
    };
    setFullName(s.fullName);
    setShortName(s.shortName);
    setSku(s.sku);
    setSlug(s.slug);
    setStatus(s.status);
    setMachineNumber(s.machineNumber);
    setGallery(s.galleryUrls.map((url) => ({ url })));
    setLevel(s.level);
    setFabricType(s.fabricType);
    setToolResult(s.toolResult);
    setGuide(s.guide);
    setFactoryId(s.factoryId);
    setMachineTypeId(s.machineTypeId);
    setProductCategoryId(s.productCategoryId);
    setCollectionIds(s.collectionIds);
    setPrintMethod(s.printMethod);
    setPrintArea(s.printArea);
    setSizeChartUrl(s.sizeChartUrl);
    setDescription(s.description);
    setShortDescription(s.shortDescription);
    setTemplateDescription(s.templateDescription);
    setMaxProductionTime(s.maxProductionTime);
    setMaxShippingTime(s.maxShippingTime);
    setHideForSeller(s.hideForSeller);
    setEnableDesignCheck(s.enableDesignCheck);
    setEnableAffiliate(s.enableAffiliate);
    setItemSpecifics(s.itemSpecifics);
    setWeight(s.weight);
    setWidth(s.width);
    setHeight(s.height);
    setLength(s.length);
    setVariations(s.variations);
    setGroups(deriveGroups(s.variations));
    setBaseline(snapshot(s));
  };

  useEffect(() => {
    if (isNew) {
      applyItem({ _id: '', fullName: '', shortName: '', status: ProductConfigStatus.Active });
      setLoading(false);
      return;
    }
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

  const pendingGalleryFiles = gallery.some((g) => g.file);

  const dirty = useMemo(
    () => {
      if (!item) return false;
      return snapshot(buildSnapshot()) !== baseline || pendingGalleryFiles || sizeChartFile !== null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      item,
      baseline,
      pendingGalleryFiles,
      sizeChartFile,
      fullName,
      shortName,
      sku,
      slug,
      status,
      machineNumber,
      gallery,
      level,
      fabricType,
      toolResult,
      guide,
      factoryId,
      machineTypeId,
      productCategoryId,
      collectionIds,
      printMethod,
      printArea,
      sizeChartUrl,
      description,
      shortDescription,
      templateDescription,
      maxProductionTime,
      maxShippingTime,
      hideForSeller,
      enableDesignCheck,
      enableAffiliate,
      itemSpecifics,
      weight,
      width,
      height,
      length,
      variations,
    ],
  );

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

  // Scrollspy — section trong dải 20-45% phía trên viewport thì tab đó sáng.
  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < clickScrollUntil.current) return;
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveSection(visible[0].target.id as SectionId);
      },
      { rootMargin: '-20% 0px -55% 0px' },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [loading, SECTIONS]);

  const scrollToSection = (secId: SectionId) => {
    setActiveSection(secId);
    clickScrollUntil.current = Date.now() + 800;
    document.getElementById(secId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleBack = () => {
    if (dirty && !window.confirm(t('detail.unsavedConfirm'))) return;
    navigate(PATHS.PRODUCTS);
  };

  const handleDeleteProduct = async () => {
    if (!item || isNew) return;
    if (!window.confirm(t('detail.deleteConfirm', { name: item.fullName }))) return;
    try {
      setDeleting(true);
      await RepositoryRemote.productConfig.deleteProductConfig(item._id);
      toast.success(t('detail.deleteSuccess', { name: item.fullName }));
      navigate(PATHS.PRODUCTS);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setDeleting(false);
    }
  };

  const toggleCollection = (cid: string) =>
    setCollectionIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));

  const updateSpecific = (idx: number, patch: Partial<ProductItemSpecific>) =>
    setItemSpecifics((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const removeSpecific = (idx: number) => setItemSpecifics((prev) => prev.filter((_, i) => i !== idx));

  const togglePrintArea = (key: ProductPrintArea[number], checked: boolean) =>
    setPrintArea((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));

  /**
   * Tự sinh lại bảng variants (diff-preserve) khi 1 nhóm bấm Done hoặc bị xóa —
   * KHÔNG còn nút "Tạo biến thể" riêng. Chỉ chạy khi MỌI nhóm đã hoàn chỉnh
   * (có tên + ≥1 option) — còn nhóm đang soạn dở thì đợi nhóm đó Done.
   */
  const regenerate = (nextGroups: VariationGroup[]) => {
    // Option rỗng/nhóm soạn dở bị loại (`cleanGroups`) — còn nhóm nào chưa hoàn chỉnh thì đợi Done hết.
    const cleaned = cleanGroups(nextGroups);
    if (cleaned.length === 0 || cleaned.length !== nextGroups.length) return;
    const comboCount = buildCombos(cleaned).length;
    if (comboCount > VARIANTS_MAX) {
      toast.error(t('detail.groups.tooMany', { count: comboCount, max: VARIANTS_MAX }));
      return;
    }
    const result = generateVariants(cleaned, variations);
    setVariations(result.variants);
    if (result.orphans) {
      toast.warning(t('detail.groups.generatedOrphans', { created: result.created, kept: result.kept, orphans: result.orphans }));
    } else {
      toast.success(t('detail.groups.generated', { created: result.created, kept: result.kept }));
    }
  };

  /** Nhóm option đã làm sạch — nguồn DUY NHẤT cho bảng/orphan/Batch Edit (nhóm soạn dở không ảnh hưởng). */
  const effectiveGroups = useMemo(() => cleanGroups(groups), [groups]);

  // Nhóm đổi (Done/xóa) → reset bộ chọn Batch Edit cho thẳng hàng index.
  useEffect(() => {
    setBatchSelected(effectiveGroups.map(() => new Set<string>()));
  }, [effectiveGroups]);

  const batchHasSelection = batchSelected.some((s) => s.size > 0);

  /** Lọc bảng theo bộ chọn Batch Edit (chỉ khi bar đang mở + có chọn) — memo để row memo không bị phá. */
  const batchRowFilter = useMemo(() => {
    if (!batchOpen || !batchHasSelection) return undefined;
    return (v: ProductVariation) => matchesSelection(v, effectiveGroups, batchSelected);
  }, [batchOpen, batchHasSelection, effectiveGroups, batchSelected]);

  const batchMatchedCount = useMemo(
    () => variations.filter((v) => matchesSelection(v, effectiveGroups, batchSelected)).length,
    [variations, effectiveGroups, batchSelected],
  );

  const applyBatch = (patch: Partial<ProductVariation>) => {
    setVariations((prev) => prev.map((v) => (matchesSelection(v, effectiveGroups, batchSelected) ? { ...v, ...patch } : v)));
    toast.success(t('detail.batchEdit.applied', { count: batchMatchedCount }));
  };

  /** HTML rỗng của quill ("<p><br></p>") coi như không có nội dung. */
  const cleanHtml = (html: string): string => {
    const stripped = html.replace(/<[^>]+>/g, '').replace(/\s|&nbsp;/g, '');
    return stripped ? html : '';
  };

  const uploadPendingImage = async (file: File, type: 'mockup' | 'size-chart'): Promise<string> => {
    const formData = new FormData();
    formData.append('type', type);
    formData.append('file', file);
    const res = await RepositoryRemote.productConfig.uploadProductImage(formData);
    return res.data.data.url;
  };

  const handleSave = async () => {
    if (isNew && !fullName.trim()) {
      toast.error(t('detail.fullNameRequired'));
      return;
    }
    if (!shortName.trim()) {
      toast.error(t('detail.shortNameRequired'));
      return;
    }
    if (isNew && !factoryId) {
      toast.error(t('detail.factoryRequired'));
      scrollToSection('sec-production');
      return;
    }
    if (isNew && !machineTypeId) {
      toast.error(t('detail.machineTypeRequired'));
      scrollToSection('sec-production');
      return;
    }

    setSaving(true);
    // Upload các ảnh đang chờ (gallery + bảng size) TRƯỚC — lỗi thì dừng, KHÔNG PATCH.
    let galleryUrls: string[];
    let finalSizeChartUrl = sizeChartUrl.trim();
    try {
      galleryUrls = [];
      for (const img of gallery) {
        if (img.url) {
          galleryUrls.push(img.url);
        } else if (img.file) {
          galleryUrls.push(await uploadPendingImage(img.file, 'mockup'));
        }
      }
      if (sizeChartFile) finalSizeChartUrl = await uploadPendingImage(sizeChartFile, 'size-chart');
    } catch (error) {
      handleAxiosError(error);
      setSaving(false);
      return;
    }

    const patch: Partial<ProductConfigRow> = {
      fullName: fullName.trim(),
      shortName: shortName.trim(),
      sku: sku.trim() || undefined,
      slug: slug.trim() || undefined,
      status,
      machineNumber: machineNumber.trim() || undefined,
      mockup: galleryUrls[0] || '',
      images: galleryUrls.slice(1),
      level: level ? Number(level) : undefined,
      fabricType: fabricType || undefined,
      toolResult: toolResult || undefined,
      guide: cleanHtml(guide),
      ...(factoryId ? { factoryId } : {}),
      ...(machineTypeId ? { machineTypeId } : {}),
      productCategoryId: productCategoryId || undefined,
      collectionIds,
      printMethod: printMethod || undefined,
      printArea,
      sizeChartUrl: finalSizeChartUrl || undefined,
      description: cleanHtml(description) || undefined,
      shortDescription: cleanHtml(shortDescription) || undefined,
      templateDescription: cleanHtml(templateDescription) || undefined,
      maxProductionTime: maxProductionTime ? Number(maxProductionTime) : undefined,
      maxShippingTime: maxShippingTime ? Number(maxShippingTime) : undefined,
      hideForSeller,
      enableDesignCheck,
      enableAffiliate,
      itemSpecifics: itemSpecifics.filter((x) => x.label.trim() && x.value.trim()),
      weight: weight ? Number(weight) : undefined,
      width: width ? Number(width) : undefined,
      height: height ? Number(height) : undefined,
      length: length ? Number(length) : undefined,
      // SKU biến thể tự sinh theo quy ước cho dòng mới; dòng có sku DB giữ nguyên.
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
      if (isNew) {
        const res = await RepositoryRemote.productConfig.createProductConfig(patch as never);
        setSizeChartFile(null);
        toast.success(t('detail.createSuccess'));
        navigate(PATHS.PRODUCT_DETAIL.replace(':id', res.data.data._id), { replace: true });
      } else {
        await RepositoryRemote.productConfig.updateProductConfig(item!._id, patch as never);
        applyItem({ ...item!, ...patch });
        setSizeChartFile(null);
        toast.success(t('detail.saveSuccess'));
      }
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !item) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  const primaryImage = gallery.length ? galleryImageSrc(gallery[0]) : '';

  return (
    <div className="-mx-4 md:-mx-6 -mt-4 md:-mt-6">
      {/* ─── Sticky header + anchor nav ─── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 md:px-6">
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={handleBack} title={t('detail.backToList')} className="shrink-0">
              <ArrowLeft size={18} />
            </Button>
            {primaryImage ? (
              <img
                src={primaryImage}
                alt="mockup"
                className="w-9 h-9 rounded object-cover border border-border bg-muted shrink-0"
              />
            ) : null}
            <div className="min-w-0">
              {isNew ? (
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('detail.header.fullNamePlaceholder')}
                  className="h-8 text-lg font-bold"
                />
              ) : (
                <h1 className="text-base md:text-lg font-bold text-foreground truncate leading-tight">{item.fullName}</h1>
              )}
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
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    placeholder="—"
                    className="h-7 w-28 text-xs font-mono"
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
          <div className="flex items-center gap-2 shrink-0">
            {!isNew && (
              <Button variant="outline" onClick={handleDeleteProduct} disabled={deleting || saving} title={t('detail.deleteTitle')}>
                {deleting ? <Spinner size={14} /> : <Trash2 size={14} className="text-destructive" />}
                {t('detail.deleteButton')}
              </Button>
            )}
            <Button variant="outline" onClick={handleBack} disabled={saving}>
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || (!isNew && !dirty)}>
              {saving && <Spinner size={14} />}
              {t(isNew ? 'detail.header.createProduct' : 'detail.header.saveChanges')}
            </Button>
          </div>
        </div>
        {/* Anchor nav — click scroll tới section, scrollspy tự sáng khi cuộn tay */}
        <nav className="flex items-center gap-1 overflow-x-auto">
          {SECTIONS.map((s, i) => {
            const active = activeSection === s.id;
            const count = s.id === 'sec-variants' ? variations.length : s.id === 'sec-print-areas' ? printArea.length : null;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToSection(s.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className={`w-5 h-5 rounded flex items-center justify-center ${s.tile}`}>
                  <s.icon size={12} />
                </span>
                {i + 1}. {s.label}
                {count != null && (
                  <Badge variant={active ? 'default' : 'secondary'} className="px-1.5 py-0 text-[10px] font-normal">
                    {count}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ─── Body — 4 section dọc ─── */}
      <div className="px-4 md:px-6 py-6 space-y-8 bg-muted/20">
        {/* ══ 1. Production ══ */}
        <SectionCard meta={SECTIONS[0]} number={1}>
          <div className="grid lg:grid-cols-[minmax(280px,380px)_1fr] gap-8">
            {/* Gallery */}
            <div className="space-y-2">
              <Label>{t('detail.gallery.label')}</Label>
              <MockupImagesEditor images={gallery} onChange={setGallery} />
            </div>

            {/* Fields */}
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('detail.production.slug')}</Label>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="new-all-over-print-hawaiian-shirt"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('detail.sidebar.machineNumber')}</Label>
                  <Input
                    value={machineNumber}
                    onChange={(e) => setMachineNumber(e.target.value)}
                    placeholder={t('detail.sidebar.machineNumberPlaceholder')}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t('detail.sidebar.level')}</Label>
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

              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('detail.sidebar.factory')}</Label>
                  <select value={factoryId} onChange={(e) => setFactoryId(e.target.value)} className={selectCls}>
                    {!factoryId && <option value="">{t('detail.notSelected')}</option>}
                    {factories.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.shortName} · {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('detail.sidebar.department')}</Label>
                  <select value={machineTypeId} onChange={(e) => setMachineTypeId(e.target.value)} className={selectCls}>
                    {!machineTypeId && <option value="">{t('detail.notSelected')}</option>}
                    {machineTypes.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.shortName} · {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('detail.sidebar.fabricType')}</Label>
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
                  <Label>{t('detail.sidebar.toolResult')}</Label>
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

              {/* Toggles — parity hệ cũ, mới lưu dữ liệu, CHƯA wire logic */}
              <div className="grid md:grid-cols-3 gap-3">
                <label className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
                  {t('detail.toggles.hideForSeller')}
                  <Switch checked={hideForSeller} onCheckedChange={setHideForSeller} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
                  {t('detail.toggles.designCheck')}
                  <Switch checked={enableDesignCheck} onCheckedChange={setEnableDesignCheck} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
                  {t('detail.toggles.affiliate')}
                  <Switch checked={enableAffiliate} onCheckedChange={setEnableAffiliate} />
                </label>
              </div>

              <div className="space-y-1.5">
                <Label>{t('detail.sidebar.guide')}</Label>
                <RichTextEditor value={guide} onChange={setGuide} placeholder={t('detail.sidebar.guidePlaceholder')} minHeight={140} />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ══ 2. Product Details ══ */}
        <SectionCard meta={SECTIONS[1]} number={2}>
          <div className="grid lg:grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('detail.classification.productCategory')}</Label>
                  <select value={productCategoryId} onChange={(e) => setProductCategoryId(e.target.value)} className={selectCls}>
                    <option value="">{t('detail.notSelected')}</option>
                    {sortCategoryTree(productCategoryOptions).map((opt) => (
                      <option key={opt._id} value={opt._id}>
                        {'—'.repeat(opt.depth)} {opt.shortName} · {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('detail.classification.printMethod')}</Label>
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

              <div className="space-y-1.5">
                <Label>{t('detail.collectionsField.label')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {collectionOptions.map((col) => {
                    const active = collectionIds.includes(col._id);
                    return (
                      <button key={col._id} type="button" onClick={() => toggleCollection(col._id)}>
                        <Badge variant={active ? 'default' : 'outline'} className="cursor-pointer font-normal">
                          {col.name}
                        </Badge>
                      </button>
                    );
                  })}
                  {collectionOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('detail.collectionsField.empty')}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t('detail.customerDisplay.sizeChart')}</Label>
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
                <Label>{t('detail.shippingTime.title')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{t('detail.shippingTime.maxProduction')}</span>
                    <Input type="number" min={0} value={maxProductionTime} onChange={(e) => setMaxProductionTime(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{t('detail.shippingTime.maxShipping')}</span>
                    <Input type="number" min={0} value={maxShippingTime} onChange={(e) => setMaxShippingTime(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t('detail.logistics.title')}</Label>
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{t('detail.logistics.weight')}</span>
                    <Input type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{t('detail.logistics.width')}</span>
                    <Input type="number" min={0} value={width} onChange={(e) => setWidth(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{t('detail.logistics.height')}</span>
                    <Input type="number" min={0} value={height} onChange={(e) => setHeight(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{t('detail.logistics.length')}</span>
                    <Input type="number" min={0} value={length} onChange={(e) => setLength(e.target.value)} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">{t('detail.logistics.hint')}</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{t('detail.itemSpecifics.title')}</Label>
                  <Button variant="outline" size="sm" onClick={() => setItemSpecifics((prev) => [...prev, { label: '', value: '' }])}>
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
                  {itemSpecifics.length === 0 && <p className="text-xs text-muted-foreground">{t('detail.itemSpecifics.empty')}</p>}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('detail.descriptions.short')}</Label>
                <RichTextEditor
                  value={shortDescription}
                  onChange={setShortDescription}
                  placeholder={t('detail.descriptions.shortPlaceholder')}
                  minHeight={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('detail.descriptions.item')}</Label>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder={t('detail.descriptions.itemPlaceholder')}
                  minHeight={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('detail.descriptions.template')}</Label>
                <RichTextEditor
                  value={templateDescription}
                  onChange={setTemplateDescription}
                  placeholder={t('detail.descriptions.templatePlaceholder')}
                  minHeight={120}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ══ 3. Variants & Price ══ */}
        <SectionCard meta={SECTIONS[2]} number={3} badge={t('detail.counts.variants', { count: variations.length })}>
          <div className="space-y-3">
            {/* Option group cards — bấm Done / xóa nhóm là bảng dưới tự sinh lại */}
            {groups.map((g, idx) => (
              <VariationItem
                key={idx}
                group={g}
                defaultEditing={!g.name.trim() && g.options.length === 0}
                otherNames={groups.filter((_, i) => i !== idx).map((x) => x.name)}
                onChange={(patch) => setGroups((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)))}
                onRemove={() => {
                  const next = groups.filter((_, i) => i !== idx);
                  setGroups(next);
                  regenerate(next);
                }}
                onDone={(clean) => {
                  const next = groups.map((x, i) => (i === idx ? clean : x));
                  setGroups(next);
                  regenerate(next);
                }}
              />
            ))}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary"
                disabled={groups.length >= VARIANT_GROUP_MAX}
                onClick={() => setGroups((prev) => [...prev, { name: '', options: [] }])}
              >
                <Plus size={14} /> {t('detail.groups.addVariant')}
              </Button>
              <BulkGeneratePopover
                existingGroups={effectiveGroups}
                onGenerate={(dims) => {
                  // Nhóm soạn dở (card rỗng đang mở) bị thay bằng dims tạo nhanh — nhóm hoàn chỉnh giữ nguyên.
                  const next = [...cleanGroups(groups), ...dims];
                  setGroups(next);
                  regenerate(next);
                }}
              />
            </div>

            {/* Variation List + Batch Edit */}
            <div className="flex items-end justify-between gap-3 pt-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  {t('detail.groups.variationList')}
                  <Badge variant="secondary" className="font-normal">
                    {variations.length}
                  </Badge>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t('detail.variations.skuHintPrefix')} <span className="font-mono">{t('detail.variations.skuFormat')}</span>
                  {t('detail.variations.skuHintSuffix')}
                  {!sku.trim() && <span className="text-amber-600"> {t('detail.variations.noSkuWarning')}</span>}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setBatchOpen((o) => !o)}
                disabled={variations.length === 0}
              >
                {t('detail.groups.batchEdit')} {batchOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Button>
            </div>
            {batchOpen && variations.length > 0 && (
              <BatchEditBar
                groups={effectiveGroups}
                selected={batchSelected}
                onSelectedChange={setBatchSelected}
                matchedCount={batchMatchedCount}
                total={variations.length}
                onApply={applyBatch}
              />
            )}
            <VariantsTable
              groups={effectiveGroups}
              variants={variations}
              skuPrefix={sku}
              onChange={setVariations}
              rowFilter={batchRowFilter}
            />
          </div>
        </SectionCard>

        {/* ══ 4. Print Areas ══ */}
        <SectionCard meta={SECTIONS[3]} number={4} badge={t('detail.counts.printAreas', { count: printArea.length })}>
          <p className="text-xs text-muted-foreground mb-3">
            <Trans
              t={t}
              i18nKey="detail.customerDisplay.printAreaHint"
              components={{ code: <span className="font-mono">order.designs</span> }}
            />
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2 rounded-md border border-border p-3">
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
        </SectionCard>

        {/* Footer save */}
        <div className="flex items-center justify-end gap-2 pb-6">
          {!isNew && (
            <Button variant="outline" onClick={handleDeleteProduct} disabled={deleting || saving} title={t('detail.deleteTitle')}>
              {deleting ? <Spinner size={14} /> : <Trash2 size={14} className="text-destructive" />}
              {t('detail.deleteButton')}
            </Button>
          )}
          <Button variant="outline" onClick={handleBack} disabled={saving}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || (!isNew && !dirty)}>
            {saving && <Spinner size={14} />}
            {t(isNew ? 'detail.header.createProduct' : 'detail.header.saveChanges')}
          </Button>
        </div>
      </div>

    </div>
  );
}

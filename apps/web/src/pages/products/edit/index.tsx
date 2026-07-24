import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Factory, Info, Layers, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import type { ProductItemSpecific, ProductPrintArea, ProductVariation } from 'shared';
import { PRODUCT_LEVEL_MAP, PRODUCT_LEVELS, PRODUCT_OPTION_GROUP_MAX, PRODUCT_VARIANTS_MAX, WorkshopConfigCategory } from 'shared';
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

import type { ProductConfigRow, RefItem } from '../ProductConfigTab';
import { BatchEditDialog } from '../productForm/BatchEditDialog';
import { MockupImagesEditor } from '../productForm/MockupImagesEditor';
import { PrintAreasEditor } from '../productForm/PrintAreasEditor';
import { VariantsTable } from '../productForm/VariantsTable';
import type { VariationGroup } from '../productForm/variantUtils';
import { buildCombos, deriveGroups, generateVariants } from '../productForm/variantUtils';
import { VariationItem } from '../productForm/VariationItem';

const selectCls =
  'w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/**
 * Trang sửa sản phẩm 1-trang-dọc: tab sticky chỉ là ANCHOR NAV (click scroll
 * tới section, cuộn tay thì scrollspy tự sáng tab). Mỗi section 1 màu nhận
 * diện riêng (icon tile + viền trái) để phân vùng rõ ràng.
 */
const SECTIONS = [
  {
    id: 'sec-production',
    label: 'Production',
    icon: Factory,
    desc: 'Factory & machine mapping, defaults applied to imported orders.',
    tile: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300',
    accent: 'border-l-indigo-400',
  },
  {
    id: 'sec-detail',
    label: 'Product Details',
    icon: Info,
    desc: 'Catalog information shown to customers on the portal.',
    tile: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300',
    accent: 'border-l-sky-400',
  },
  {
    id: 'sec-variants',
    label: 'Variants & Price',
    icon: Layers,
    desc: 'Define option groups, generate combinations, set prices. Regenerating never wipes entered prices.',
    tile: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300',
    accent: 'border-l-violet-400',
  },
  {
    id: 'sec-print-areas',
    label: 'Print Areas',
    icon: Printer,
    desc: 'Keys map to design_<key> columns for CSV/API ordering.',
    tile: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
    accent: 'border-l-amber-400',
  },
] as const;

type SectionMeta = (typeof SECTIONS)[number];
type SectionId = SectionMeta['id'];

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

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [item, setItem] = useState<ProductConfigRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('sec-production');
  // Đang smooth-scroll do click tab → tạm khóa scrollspy để tab không nhấp nháy.
  const clickScrollUntil = useRef(0);

  // Options cho dropdown.
  const [factoryOptions, setFactoryOptions] = useState<RefItem[]>([]);
  const [machineTypeOptions, setMachineTypeOptions] = useState<RefItem[]>([]);
  const [productCategoryOptions, setProductCategoryOptions] = useState<RefItem[]>([]);
  const [collectionOptions, setCollectionOptions] = useState<RefItem[]>([]);
  const fabricOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.FabricType] || []);
  const toolOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.ToolResult] || []);
  const printMethodOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.PrintMethod] || []);
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);

  // ─── Form state ───
  /** Gallery ảnh — index 0 = primary (lưu `mockup`), còn lại lưu `images[]`. */
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [slug, setSlug] = useState('');
  const [sku, setSku] = useState('');
  const [level, setLevel] = useState<string>('');
  const [fabricType, setFabricType] = useState('');
  const [toolResult, setToolResult] = useState('');
  const [guide, setGuide] = useState('');
  const [factoryId, setFactoryId] = useState('');
  const [machineTypeId, setMachineTypeId] = useState('');
  const [productCategoryId, setProductCategoryId] = useState('');
  const [printMethod, setPrintMethod] = useState('');
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
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [printAreas, setPrintAreas] = useState<ProductPrintArea[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const [pRes, fRes, mRes, cRes, colRes] = await Promise.all([
          RepositoryRemote.productConfig.getProductConfig(id),
          RepositoryRemote.factory.getFactories('?page=1&limit=200'),
          RepositoryRemote.machineType.getMachineTypes('?page=1&limit=200'),
          RepositoryRemote.productCategory.getProductCategories('?page=1&limit=200'),
          RepositoryRemote.collection.getCollections('?page=1&limit=200'),
        ]);
        setFactoryOptions((fRes.data?.data || []) as RefItem[]);
        setMachineTypeOptions((mRes.data?.data || []) as RefItem[]);
        setProductCategoryOptions((cRes.data?.data || []) as RefItem[]);
        setCollectionOptions((colRes.data?.data || []) as RefItem[]);

        const p: ProductConfigRow = pRes.data?.data;
        setItem(p);
        setGalleryImages([...(p.mockup ? [p.mockup] : []), ...(p.images || [])]);
        setSlug(p.slug || '');
        setSku(p.sku || '');
        setLevel(p.level != null ? String(p.level) : '');
        setFabricType(p.fabricType || '');
        setToolResult(p.toolResult || '');
        setGuide(p.guide || '');
        setFactoryId(p.factoryId || '');
        setMachineTypeId(p.machineTypeId || '');
        setProductCategoryId(p.productCategoryId || '');
        setPrintMethod(p.printMethod || '');
        setSizeChartUrl(p.sizeChartUrl || '');
        setDescription(p.description || '');
        setShortDescription(p.shortDescription || '');
        setTemplateDescription(p.templateDescription || '');
        setMaxProductionTime(p.maxProductionTime != null ? String(p.maxProductionTime) : '');
        setMaxShippingTime(p.maxShippingTime != null ? String(p.maxShippingTime) : '');
        setHideForSeller(!!p.hideForSeller);
        setEnableDesignCheck(!!p.enableDesignCheck);
        setEnableAffiliate(!!p.enableAffiliate);
        setItemSpecifics(p.itemSpecifics || []);
        setWeight(p.weight != null ? String(p.weight) : '');
        setWidth(p.width != null ? String(p.width) : '');
        setHeight(p.height != null ? String(p.height) : '');
        setLength(p.length != null ? String(p.length) : '');
        const derived = deriveGroups(p.optionNames, p.variations || []);
        setGroups(derived.groups);
        setVariations(derived.variants);
        setCollectionIds(p.collectionIds || []);
        setPrintAreas(p.printAreas || []);
      } catch (error) {
        handleAxiosError(error);
        navigate(PATHS.PRODUCTS);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, navigate]);

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
  }, [loading]);

  const scrollToSection = (secId: SectionId) => {
    setActiveSection(secId);
    clickScrollUntil.current = Date.now() + 800;
    document.getElementById(secId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleCollection = (cid: string) =>
    setCollectionIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));

  const updateSpecific = (idx: number, patch: Partial<ProductItemSpecific>) => {
    setItemSpecifics((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeSpecific = (idx: number) => setItemSpecifics((prev) => prev.filter((_, i) => i !== idx));

  const comboCount = buildCombos(groups).length;

  const handleGenerate = () => {
    if (groups.length === 0) {
      toast.error('Add at least one option group first');
      return;
    }
    if (groups.some((g) => !g.name.trim())) {
      toast.error('Every option group needs a name');
      return;
    }
    const emptyGroup = groups.find((g) => g.options.length === 0);
    if (emptyGroup) {
      toast.error(`Group "${emptyGroup.name}" has no options yet`);
      return;
    }
    if (comboCount > PRODUCT_VARIANTS_MAX) {
      toast.error(`Too many combinations (${comboCount}) — max ${PRODUCT_VARIANTS_MAX} variants`);
      return;
    }
    const result = generateVariants(groups, variations, sku.trim().toUpperCase() || item?.shortName || '');
    setVariations(result.variants);
    const parts = [`${result.created} new`, `${result.kept} kept`];
    if (result.orphans) parts.push(`${result.orphans} orphaned (highlighted — remove if unused)`);
    toast.success(`Variants generated: ${parts.join(', ')}`);
  };

  /** HTML rỗng của quill ("<p><br></p>") coi như không có nội dung. */
  const cleanHtml = (html: string): string => {
    const stripped = html.replace(/<[^>]+>/g, '').replace(/\s|&nbsp;/g, '');
    return stripped ? html : '';
  };

  const handleSave = async () => {
    if (!item) return;
    // Validate options/variants trước khi gửi (mirror BE assertProductStructureValid).
    const trimmedGroups = groups.map((g) => ({ name: g.name.trim(), options: g.options }));
    if (trimmedGroups.some((g) => !g.name)) {
      toast.error('Every option group needs a name');
      scrollToSection('sec-variants');
      return;
    }
    const nameSeen = new Set<string>();
    for (const g of trimmedGroups) {
      const k = g.name.toLowerCase();
      if (nameSeen.has(k)) {
        toast.error(`Duplicate option group name: "${g.name}"`);
        scrollToSection('sec-variants');
        return;
      }
      nameSeen.add(k);
    }
    const cleanVariations = variations.filter((v) => v.sku.trim()).map((v) => ({ ...v, sku: v.sku.trim().toUpperCase() }));
    if (trimmedGroups.length > 0) {
      const bad = cleanVariations.find((v) => !v.options || v.options.length !== trimmedGroups.length);
      if (bad) {
        toast.error(`Variant ${bad.sku} does not match the current option set — fix or remove it, then save again`);
        scrollToSection('sec-variants');
        return;
      }
    }

    const cleanImages = galleryImages.map((u) => u.trim()).filter(Boolean);
    const patch = {
      mockup: cleanImages[0] || '',
      images: cleanImages.slice(1),
      slug: slug.trim() || undefined,
      sku: sku.trim().toUpperCase() || undefined,
      level: level ? Number(level) : undefined,
      fabricType: fabricType || undefined,
      toolResult: toolResult || undefined,
      guide: cleanHtml(guide),
      ...(factoryId ? { factoryId } : {}),
      ...(machineTypeId ? { machineTypeId } : {}),
      productCategoryId: productCategoryId || undefined,
      printMethod: printMethod || undefined,
      sizeChartUrl: sizeChartUrl.trim() || undefined,
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
      collectionIds,
      optionNames: trimmedGroups.length ? trimmedGroups.map((g) => g.name) : undefined,
      variations: cleanVariations,
      printAreas: printAreas.filter((a) => a.name.trim()),
    };
    try {
      setSaving(true);
      await RepositoryRemote.productConfig.updateProductConfig(item._id, patch as never);
      toast.success('Product saved');
      navigate(PATHS.PRODUCTS);
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

  const levelColor = level ? PRODUCT_LEVEL_MAP[Number(level)]?.color : undefined;
  const primaryImage = galleryImages[0];

  return (
    <div className="-mx-4 md:-mx-6 -mt-4 md:-mt-6">
      {/* ─── Sticky header + anchor nav ─── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 md:px-6">
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate(PATHS.PRODUCTS)} title="Back to product list">
              <ArrowLeft size={18} />
            </Button>
            {primaryImage ? (
              <img src={primaryImage} alt="mockup" className="w-9 h-9 rounded object-cover border border-border bg-muted shrink-0" />
            ) : null}
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-bold text-foreground truncate leading-tight">{item.fullName}</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="font-mono">{item.shortName}</Badge>
                <span>{variations.length} variants</span>
                <span>·</span>
                <span>{printAreas.length} print areas</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={() => navigate(PATHS.PRODUCTS)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Spinner size={14} />}
              Save
            </Button>
          </div>
        </div>
        {/* Anchor nav — click scroll tới section, scrollspy tự sáng khi cuộn tay */}
        <nav className="flex items-center gap-1 overflow-x-auto">
          {SECTIONS.map((s, i) => {
            const active = activeSection === s.id;
            const count = s.id === 'sec-variants' ? variations.length : s.id === 'sec-print-areas' ? printAreas.length : null;
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
            {/* Images */}
            <div className="space-y-2">
              <Label>Product images</Label>
              <MockupImagesEditor images={galleryImages} onChange={setGalleryImages} />
            </div>

            {/* Fields */}
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Slug</Label>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="new-all-over-print-hawaiian-shirt" className="font-mono text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label>SKU</Label>
                  <Input
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    placeholder={`e.g. THHW-SHIRT (defaults to ${item.shortName})`}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Level</Label>
                  <div className="flex items-center gap-2">
                    {level && (
                      <span
                        className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-white shrink-0"
                        style={{ backgroundColor: levelColor }}
                      >
                        Lv {level}
                      </span>
                    )}
                    <select value={level} onChange={(e) => setLevel(e.target.value)} className={selectCls}>
                      <option value="">— Not set —</option>
                      {PRODUCT_LEVELS.map((lv) => (
                        <option key={lv.value} value={lv.value}>
                          {lv.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Fabric type</Label>
                  <select value={fabricType} onChange={(e) => setFabricType(e.target.value)} className={selectCls}>
                    <option value="">— Not set —</option>
                    {fabricOptions.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tool result</Label>
                  <select value={toolResult} onChange={(e) => setToolResult(e.target.value)} className={selectCls}>
                    <option value="">— Not set —</option>
                    {toolOptions.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Factory</Label>
                  <select value={factoryId} onChange={(e) => setFactoryId(e.target.value)} className={selectCls}>
                    {!factoryId && <option value="">— Not set —</option>}
                    {factoryOptions.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.shortName} · {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <select value={machineTypeId} onChange={(e) => setMachineTypeId(e.target.value)} className={selectCls}>
                    {!machineTypeId && <option value="">— Not set —</option>}
                    {machineTypeOptions.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.shortName} · {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Toggles — mirror hệ cũ: Hide product for seller / Enable design check / Enable affiliate commission */}
              <div className="grid md:grid-cols-3 gap-3">
                <label className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
                  Hide product for seller
                  <Switch checked={hideForSeller} onCheckedChange={setHideForSeller} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
                  Enable design check
                  <Switch checked={enableDesignCheck} onCheckedChange={setEnableDesignCheck} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
                  Enable affiliate commission
                  <Switch checked={enableAffiliate} onCheckedChange={setEnableAffiliate} />
                </label>
              </div>

              <div className="space-y-1.5">
                <Label>Production guide</Label>
                <RichTextEditor value={guide} onChange={setGuide} placeholder="Internal production guide / notes…" minHeight={140} />
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
                  <Label>Category</Label>
                  <select value={productCategoryId} onChange={(e) => setProductCategoryId(e.target.value)} className={selectCls}>
                    <option value="">— Not set —</option>
                    {productCategoryOptions.map((opt) => (
                      <option key={opt._id} value={opt._id}>
                        {opt.shortName} · {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Print method</Label>
                  <select value={printMethod} onChange={(e) => setPrintMethod(e.target.value)} className={selectCls}>
                    <option value="">— Not set —</option>
                    {printMethodOptions.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Collections (multi-select)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {collectionOptions.map((c) => {
                    const active = collectionIds.includes(c._id);
                    return (
                      <button key={c._id} type="button" onClick={() => toggleCollection(c._id)}>
                        <Badge variant={active ? 'default' : 'outline'} className="cursor-pointer font-normal">
                          {c.name}
                        </Badge>
                      </button>
                    );
                  })}
                  {collectionOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No collections yet — create them in the Collection tab.</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Size chart (URL)</Label>
                <Input value={sizeChartUrl} onChange={(e) => setSizeChartUrl(e.target.value)} placeholder="https://…" />
              </div>

              <div className="space-y-1.5">
                <Label>Shipping time</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Max Production time (days)</span>
                    <Input type="number" min={0} value={maxProductionTime} onChange={(e) => setMaxProductionTime(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Max shipping time (days)</span>
                    <Input type="number" min={0} value={maxShippingTime} onChange={(e) => setMaxShippingTime(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Logistics Information (default package — used when a variant has no override)</Label>
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Weight * (Gr)</span>
                    <Input type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Package Width (Cm)</span>
                    <Input type="number" min={0} value={width} onChange={(e) => setWidth(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Package Height (Cm)</span>
                    <Input type="number" min={0} value={height} onChange={(e) => setHeight(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Package Length (Cm)</span>
                    <Input type="number" min={0} value={length} onChange={(e) => setLength(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Item specifics</Label>
                  <Button variant="outline" size="sm" onClick={() => setItemSpecifics((prev) => [...prev, { label: '', value: '' }])}>
                    <Plus size={14} /> Add row
                  </Button>
                </div>
                <div className="space-y-2">
                  {itemSpecifics.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={s.label}
                        onChange={(e) => updateSpecific(idx, { label: e.target.value })}
                        placeholder="e.g. Material"
                        className="flex-1"
                      />
                      <Input
                        value={s.value}
                        onChange={(e) => updateSpecific(idx, { value: e.target.value })}
                        placeholder="e.g. 100% Cotton"
                        className="flex-1"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeSpecific(idx)}>
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {itemSpecifics.length === 0 && <p className="text-xs text-muted-foreground">No specifics yet.</p>}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Short description</Label>
                <RichTextEditor
                  value={shortDescription}
                  onChange={setShortDescription}
                  placeholder="Bullet-point summary (material, sizes, MOQ…)"
                  minHeight={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Item description (shown to customers)</Label>
                <RichTextEditor value={description} onChange={setDescription} placeholder="Full product description…" minHeight={200} />
              </div>
              <div className="space-y-1.5">
                <Label>Template description</Label>
                <RichTextEditor
                  value={templateDescription}
                  onChange={setTemplateDescription}
                  placeholder="Print file requirements, templates & mockups links, disclaimers…"
                  minHeight={120}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ══ 3. Variants & Price ══ */}
        <SectionCard meta={SECTIONS[2]} number={3} badge={`${variations.length} variants`}>
          <div className="grid xl:grid-cols-[380px_1fr] gap-8">
            {/* Option groups */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Option groups (max {PRODUCT_OPTION_GROUP_MAX})</Label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={groups.length >= PRODUCT_OPTION_GROUP_MAX}
                  onClick={() => setGroups((prev) => [...prev, { name: '', options: [] }])}
                >
                  <Plus size={14} /> Add group
                </Button>
              </div>
              {groups.map((g, idx) => {
                const dup = groups.some(
                  (o, i) => i !== idx && o.name.trim() && o.name.trim().toLowerCase() === g.name.trim().toLowerCase(),
                );
                return (
                  <VariationItem
                    key={idx}
                    group={g}
                    error={dup ? 'Duplicate group name' : undefined}
                    onChange={(patch) => setGroups((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)))}
                    onRemove={() => setGroups((prev) => prev.filter((_, i) => i !== idx))}
                  />
                );
              })}
              {groups.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No option groups yet — e.g. add "Color" (Red, Blue) + "Size" (S, M, L), then generate variants.
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={handleGenerate} disabled={comboCount === 0}>
                  <Layers size={14} /> Generate variants ({comboCount})
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBatchOpen(true)} disabled={variations.length === 0}>
                  <Pencil size={14} /> Batch edit
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                SKU auto-generated as <code className="font-mono">{sku.trim() || item.shortName}-OPTION</code> (editable, unique
                system-wide). Regenerating keeps prices already entered.
              </p>
            </div>

            {/* Variants table */}
            <div className="min-w-0">
              <VariantsTable groups={groups} variants={variations} onChange={setVariations} />
            </div>
          </div>
        </SectionCard>

        {/* ══ 4. Print Areas ══ */}
        <SectionCard meta={SECTIONS[3]} number={4} badge={`${printAreas.length} areas`}>
          <PrintAreasEditor printAreas={printAreas} onChange={setPrintAreas} />
        </SectionCard>

        {/* Footer save */}
        <div className="flex items-center justify-end gap-2 pb-6">
          <Button variant="outline" onClick={() => navigate(PATHS.PRODUCTS)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Spinner size={14} />}
            Save
          </Button>
        </div>
      </div>

      <BatchEditDialog open={batchOpen} onOpenChange={setBatchOpen} groups={groups} variants={variations} onApply={setVariations} />
    </div>
  );
}

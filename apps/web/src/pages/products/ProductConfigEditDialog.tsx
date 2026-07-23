import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ProductItemSpecific, ProductVariation } from 'shared';
import { PRODUCT_LEVEL_MAP, PRODUCT_LEVELS, Status } from 'shared';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import { handleAxiosError } from '@/utils';

import type { ProductConfigRow, RefItem } from './ProductConfigTab';

interface Option {
  code: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ProductConfigRow | null;
  fabricOptions: Option[];
  toolOptions: Option[];
  factoryOptions: RefItem[];
  machineTypeOptions: RefItem[];
  productCategoryOptions: RefItem[];
  printMethodOptions: Option[];
  /** Cập nhật lạc quan sau khi lưu. */
  onSaved: (id: string, patch: Partial<ProductConfigRow>) => void;
  /** Xoá sản phẩm (đóng dialog sau đó). */
  onDelete: (id: string) => void;
}

const selectCls =
  'w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const emptyVariation = (): ProductVariation => ({ sku: '', status: Status.Active });

export function ProductConfigEditDialog({
  open,
  onOpenChange,
  item,
  fabricOptions,
  toolOptions,
  factoryOptions,
  machineTypeOptions,
  productCategoryOptions,
  printMethodOptions,
  onSaved,
  onDelete,
}: Props) {
  const [mockup, setMockup] = useState('');
  const [level, setLevel] = useState<string>('');
  const [fabricType, setFabricType] = useState('');
  const [toolResult, setToolResult] = useState('');
  const [guide, setGuide] = useState('');
  const [factoryId, setFactoryId] = useState('');
  const [machineTypeId, setMachineTypeId] = useState('');
  const [saving, setSaving] = useState(false);

  // ─── Chi tiết sản phẩm ───
  const [productCategoryId, setProductCategoryId] = useState('');
  const [printMethod, setPrintMethod] = useState('');
  const [printArea, setPrintArea] = useState('');
  const [sizeChartUrl, setSizeChartUrl] = useState('');
  const [description, setDescription] = useState('');
  const [itemSpecifics, setItemSpecifics] = useState<ProductItemSpecific[]>([]);
  const [weight, setWeight] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [variations, setVariations] = useState<ProductVariation[]>([]);

  useEffect(() => {
    if (item) {
      setMockup(item.mockup || '');
      setLevel(item.level != null ? String(item.level) : '');
      setFabricType(item.fabricType || '');
      setToolResult(item.toolResult || '');
      setGuide(item.guide || '');
      setFactoryId(item.factoryId || '');
      setMachineTypeId(item.machineTypeId || '');
      setProductCategoryId(item.productCategoryId || '');
      setPrintMethod(item.printMethod || '');
      setPrintArea(item.printArea || '');
      setSizeChartUrl(item.sizeChartUrl || '');
      setDescription(item.description || '');
      setItemSpecifics(item.itemSpecifics || []);
      setWeight(item.weight != null ? String(item.weight) : '');
      setWidth(item.width != null ? String(item.width) : '');
      setHeight(item.height != null ? String(item.height) : '');
      setLength(item.length != null ? String(item.length) : '');
      setVariations(item.variations || []);
    }
  }, [item]);

  if (!item) return null;

  const handleSave = async () => {
    const patch: Partial<ProductConfigRow> = {
      mockup: mockup.trim(),
      level: level ? Number(level) : undefined,
      fabricType: fabricType || undefined,
      toolResult: toolResult || undefined,
      guide: guide.trim(),
      // Xưởng / Phòng bắt buộc — chỉ gửi khi có giá trị. Kèm object hiển thị để
      // merge lạc quan (select ở bảng đọc theo id; badge nếu có đọc theo object).
      ...(factoryId ? { factoryId } : {}),
      ...(machineTypeId ? { machineTypeId } : {}),
      productCategoryId: productCategoryId || undefined,
      printMethod: printMethod || undefined,
      printArea: printArea.trim() || undefined,
      sizeChartUrl: sizeChartUrl.trim() || undefined,
      description: description.trim() || undefined,
      itemSpecifics: itemSpecifics.filter((x) => x.label.trim() && x.value.trim()),
      weight: weight ? Number(weight) : undefined,
      width: width ? Number(width) : undefined,
      height: height ? Number(height) : undefined,
      length: length ? Number(length) : undefined,
      variations: variations.filter((v) => v.sku.trim()).map((v) => ({ ...v, sku: v.sku.trim().toUpperCase() })),
    };
    const f = factoryOptions.find((x) => x._id === factoryId);
    if (f) patch.factory = { name: f.name, shortName: f.shortName };
    const m = machineTypeOptions.find((x) => x._id === machineTypeId);
    if (m) patch.machineType = { name: m.name, shortName: m.shortName };
    const c = productCategoryOptions.find((x) => x._id === productCategoryId);
    patch.productCategory = c ? { name: c.name, shortName: c.shortName } : undefined;
    try {
      setSaving(true);
      await RepositoryRemote.productConfig.updateProductConfig(item._id, patch as never);
      onSaved(item._id, patch);
      onOpenChange(false);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSaving(false);
    }
  };

  const levelColor = level ? PRODUCT_LEVEL_MAP[Number(level)]?.color : undefined;

  const updateSpecific = (idx: number, patch: Partial<ProductItemSpecific>) => {
    setItemSpecifics((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeSpecific = (idx: number) => setItemSpecifics((prev) => prev.filter((_, i) => i !== idx));

  const updateVariation = (idx: number, patch: Partial<ProductVariation>) => {
    setVariations((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };
  const removeVariation = (idx: number) => setVariations((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa sản phẩm</DialogTitle>
        </DialogHeader>

        <div className="text-sm mb-2">
          <span className="font-medium">{item.fullName}</span>{' '}
          <span className="text-muted-foreground">({item.shortName})</span>
        </div>

        <Tabs defaultValue="production">
          <TabsList>
            <TabsTrigger value="production">Sản xuất</TabsTrigger>
            <TabsTrigger value="detail">Chi tiết sản phẩm</TabsTrigger>
            <TabsTrigger value="variations">Biến thể ({variations.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="production" className="space-y-4">
            {/* Mockup */}
            <div className="space-y-1.5">
              <Label>Mockup (URL ảnh)</Label>
              <div className="flex items-start gap-3">
                {mockup ? (
                  <a href={mockup} target="_blank" rel="noreferrer" title="Mở ảnh">
                    <img
                      src={mockup}
                      alt="mockup"
                      className="w-16 h-16 rounded object-cover border border-border bg-muted"
                    />
                  </a>
                ) : (
                  <div className="w-16 h-16 rounded border border-dashed border-border shrink-0" />
                )}
                <Input
                  value={mockup}
                  onChange={(e) => setMockup(e.target.value)}
                  placeholder="https://…"
                  className="flex-1"
                />
              </div>
            </div>

            {/* Level */}
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
                  <option value="">— Chưa chọn —</option>
                  {PRODUCT_LEVELS.map((lv) => (
                    <option key={lv.value} value={lv.value}>
                      {lv.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Loại vải */}
              <div className="space-y-1.5">
                <Label>Loại vải</Label>
                <select value={fabricType} onChange={(e) => setFabricType(e.target.value)} className={selectCls}>
                  <option value="">— Chưa chọn —</option>
                  {fabricOptions.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* Kết quả Tool */}
              <div className="space-y-1.5">
                <Label>Kết quả Tool</Label>
                <select value={toolResult} onChange={(e) => setToolResult(e.target.value)} className={selectCls}>
                  <option value="">— Chưa chọn —</option>
                  {toolOptions.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Xưởng */}
              <div className="space-y-1.5">
                <Label>Xưởng</Label>
                <select value={factoryId} onChange={(e) => setFactoryId(e.target.value)} className={selectCls}>
                  {!factoryId && <option value="">— Chưa chọn —</option>}
                  {factoryOptions.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.shortName} · {f.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* Phòng */}
              <div className="space-y-1.5">
                <Label>Phòng</Label>
                <select value={machineTypeId} onChange={(e) => setMachineTypeId(e.target.value)} className={selectCls}>
                  {!machineTypeId && <option value="">— Chưa chọn —</option>}
                  {machineTypeOptions.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.shortName} · {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Hướng dẫn */}
            <div className="space-y-1.5">
              <Label>Hướng dẫn</Label>
              <Textarea
                value={guide}
                onChange={(e) => setGuide(e.target.value)}
                placeholder="Hướng dẫn / ghi chú sản phẩm…"
                rows={4}
              />
            </div>
          </TabsContent>

          <TabsContent value="detail" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Danh mục sản phẩm</Label>
                <select value={productCategoryId} onChange={(e) => setProductCategoryId(e.target.value)} className={selectCls}>
                  <option value="">— Chưa chọn —</option>
                  {productCategoryOptions.map((opt) => (
                    <option key={opt._id} value={opt._id}>
                      {opt.shortName} · {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Phương pháp in</Label>
                <select value={printMethod} onChange={(e) => setPrintMethod(e.target.value)} className={selectCls}>
                  <option value="">— Chưa chọn —</option>
                  {printMethodOptions.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Vị trí in</Label>
              <Textarea
                value={printArea}
                onChange={(e) => setPrintArea(e.target.value)}
                placeholder="VD: Mặt trước 30x40cm, mặt sau 20x25cm…"
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Bảng size (URL)</Label>
              <Input value={sizeChartUrl} onChange={(e) => setSizeChartUrl(e.target.value)} placeholder="https://…" />
            </div>

            <div className="space-y-1.5">
              <Label>Mô tả sản phẩm (hiển thị cho khách)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả sản phẩm…"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Đóng gói mặc định</Label>
              <div className="grid grid-cols-4 gap-2">
                <Input type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Weight (g)" />
                <Input type="number" min={0} value={width} onChange={(e) => setWidth(e.target.value)} placeholder="Width (cm)" />
                <Input type="number" min={0} value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Height (cm)" />
                <Input type="number" min={0} value={length} onChange={(e) => setLength(e.target.value)} placeholder="Length (cm)" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Thông số kỹ thuật (item specifics)</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setItemSpecifics((prev) => [...prev, { label: '', value: '' }])}
                >
                  <Plus size={14} /> Thêm dòng
                </Button>
              </div>
              <div className="space-y-2">
                {itemSpecifics.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={s.label}
                      onChange={(e) => updateSpecific(idx, { label: e.target.value })}
                      placeholder="VD: Chất liệu"
                      className="flex-1"
                    />
                    <Input
                      value={s.value}
                      onChange={(e) => updateSpecific(idx, { value: e.target.value })}
                      placeholder="VD: Cotton 100%"
                      className="flex-1"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeSpecific(idx)}>
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </div>
                ))}
                {itemSpecifics.length === 0 && (
                  <p className="text-xs text-muted-foreground">Chưa có thông số nào.</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="variations" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                SKU biến thể phải là duy nhất trên toàn hệ thống (không trùng sản phẩm khác).
              </p>
              <Button variant="outline" size="sm" onClick={() => setVariations((prev) => [...prev, emptyVariation()])}>
                <Plus size={14} /> Thêm biến thể
              </Button>
            </div>

            <div className="space-y-2 max-h-[45vh] overflow-y-auto">
              {variations.map((v, idx) => (
                <div key={idx} className="rounded-md border border-border p-2.5 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      value={v.sku}
                      onChange={(e) => updateVariation(idx, { sku: e.target.value })}
                      placeholder="SKU"
                      className="font-mono text-xs"
                    />
                    <Input
                      value={v.color || ''}
                      onChange={(e) => updateVariation(idx, { color: e.target.value })}
                      placeholder="Màu"
                    />
                    <Input
                      value={v.size || ''}
                      onChange={(e) => updateVariation(idx, { size: e.target.value })}
                      placeholder="Size"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={v.cost ?? ''}
                      onChange={(e) => updateVariation(idx, { cost: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="Giá vốn"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={v.nonShipCost ?? ''}
                      onChange={(e) =>
                        updateVariation(idx, { nonShipCost: e.target.value ? Number(e.target.value) : undefined })
                      }
                      placeholder="Giá vốn (không ship)"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={v.retailPrice ?? ''}
                      onChange={(e) =>
                        updateVariation(idx, { retailPrice: e.target.value ? Number(e.target.value) : undefined })
                      }
                      placeholder="Giá bán niêm yết"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={v.status === Status.Active}
                        onCheckedChange={(checked) => updateVariation(idx, { status: checked ? Status.Active : Status.Inactive })}
                      />
                      <Badge variant={v.status === Status.Active ? 'secondary' : 'outline'} className="font-normal">
                        {v.status === Status.Active ? 'Đang bán' : 'Ngừng bán'}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeVariation(idx)}>
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {variations.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Chưa có biến thể nào.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center sm:justify-between gap-2">
          {/* <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              onOpenChange(false);
              onDelete(item._id);
            }}
          >
            <Trash2 size={14} />
            Xóa sản phẩm
          </Button> */}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Spinner size={14} />}
              Lưu
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

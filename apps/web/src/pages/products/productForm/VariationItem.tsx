import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { VariationGroup } from './variantUtils';

interface Props {
  group: VariationGroup;
  /** Nhóm mới thêm (chưa có tên/option) mở sẵn ở chế độ sửa. */
  defaultEditing?: boolean;
  /** Tên các nhóm KHÁC — validate trùng tên khi bấm Done. */
  otherNames: string[];
  onChange: (patch: Partial<VariationGroup>) => void;
  onRemove: () => void;
  /** Bấm Done (đã validate + làm sạch) — parent tự regenerate bảng variants. */
  onDone: (clean: VariationGroup) => void;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * 1 nhóm variant dạng card 2 trạng thái (mirror form hệ cũ):
 * - Collapsed: nền xám, tên nhóm + dãy chip option, nút ✏️ mở lại form.
 * - Editing: form "Variant Name" + danh sách input "Option" (sửa tại chỗ, 🗑
 *   từng dòng), ô trống cuối gõ Enter/dấu phẩy (dán "Red, Blue, Green" được)
 *   để thêm, nút "+ Add option" và nút "Done" (validate rồi collapse).
 */
export function VariationItem({ group, defaultEditing = false, otherNames, onChange, onRemove, onDone }: Props) {
  const { t } = useTranslation(['products', 'common']);
  const [editing, setEditing] = useState(defaultEditing);
  const [draft, setDraft] = useState('');
  const optionRefs = useRef<Array<HTMLInputElement | null>>([]);
  /** Index ô option cần focus sau render kế (Enter/+ Add option vừa chèn ô mới). */
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => {
    if (pendingFocus.current != null) {
      optionRefs.current[pendingFocus.current]?.focus();
      pendingFocus.current = null;
    }
  });

  /** Chèn 1 ô option rỗng sau vị trí `idx` (cuối nếu -1) và focus vào đó. */
  const insertOptionAfter = (idx: number) => {
    const next = [...group.options];
    const at = idx < 0 ? next.length : idx + 1;
    next.splice(at, 0, '');
    pendingFocus.current = at;
    onChange({ options: next });
  };

  /** Gộp chuỗi draft (tách theo dấu phẩy/xuống dòng) vào options, bỏ trùng. */
  const mergeDraft = (options: string[], raw: string): string[] => {
    const values = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!values.length) return options;
    const next = [...options];
    let dup = 0;
    for (const v of values) {
      if (next.some((o) => norm(o) === norm(v))) {
        dup++;
        continue;
      }
      next.push(v);
    }
    if (dup) toast.warning(t('detail.groups.duplicateSkipped', { count: dup }));
    return next;
  };

  const commitDraft = () => {
    if (!draft.trim()) return;
    onChange({ options: mergeDraft(group.options, draft) });
    setDraft('');
  };

  const handleDone = () => {
    // Gộp cả giá trị đang gõ dở ở ô cuối + bỏ option rỗng.
    let options = group.options.map((o) => o.trim()).filter(Boolean);
    if (draft.trim()) options = mergeDraft(options, draft);

    if (!group.name.trim()) {
      toast.error(t('detail.groups.needName'));
      return;
    }
    if (otherNames.some((n) => n.trim() && norm(n) === norm(group.name))) {
      toast.error(t('detail.groups.duplicateName', { name: group.name }));
      return;
    }
    if (options.length === 0) {
      toast.error(t('detail.groups.emptyGroup', { name: group.name }));
      return;
    }
    const dupOption = options.find((o, i) => options.some((x, j) => j < i && norm(x) === norm(o)));
    if (dupOption) {
      toast.error(t('detail.groups.duplicateOption', { name: dupOption }));
      return;
    }

    setDraft('');
    setEditing(false);
    onDone({ name: group.name.trim(), options });
  };

  if (!editing) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-semibold text-foreground">{group.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {group.options.map((o, idx) => (
              <Badge key={`${o}-${idx}`} variant="secondary" className="rounded-full px-2.5 font-normal">
                {o}
              </Badge>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setEditing(true)} title={t('common:actions.edit')}>
          <Pencil size={15} />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">
          <span className="text-destructive">* </span>
          {t('detail.groups.variantName')}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            value={group.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t('detail.groups.namePlaceholder')}
            className="flex-1 bg-background"
          />
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onRemove} title={t('detail.groups.removeGroup')}>
            <Trash2 size={14} className="text-destructive" />
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          <span className="text-destructive">* </span>
          {t('detail.groups.option')}
        </Label>
        <div className="space-y-2">
          {group.options.map((o, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                ref={(el) => (optionRefs.current[idx] = el)}
                value={o}
                onChange={(e) => onChange({ options: group.options.map((x, i) => (i === idx ? e.target.value : x)) })}
                onKeyDown={(e) => {
                  // Enter khi xong 1 option → tự thêm ô mới ngay dưới + focus vào đó.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    insertOptionAfter(idx);
                  }
                }}
                placeholder={t('detail.groups.optionValuePlaceholder')}
                className="flex-1 bg-background"
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => onChange({ options: group.options.filter((_, i) => i !== idx) })}
                title={t('detail.groups.removeGroup')}
              >
                <Trash2 size={14} className="text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  commitDraft();
                }
              }}
              onBlur={commitDraft}
              placeholder={t('detail.groups.optionValuePlaceholder')}
              className="flex-1 bg-background"
            />
            {/* Spacer thẳng hàng với cột nút xóa bên trên */}
            <div className="w-9 shrink-0" />
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => (draft.trim() ? commitDraft() : insertOptionAfter(-1))}>
          <Plus size={14} /> {t('detail.groups.addOption')}
        </Button>
      </div>

      <Button size="sm" onClick={handleDone}>
        {t('detail.groups.done')}
      </Button>
    </div>
  );
}

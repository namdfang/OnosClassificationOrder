import React, { useMemo } from 'react';
import type { PermissionGroup, PermissionItem } from 'shared';
import { PERMISSION_CATALOG } from 'shared';

import { cn } from '@/utils/cn';

const GROUP_LABEL: Record<PermissionGroup, string> = {
  page: 'Truy cập trang',
  order: 'Hành động Order',
  order_field: 'Field-level Order',
  workshop: 'Workshop',
  admin: 'Quản trị',
  audit: 'Audit',
};

interface Props {
  /** Codes the role currently has. */
  value: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
}

export function PermissionMatrix({ value, onChange, disabled }: Props) {
  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (code: string) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(Array.from(next));
  };

  const grouped = useMemo(() => {
    const map = new Map<PermissionGroup, PermissionItem[]>();
    for (const item of PERMISSION_CATALOG) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)!.push(item);
    }
    return map;
  }, []);

  // Build field-level matrix: row = field, col = view|edit
  const fieldRows = useMemo(() => {
    const items = grouped.get('order_field') || [];
    const byField = new Map<string, { field: string; label: string; viewCode?: string; editCode?: string }>();
    for (const it of items) {
      if (!it.field) continue;
      const row = byField.get(it.field) || {
        field: it.field,
        label: it.label,
        viewCode: undefined,
        editCode: undefined,
      };
      if (it.mode === 'view') row.viewCode = it.code;
      if (it.mode === 'edit') row.editCode = it.code;
      byField.set(it.field, row);
    }
    return Array.from(byField.values());
  }, [grouped]);

  return (
    <div className="space-y-6">
      {(['page', 'order', 'workshop', 'admin', 'audit'] as PermissionGroup[]).map((group) => {
        const items = grouped.get(group) || [];
        if (items.length === 0) return null;
        return (
          <div key={group} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {GROUP_LABEL[group]}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded-md border border-border p-3">
              {items.map((it) => {
                const isOn = selected.has(it.code);
                return (
                  <label
                    key={it.code}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors cursor-pointer',
                      isOn ? 'bg-primary/10 text-foreground' : 'hover:bg-accent/40 text-muted-foreground',
                      disabled && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => toggle(it.code)}
                      disabled={disabled}
                      className="h-3.5 w-3.5"
                    />
                    <span className="flex-1">{it.label}</span>
                    <span className="text-[10px] font-mono text-muted-foreground/60">{it.code}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Field-level matrix */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {GROUP_LABEL.order_field}
        </h4>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium w-20 text-center">View</th>
                <th className="px-3 py-2 font-medium w-20 text-center">Edit</th>
              </tr>
            </thead>
            <tbody>
              {fieldRows.map((row) => {
                const viewOn = row.viewCode ? selected.has(row.viewCode) : false;
                const editOn = row.editCode ? selected.has(row.editCode) : false;
                return (
                  <tr key={row.field} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.label}</div>
                      <div className="text-[10px] font-mono text-muted-foreground/60">{row.field}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.viewCode && (
                        <input
                          type="checkbox"
                          checked={viewOn}
                          onChange={() => toggle(row.viewCode!)}
                          disabled={disabled}
                          className="h-3.5 w-3.5"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.editCode && (
                        <input
                          type="checkbox"
                          checked={editOn}
                          onChange={() => toggle(row.editCode!)}
                          disabled={disabled}
                          className="h-3.5 w-3.5"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Edit kéo theo View được tự động — nếu không có view permission thì user không thấy cột, tức là edit cũng không
          dùng được.
        </p>
      </div>
    </div>
  );
}

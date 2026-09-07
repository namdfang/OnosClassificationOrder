"use client";

import React, { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";

interface Column<T> {
  key: string;
  header: string;
  render: (row: T, index: number) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: string;
  onRowClick?: (row: T) => void;
  sortable?: boolean;
  paginated?: boolean;
  pageSize?: number;
  selectable?: boolean;
  onSelectionChange?: (selected: T[]) => void;
  rowClassName?: (row: T) => string;
  emptyState?: React.ReactNode;
  renderExpandedRow?: (row: T) => React.ReactNode;
}

type SortDir = "asc" | "desc";

export type { Column };

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  onRowClick,
  sortable,
  paginated,
  pageSize = 10,
  selectable,
  onSelectionChange,
  rowClassName,
  emptyState,
  renderExpandedRow,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageSizeState, setPageSizeState] = useState(pageSize);

  // Sorting
  const sorted = useMemo(() => {
    if (!sortable || !sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return data;
    const arr = [...data];
    arr.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return arr;
  }, [data, sortable, sortKey, sortDir, columns]);

  // Pagination
  const totalPages = paginated ? Math.max(1, Math.ceil(sorted.length / pageSizeState)) : 1;
  const safePage = Math.min(page, totalPages - 1);
  const rows = paginated ? sorted.slice(safePage * pageSizeState, (safePage + 1) * pageSizeState) : sorted;
  const rangeStart = paginated ? safePage * pageSizeState + 1 : 1;
  const rangeEnd = paginated ? Math.min((safePage + 1) * pageSizeState, sorted.length) : sorted.length;

  const handleSort = (col: Column<T>) => {
    if (!sortable || !col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
    setPage(0);
  };

  const toggleRow = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
    if (onSelectionChange) {
      onSelectionChange(data.filter((r) => next.has(String(r[keyField]))));
    }
  };

  const toggleAll = () => {
    const allKeys = rows.map((r) => String(r[keyField]));
    const allSelected = allKeys.every((k) => selected.has(k));
    const next = new Set(selected);
    if (allSelected) {
      allKeys.forEach((k) => next.delete(k));
    } else {
      allKeys.forEach((k) => next.add(k));
    }
    setSelected(next);
    if (onSelectionChange) {
      onSelectionChange(data.filter((r) => next.has(String(r[keyField]))));
    }
  };

  const clearSelection = () => {
    setSelected(new Set());
    onSelectionChange?.([]);
  };

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const allPageSelected = rows.length > 0 && rows.every((r) => selected.has(String(r[keyField])));
  const someSelected = rows.some((r) => selected.has(String(r[keyField]))) && !allPageSelected;

  return (
    <div className="bg-card border border-border1 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {selectable && (
                <th className="w-[36px] px-2 py-2 border-b border-border1 bg-surface-muted">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 cursor-pointer accent-[#141d2e]"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left px-3 py-2 text-[9.5px] font-bold uppercase tracking-wider text-text-muted border-b border-border1 bg-surface-muted ${sortable && col.sortable ? "cursor-pointer select-none hover:text-text-secondary" : ""} ${col.className || ""}`}
                  onClick={() => handleSort(col)}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {sortable && col.sortable && (
                      <span className="inline-flex flex-col -my-1">
                        {sortKey === col.key ? (
                          sortDir === "asc" ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />
                        ) : (
                          <ChevronsUpDown size={12} className="text-text-placeholder" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const key = String(row[keyField]);
              const isSelected = selected.has(key);
              const extraClass = rowClassName ? rowClassName(row) : "";
              const expandedContent = renderExpandedRow ? renderExpandedRow(row) : null;
              return (
                <React.Fragment key={key}>
                  <tr
                    className={`hover:bg-card-hover transition-colors ${isSelected ? "bg-info-bg" : ""} ${extraClass}`}
                    onClick={() => onRowClick?.(row)}
                    style={{ cursor: onRowClick ? "pointer" : "default" }}
                  >
                    {selectable && (
                      <td className="px-2 py-2 border-b border-border2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(key)}
                          className="w-3.5 h-3.5 cursor-pointer accent-[#141d2e]"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-2 border-b border-border2 text-[11.5px] ${col.className || ""}`}
                      >
                        {col.render(row, paginated ? safePage * pageSizeState + i : i)}
                      </td>
                    ))}
                  </tr>
                  {expandedContent && (
                    <tr>
                      <td colSpan={(selectable ? 1 : 0) + columns.length} className="p-0">
                        {expandedContent}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination bar */}
      {paginated && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border1 bg-sidebar">
          <div className="text-[10px] text-text-muted">
            {selected.size > 0 && (
              <span className="font-semibold text-accent mr-2">
                {selected.size} selected
                <button onClick={clearSelection} className="ml-1 text-text-muted hover:text-text-secondary cursor-pointer bg-transparent border-none text-[10px] underline">
                  clear
                </button>
              </span>
            )}
            {rangeStart}-{rangeEnd} of {sorted.length}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSizeState}
              onChange={(e) => { setPageSizeState(Number(e.target.value)); setPage(0); }}
              className="text-[10px] border border-border1 rounded px-1 py-0.5 bg-card outline-none"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
            <button
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="w-6 h-6 rounded border border-border1 bg-card flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default hover:bg-card-hover transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[10px] text-text-secondary font-semibold min-w-[40px] text-center">
              {safePage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="w-6 h-6 rounded border border-border1 bg-card flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default hover:bg-card-hover transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

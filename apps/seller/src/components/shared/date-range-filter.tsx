"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

export interface DateRange {
  dateFrom: string | null; // YYYY-MM-DD
  dateTo: string | null; // YYYY-MM-DD
}

/**
 * Reusable date-range filter (THG-TASK-011). Compact trigger button
 * surface; popover holds quick presets + month/year stepper + concrete
 * range inputs. Returns ISO YYYY-MM-DD strings — matches every listing
 * endpoint's `dateFrom` / `dateTo` query contract (see
 * `src/lib/validators/order.ts:listQuerySchema`).
 *
 * Controlled component — state lives in the parent so a refresh
 * through the parent's `useEffect` always sees the latest range.
 *
 * Replaces both the older `<DateRangeFilter>` (7d/30d/90d preset
 * buttons) and the inline filter bars duplicated across /orders,
 * /tasks, /attendance, /kpi.
 */

type PresetKey = "today" | "yesterday" | "thisWeek" | "thisMonth" | "lastMonth" | "thisYear";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "thisYear", label: "This Year" },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Exported for unit tests — computing preset ranges is the highest-risk
// pure logic in this component. UI behavior is verified manually.
// `now` is injected so tests don't depend on wall-clock time.
export function computePresetRange(key: PresetKey, now: Date = new Date()): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today": {
      const iso = toIso(today);
      return { dateFrom: iso, dateTo: iso };
    }
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const iso = toIso(y);
      return { dateFrom: iso, dateTo: iso };
    }
    case "thisWeek": {
      // Monday → today. JS getDay: 0=Sun, 1=Mon … 6=Sat. We want Monday-start
      // because that's the convention used elsewhere in the app (attendance
      // sheet, KPI weekly bonus). Sunday rolls back to previous Monday.
      const dow = today.getDay() || 7;
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dow - 1));
      return { dateFrom: toIso(monday), dateTo: toIso(today) };
    }
    case "thisMonth": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { dateFrom: toIso(first), dateTo: toIso(today) };
    }
    case "lastMonth": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { dateFrom: toIso(first), dateTo: toIso(last) };
    }
    case "thisYear": {
      const first = new Date(today.getFullYear(), 0, 1);
      return { dateFrom: toIso(first), dateTo: toIso(today) };
    }
  }
}

function detectActivePreset(value: DateRange): PresetKey | null {
  if (!value.dateFrom || !value.dateTo) return null;
  for (const p of PRESETS) {
    const r = computePresetRange(p.key);
    if (r.dateFrom === value.dateFrom && r.dateTo === value.dateTo) return p.key;
  }
  return null;
}

function formatTriggerLabel(value: DateRange, activePreset: PresetKey | null): string {
  if (!value.dateFrom && !value.dateTo) return "All time";
  if (activePreset) {
    return PRESETS.find((p) => p.key === activePreset)?.label ?? "";
  }
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  if (value.dateFrom && value.dateTo) {
    return value.dateFrom === value.dateTo
      ? fmt(value.dateFrom)
      : `${fmt(value.dateFrom)} – ${fmt(value.dateTo)}`;
  }
  return value.dateFrom ? `From ${fmt(value.dateFrom)}` : `To ${fmt(value.dateTo!)}`;
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  // Month/year stepper anchor — defaults to the month of dateFrom, or today.
  const [anchor, setAnchor] = useState<{ year: number; month: number }>(() => {
    const seed = value.dateFrom ? new Date(value.dateFrom) : new Date();
    return { year: seed.getFullYear(), month: seed.getMonth() };
  });
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const activePreset = useMemo(() => detectActivePreset(value), [value]);
  const triggerLabel = useMemo(() => formatTriggerLabel(value, activePreset), [value, activePreset]);

  // Close on outside click. Capture phase to beat any stopPropagation
  // on internal child handlers.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const applyPreset = (key: PresetKey) => {
    onChange(computePresetRange(key));
    setOpen(false);
  };

  const stepMonth = (delta: number) => {
    setAnchor((a) => {
      const d = new Date(a.year, a.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const applyAnchorMonth = () => {
    // Click center label → set range to that whole month.
    const first = new Date(anchor.year, anchor.month, 1);
    const last = new Date(anchor.year, anchor.month + 1, 0);
    onChange({ dateFrom: toIso(first), dateTo: toIso(last) });
    setOpen(false);
  };

  const fromInputChange = (next: string) => {
    const v = next || null;
    // Validate: from must not exceed to. If user enters from > to, reset
    // to (matches what most users mean — they're picking a new range).
    if (v && value.dateTo && v > value.dateTo) {
      onChange({ dateFrom: v, dateTo: v });
    } else {
      onChange({ dateFrom: v, dateTo: value.dateTo });
    }
  };

  const toInputChange = (next: string) => {
    const v = next || null;
    if (v && value.dateFrom && v < value.dateFrom) {
      onChange({ dateFrom: v, dateTo: v });
    } else {
      onChange({ dateFrom: value.dateFrom, dateTo: v });
    }
  };

  const clear = () => {
    onChange({ dateFrom: null, dateTo: null });
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border1 bg-card text-[12px] text-text-primary hover:bg-bg-subtle"
      >
        <Calendar size={14} className="text-text-muted" />
        <span className="font-semibold">{triggerLabel}</span>
        {/* THG-TASK-027: clear "X" KHÔNG được là role="button"/<button> vì nằm
            TRONG <button> trigger → React 19 báo "button cannot be a descendant
            of button" (hydration error). Dùng span onClick thuần (phrasing content
            hợp lệ trong button); stopPropagation chặn toggle. */}
        {(value.dateFrom || value.dateTo) && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            className="text-text-muted hover:text-text-primary cursor-pointer inline-flex"
            aria-label="Clear date filter"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute z-50 top-full mt-1.5 left-0 w-[320px] rounded-lg border border-border1 bg-card shadow-lg p-3 space-y-3"
        >
          {/* Quick presets */}
          <div>
            <div className="text-[10px] uppercase font-bold text-text-muted mb-1.5">
              Quick filters
            </div>
            <div className="grid grid-cols-3 gap-1">
              {PRESETS.map((p) => {
                const active = activePreset === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p.key)}
                    className="px-2 py-1.5 rounded text-[11px] font-semibold border"
                    style={{
                      background: active ? "var(--color-accent)" : "var(--color-card)",
                      color: active ? "white" : "var(--color-text-secondary)",
                      borderColor: active ? "var(--color-accent)" : "var(--color-border1)",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Month/Year stepper */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border1">
            <button
              onClick={() => stepMonth(-1)}
              className="p-1 rounded hover:bg-bg-subtle text-text-muted"
              aria-label="Previous month"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={applyAnchorMonth}
              className="flex-1 text-center px-2 py-1 rounded hover:bg-bg-subtle text-[12px] font-semibold"
              title="Click to select the whole month"
            >
              {`${pad(anchor.month + 1)}/${anchor.year}`}
            </button>
            <button
              onClick={() => stepMonth(1)}
              className="p-1 rounded hover:bg-bg-subtle text-text-muted"
              aria-label="Next month"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Concrete range inputs */}
          <div className="pt-2 border-t border-border1">
            <div className="text-[10px] uppercase font-bold text-text-muted mb-1.5">
              Custom range
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="flex flex-col gap-0.5">
                <span className="text-text-muted">From</span>
                <input
                  type="date"
                  value={value.dateFrom ?? ""}
                  onChange={(e) => fromInputChange(e.target.value)}
                  className="px-2 py-1 rounded border border-border1 bg-card text-text-primary"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-text-muted">To</span>
                <input
                  type="date"
                  value={value.dateTo ?? ""}
                  onChange={(e) => toInputChange(e.target.value)}
                  className="px-2 py-1 rounded border border-border1 bg-card text-text-primary"
                />
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between pt-2 border-t border-border1">
            <button
              onClick={clear}
              className="text-[11px] text-text-muted hover:text-text-primary font-semibold"
            >
              Clear
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-[11px] font-semibold px-3 py-1 rounded bg-cta text-cta-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

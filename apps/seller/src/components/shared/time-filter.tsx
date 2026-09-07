"use client";

const TIME_OPTIONS = ["Day", "Week", "Month", "Year"] as const;
const DATE_OPTIONS = [
  "Today", "Yesterday", "This Week", "Last Week",
  "This Month", "Last Month", "This Year",
  "All time",
] as const;

export type TimeOption = (typeof TIME_OPTIONS)[number];
export type DateOption = (typeof DATE_OPTIONS)[number];

export function TimeFilter({
  value,
  onChange,
}: {
  value: TimeOption;
  onChange: (v: TimeOption) => void;
}) {
  return (
    <div className="flex gap-0.5 bg-surface-muted p-0.5 rounded-lg">
      {TIME_OPTIONS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className="px-3 py-1 rounded-md border-none cursor-pointer text-[10.5px]"
          style={{
            fontWeight: value === t ? 700 : 500,
            background: value === t ? "var(--color-card)" : "transparent",
            color: value === t ? "#111" : "var(--color-text-muted)",
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function DateFilter({
  value,
  onChange,
}: {
  value: DateOption;
  onChange: (v: DateOption) => void;
}) {
  return (
    <div className="flex gap-0.5 bg-surface-muted p-0.5 rounded-lg">
      {DATE_OPTIONS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className="px-2.5 py-0.5 rounded-[5px] border-none cursor-pointer text-[9.5px]"
          style={{
            fontWeight: value === t ? 700 : 400,
            background: value === t ? "var(--color-card)" : "transparent",
            color: value === t ? "#141d2e" : "var(--color-text-muted)",
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

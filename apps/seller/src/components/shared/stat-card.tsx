"use client";

import type { ReactNode } from "react";

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
  /** Optional JSX to render under the value (takes precedence over `sub`). */
  subNode?: ReactNode;
  /** Makes the card clickable; parent drives what the click does (filter/sort/toggle). */
  onClick?: () => void;
  /** When true, card shows a highlighted border to reflect the active state. */
  active?: boolean;
}

export function StatCard({ icon, label, value, color = "#111", sub, subNode, onClick, active }: StatCardProps) {
  const interactive = typeof onClick === "function";
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`bg-card rounded-xl px-4 py-3 transition-colors ${interactive ? "cursor-pointer hover:bg-card-hover select-none" : ""} ${active ? "border-2" : "border border-border1"}`}
      style={active ? { borderColor: color, background: `${color}08` } : undefined}
    >
      <div className="text-[9.5px] text-text-muted font-semibold mb-0.5 uppercase tracking-wider">
        {icon} {label}
      </div>
      <div
        className="text-[22px] font-extrabold font-mono tracking-tight"
        style={{ color }}
      >
        {value}
      </div>
      {subNode ? (
        <div className="text-[9.5px] text-text-muted mt-0.5">{subNode}</div>
      ) : sub ? (
        <div className="text-[9.5px] text-text-muted mt-0.5">{sub}</div>
      ) : null}
    </div>
  );
}

"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-surface-muted p-0.5">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
            theme === value
              ? "bg-card text-text-primary shadow-sm"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          <Icon size={12} />
          {!compact && label}
        </button>
      ))}
    </div>
  );
}

"use client";

/**
 * THG — Tab shell dùng chung cho các "hub page" (gom nhiều page con thành tab).
 * Sync tab active vào `?tab=` (deep-link + giữ khi F5). Chỉ render tab đang active
 * (page con tự lo PageHeader của nó → hub không render header riêng).
 *
 * Bọc trong <Suspense> ở hub vì dùng useSearchParams.
 */
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface TabDef {
  key: string;
  label: string;
  render: () => ReactNode;
}

// paramKey mặc định "hub" (KHÔNG dùng "tab") để tránh đụng `?tab` mà vài page con
// tự quản (staff, logs) khi được nhúng làm tab trong hub.
export function TabPage({ tabs, paramKey = "hub" }: { tabs: TabDef[]; paramKey?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlTab = sp.get(paramKey);
  const active = tabs.some((t) => t.key === urlTab) ? (urlTab as string) : tabs[0].key;
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  const setTab = (k: string) => {
    const params = new URLSearchParams(Array.from(sp.entries()));
    params.set(paramKey, k);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div>
      <div className="flex gap-1 border-b border-border1 px-2 overflow-x-auto bg-bg sticky top-0 z-20">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2.5 text-[12px] font-semibold whitespace-nowrap border-b-2 -mb-px cursor-pointer bg-transparent transition-colors ${
              active === t.key ? "border-accent text-accent" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div key={activeTab.key}>{activeTab.render()}</div>
    </div>
  );
}

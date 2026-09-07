"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * THG-OMS-048: persist list-page filter state in URL searchParams.
 *
 * Why URL state (vs. useState or sessionStorage):
 *  - Browser Back from detail page → URL restored → state restored.
 *  - F5 keeps the filters applied.
 *  - Sharable links (Slack a filtered list to a teammate).
 *
 * The hook is typed loosely so each list page can pass its own filter
 * shape — keys + default values. Values are coerced to the same type
 * as the default (string default → string from URL; number default →
 * Number(url-string)). Filters equal to their default are stripped
 * from the URL for cleaner sharable URLs.
 *
 * Setter merges partial updates (so callers can update just the
 * changed key without re-typing everything). router.replace (not push)
 * — filter tweaks don't pollute history; only navigating to a detail
 * page pushes a new entry.
 */
export function useUrlState<T extends Record<string, string | number | null>>(
  defaults: T,
): [T, (next: Partial<T>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values = useMemo(() => {
    const out = { ...defaults } as Record<string, string | number | null>;
    for (const key of Object.keys(defaults)) {
      const raw = searchParams.get(key);
      if (raw === null) continue;
      const def = (defaults as Record<string, unknown>)[key];
      if (typeof def === "number") {
        // Coerce + fallback to default if malformed (?page=abc → page=1).
        // Without this guard the state holds NaN, which Prisma silently
        // turns into a 500 on `take: NaN`.
        const n = Number(raw);
        out[key] = Number.isFinite(n) ? n : def;
      } else {
        out[key] = raw;
      }
    }
    return out as T;
  }, [searchParams, defaults]);

  const update = useCallback(
    (next: Partial<T>) => {
      const merged = { ...values, ...next } as Record<string, string | number | null>;
      // Giữ param KHÔNG thuộc state này (vd ?hub của TabPage khi page được nhúng
      // làm tab trong hub) — chỉ quản lý các key trong `defaults`.
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(merged)) {
        const def = (defaults as Record<string, unknown>)[k];
        if (v == null || v === "" || v === def) params.delete(k);
        else params.set(k, String(v));
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [values, defaults, pathname, router, searchParams],
  );

  return [values, update];
}

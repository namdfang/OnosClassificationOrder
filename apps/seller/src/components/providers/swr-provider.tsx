"use client";

import { SWRConfig } from "swr";

/**
 * Global SWR configuration. Kept in a tiny client component so the root
 * layout stays a Server Component.
 *
 * Defaults chosen to match the legacy useApi hook's behavior:
 *   - No focus revalidation: matches the "no auto-refetch" expectation the
 *     existing codebase was written against. Dashboards that want this can
 *     opt-in per-hook.
 *   - No error retry: legacy hook surfaced errors immediately; retry loops
 *     would surprise users who expect a single clear failure.
 *   - Dedupe identical requests within 2s: primary perf win — sidebar-style
 *     hooks (usePendingCount + useSlaOverdueCount) now hit the wire once per
 *     mount burst instead of per component that needs them.
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        shouldRetryOnError: false,
        errorRetryCount: 0,
        dedupingInterval: 2000,
      }}
    >
      {children}
    </SWRConfig>
  );
}

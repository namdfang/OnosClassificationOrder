"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * THG-OMS-048: back-from-detail navigation that preserves list filter state.
 *
 * Issue: detail pages (Order/Trouble/Todo + portal variants) had
 * `router.push("/<list>")` hardcoded — this strips the query string,
 * so the in-app "Back to <list>" button reset the list to defaults.
 *
 * Strategy (3 layers, fallback chain):
 *   1. **sessionStorage** (most reliable) — list pages call
 *      `useStashListUrl(fallbackPath)` to write current URL to a per-tab
 *      key. Back button reads + pushes. Survives privacy extensions
 *      that strip Referer header (adblockers, Brave Shields, etc).
 *   2. **document.referrer** + `router.back()` — fallback when sessionStorage
 *      empty (first visit, tab restored). Same-origin referrer matching
 *      fallbackPath → back() pops browser history → URL restored.
 *   3. **Bare router.push(fallbackPath)** — last resort (Slack direct link,
 *      external referrer, privacy-stripped referrer with empty stash).
 *
 * Original implementation chỉ dùng layer 2 (referrer + history). Sau user
 * report 2026-05-22: privacy users (adblocker → strip referrer) bị mất filter
 * → thêm layer 1 sessionStorage backup.
 */

const STASH_PREFIX = "thg:list-return:";

export function useBackToList(fallbackPath: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window === "undefined") {
      router.push(fallbackPath);
      return;
    }

    // Layer 1: sessionStorage — set bởi useStashListUrl ở list page.
    // Survives privacy extensions blocking Referer.
    try {
      const stashed = sessionStorage.getItem(`${STASH_PREFIX}${fallbackPath}`);
      if (stashed && stashed.startsWith(fallbackPath)) {
        router.push(stashed);
        return;
      }
    } catch {
      // sessionStorage có thể fail trong privacy mode — fall through.
    }

    // Layer 2: referrer + router.back() (giữ history-back UX khi possible).
    const ref = document.referrer;
    let refUrl: URL | null = null;
    if (ref) {
      try {
        const parsed = new URL(ref);
        if (parsed.origin === window.location.origin && parsed.pathname.startsWith(fallbackPath)) {
          refUrl = parsed;
        }
      } catch {
        // malformed referrer — fall through to fallback
      }
    }

    if (refUrl) {
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push(refUrl.pathname + refUrl.search);
      }
      return;
    }

    // Layer 3: bare push (filter context unrecoverable)
    router.push(fallbackPath);
  }, [router, fallbackPath]);
}

/**
 * THG-OMS-048: list pages opt-in to robust back-restore by calling this hook.
 *
 * Writes current pathname + search to sessionStorage on mount + every URL
 * change. Pair với `useBackToList(key)` ở detail page — back button đọc lại
 * URL stash → push → filter restored, không phụ thuộc document.referrer.
 *
 * Per-tab scope: sessionStorage isolated per tab, không bleed cross-tab.
 * Cleared on tab close (acceptable — filter context không cần persist
 * across browser sessions).
 *
 * @param key — phải match `fallbackPath` của detail's useBackToList. Vd
 *              list `/oms/v2/list` dùng key `"/oms"` (detail `/oms/[id]`
 *              dùng `useBackToList("/oms")`).
 */
export function useStashListUrl(key: string): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const qs = searchParams.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      sessionStorage.setItem(`${STASH_PREFIX}${key}`, url);
    } catch {
      // ignore quota / privacy errors
    }
  }, [pathname, searchParams, key]);
}

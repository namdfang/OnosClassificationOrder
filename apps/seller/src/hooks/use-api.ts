"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { readJsonOrThrow } from "@/lib/read-json";

/** Redirect to login when session is invalid — prevents error boundary crash */
function redirectToLogin() {
  if (typeof window === "undefined") return;
  // Avoid redirect loop: only redirect if not already on login page
  const inHub = window.location.pathname === "/hub" || window.location.pathname.startsWith("/hub/");
  const login = inHub ? "/hub/login" : "/login";
  if (window.location.pathname === login) return;
  window.location.href = `${login}?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
}

/**
 * SWR fetcher. Preserves the auth-redirect semantics of the legacy useApi
 * implementation so that callers don't have to special-case 401s.
 */
async function fetcher(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("HTTP 401");
  }
  if (res.redirected && res.url.includes("/login")) {
    redirectToLogin();
    throw new Error("redirected-to-login");
  }
  // Phần kiểm HTML/JSON nằm ở `readJsonOrThrow` (dùng chung với apiFetch) — trang đăng nhập
  // thì về /login, còn trang lỗi của proxy thì báo câu dễ hiểu và GIỮ NGƯỜI DÙNG Ở LẠI.
  return readJsonOrThrow<unknown>(res, { onSessionExpired: redirectToLogin, label: url });
}

/**
 * Generic API fetching hook, now backed by SWR.
 *
 * Interface is preserved verbatim from the legacy implementation so that
 * all ~50 call sites continue to work without edit:
 *   - `data`: result of the latest successful fetch (null before first hit)
 *   - `loading`: true while SWR has no cached value AND no error for this key
 *   - `error`: message from the most recent failure, or null
 *   - `refetch()`: revalidate the current key
 *   - `setData(value)`: overwrite the cache without triggering a revalidation
 *
 * The second argument (`_deps`) is intentionally accepted but unused. Every
 * call site in the codebase already embeds its dependencies in the URL
 * (verified by audit), so SWR's URL-keyed cache handles re-fetching on dep
 * change automatically. The parameter is kept to avoid a mass rename.
 */
export function useApi<T>(url: string | null, _deps: unknown[] = []) {
  const { data, error, isLoading, mutate } = useSWR<T>(url, fetcher as never, { keepPreviousData: true, dedupingInterval: 5000 });

  const refetch = useCallback(() => {
    void mutate();
  }, [mutate]);

  // Mirror React.useState setter: accept either a value or an updater fn.
  // Legacy callers (comments hooks, SSE merging) pass updaters that reduce
  // over the previous list; SWR's mutate supports both shapes natively.
  const setData = useCallback(
    (value: T | null | ((prev: T | null) => T | null)) => {
      if (typeof value === "function") {
        const updater = value as (prev: T | null) => T | null;
        void mutate((prev) => updater((prev as T | undefined) ?? null) as never, false);
      } else {
        void mutate(value as never, false);
      }
    },
    [mutate],
  );

  return {
    data: (data ?? null) as T | null,
    loading: isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refetch,
    setData,
  };
}

/** Mutation helper for POST/PATCH/DELETE. Unchanged from legacy. */
export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  // Auth expired → redirect to login
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Session expired");
  }

  if (res.redirected && res.url.includes("/login")) {
    redirectToLogin();
    throw new Error("Session expired");
  }

  // `res.json()` để trần ở đây chính là chỗ sinh ra "Unexpected token '<'" mà ops gặp:
  // proxy trả trang HTML kèm 200 thì parse vỡ, thông điệp thô lọt thẳng ra toast.
  return readJsonOrThrow<T>(res, { onSessionExpired: redirectToLogin, label: url });
}

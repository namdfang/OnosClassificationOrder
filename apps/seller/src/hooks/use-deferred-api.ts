"use client";

import { useEffect, useState } from "react";
import { useApi } from "./use-api";

/**
 * Same shape as `useApi`, but holds off on issuing the fetch until the
 * browser is idle (requestIdleCallback). Used for sidebar widget
 * badges (SLA overdue, leave pending) that aren't critical for first
 * paint — letting the main route's primary fetches grab connections
 * first dramatically cuts INP on slow mounts.
 *
 * Fallback for environments without rIC: 500ms setTimeout, which still
 * yields the initial paint to the main thread.
 *
 * `null` URL (or `skip: true`) short-circuits like in `useApi`.
 */
export function useDeferredApi<T>(url: string | null, options?: { skip?: boolean }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      // 1.5s timeout — if the main thread stays busy past that, we
      // fire anyway so the badge doesn't stay hidden forever.
      const handle = w.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => {
        if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(handle);
      };
    }
    const tid = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(tid);
  }, []);

  const effectiveUrl = ready && !options?.skip ? url : null;
  return useApi<T>(effectiveUrl);
}

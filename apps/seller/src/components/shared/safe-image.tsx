"use client";

import { useState, type ImgHTMLAttributes } from "react";

interface SafeImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string | null | undefined;
  /** Element rendered when src is empty/null OR loading fails. */
  fallback: React.ReactNode;
}

/**
 * <img> wrapper that swaps to a fallback element on load failure instead
 * of sitting in the broken-image state forever.
 *
 * Real orders can carry stale/dead design URLs (e.g. ditech.app links that
 * return 404) — Chrome retries those for ~5s per image, which both wastes
 * bandwidth and delays the page's "loaded" signal. Catching `onError`
 * lets us free the slot immediately so the rest of the UI doesn't wait.
 */
export function SafeImage({ src, fallback, onError, ...rest }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return <>{fallback}</>;

  return (
    <img
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      {...rest}
      src={src}
      onError={(e) => {
        setFailed(true);
        onError?.(e);
      }}
    />
  );
}

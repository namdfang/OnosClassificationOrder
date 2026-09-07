'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import useSWR from 'swr';
import type { Customer } from 'shared';

export interface SessionProfile extends Customer {
  impersonatedBy?: { userId?: string; email?: string; name?: string } | string;
}

interface SessionCtx {
  profile: SessionProfile | null;
  isLoading: boolean;
  isImpersonating: boolean;
  refresh: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

async function fetchMe(url: string): Promise<SessionProfile | null> {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: SessionProfile };
  return json.data ?? null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, mutate } = useSWR('/api/v1/customer/auth/me', fetchMe, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const refresh = useCallback(() => void mutate(), [mutate]);
  const signOut = useCallback(async () => {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const json = (await res.json().catch(() => null)) as { data?: { redirectTo?: string } } | null;
    window.location.href = json?.data?.redirectTo || '/login';
  }, []);
  const value = useMemo<SessionCtx>(
    () => ({
      profile: data ?? null,
      isLoading,
      isImpersonating: !!data?.impersonatedBy,
      refresh,
      signOut,
    }),
    [data, isLoading, refresh, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

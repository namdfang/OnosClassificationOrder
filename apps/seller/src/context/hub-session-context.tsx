'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import useSWR from 'swr';

export interface HubUser {
  _id: string;
  fullName?: string;
  email?: string;
  role?: { name?: string };
  impersonatedBy?: unknown;
}

interface HubSessionCtx {
  user: HubUser | null;
  roleName: string;
  isLoading: boolean;
  refresh: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<HubSessionCtx | null>(null);

async function fetchMe(url: string): Promise<HubUser | null> {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: HubUser };
  return json.data ?? null;
}

/** Phiên NHÂN VIÊN của khu `/hub` — SWR `GET /auth/me` qua proxy hub (cookie `onos_hub_token`). */
export function HubSessionProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, mutate } = useSWR('/api/hub/v1/auth/me', fetchMe, { revalidateOnFocus: false, shouldRetryOnError: false });
  const refresh = useCallback(() => void mutate(), [mutate]);
  const signOut = useCallback(async () => {
    await fetch('/api/hub/auth/logout', { method: 'POST' });
    window.location.href = '/hub/login';
  }, []);
  const value = useMemo<HubSessionCtx>(
    () => ({ user: data ?? null, roleName: data?.role?.name ?? '', isLoading, refresh, signOut }),
    [data, isLoading, refresh, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHubSession(): HubSessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHubSession must be used inside HubSessionProvider');
  return v;
}

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export type StatusFilterCategory =
  | 'printStatus'
  | 'printStatusNote'
  | 'toolResult'
  | 'toolResultNote'
  | 'errorFile'
  | 'assignee'
  | 'assigneeNote';

export type StatusFilter = {
  printStatus: string[];
  printStatusNote: string[];
  toolResult: string[];
  toolResultNote: string[];
  errorFile: string[];
  assignee: string[];
  assigneeNote: string[];
  factoryId?: string;
  machineTypeId?: string;
  readyForFulfill?: boolean;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
};

const CSV_KEYS: StatusFilterCategory[] = [
  'printStatus',
  'printStatusNote',
  'toolResult',
  'toolResultNote',
  'errorFile',
  'assignee',
  'assigneeNote',
];

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Filter state stored in URL search params so refresh / share keeps the view.
 * Default range = last 7 days (matches BE Designer/Fulfill window).
 */
export function useStatusFilter() {
  const [searchParams, setSearchParams] = useSearchParams();

  // One-shot cleanup: if URL has a stale `createdTo` (older than today), drop
  // the date params so the dashboard falls back to default (last 7 days
  // ending today). Without this, a URL bookmarked yesterday silently misses
  // every order created today.
  const staleCleanupDone = useRef(false);
  useEffect(() => {
    if (staleCleanupDone.current) return;
    staleCleanupDone.current = true;
    const urlTo = searchParams.get('createdTo');
    if (urlTo && urlTo < todayISO()) {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          sp.delete('createdFrom');
          sp.delete('createdTo');
          return sp;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  const filter: StatusFilter = useMemo(() => {
    const f: StatusFilter = {
      printStatus: [],
      printStatusNote: [],
      toolResult: [],
      toolResultNote: [],
      errorFile: [],
      assignee: [],
      assigneeNote: [],
    };
    for (const k of CSV_KEYS) {
      const raw = searchParams.get(k);
      if (raw) f[k] = raw.split(',').filter(Boolean);
    }
    const factoryId = searchParams.get('factoryId');
    const machineTypeId = searchParams.get('machineTypeId');
    const ready = searchParams.get('readyForFulfill');
    const from = searchParams.get('createdFrom') || daysAgoISO(7);
    const to = searchParams.get('createdTo') || todayISO();
    const search = searchParams.get('search') || undefined;
    if (factoryId) f.factoryId = factoryId;
    if (machineTypeId) f.machineTypeId = machineTypeId;
    if (ready === 'true') f.readyForFulfill = true;
    else if (ready === 'false') f.readyForFulfill = false;
    f.createdFrom = from;
    f.createdTo = to;
    f.search = search;
    return f;
  }, [searchParams]);

  const writeParams = useCallback(
    (mutator: (sp: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          mutator(sp);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const toggle = useCallback(
    (category: StatusFilterCategory, code: string) => {
      writeParams((sp) => {
        const raw = sp.get(category);
        const arr = raw ? raw.split(',').filter(Boolean) : [];
        const idx = arr.indexOf(code);
        if (idx === -1) arr.push(code);
        else arr.splice(idx, 1);
        if (arr.length === 0) sp.delete(category);
        else sp.set(category, arr.join(','));
      });
    },
    [writeParams],
  );

  const setScalar = useCallback(
    (key: 'factoryId' | 'machineTypeId' | 'createdFrom' | 'createdTo' | 'search', value: string | undefined) => {
      writeParams((sp) => {
        if (value === undefined || value === '') sp.delete(key);
        else sp.set(key, value);
      });
    },
    [writeParams],
  );

  const setReady = useCallback(
    (value: boolean | undefined) => {
      writeParams((sp) => {
        if (value === undefined) sp.delete('readyForFulfill');
        else sp.set('readyForFulfill', String(value));
      });
    },
    [writeParams],
  );

  const clearAll = useCallback(() => {
    writeParams((sp) => {
      for (const k of CSV_KEYS) sp.delete(k);
      sp.delete('factoryId');
      sp.delete('machineTypeId');
      sp.delete('readyForFulfill');
      sp.delete('createdFrom');
      sp.delete('createdTo');
      sp.delete('search');
    });
  }, [writeParams]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const k of CSV_KEYS) {
      if (filter[k].length > 0) params.set(k, filter[k].join(','));
    }
    if (filter.factoryId) params.set('factoryId', filter.factoryId);
    if (filter.machineTypeId) params.set('machineTypeId', filter.machineTypeId);
    if (typeof filter.readyForFulfill === 'boolean')
      params.set('readyForFulfill', String(filter.readyForFulfill));
    if (filter.createdFrom) params.set('createdFrom', filter.createdFrom);
    if (filter.createdTo) params.set('createdTo', filter.createdTo);
    if (filter.search) params.set('search', filter.search);
    const s = params.toString();
    return s ? '?' + s : '';
  }, [filter]);

  const isActive = useMemo(
    () =>
      CSV_KEYS.some((k) => filter[k].length > 0) ||
      !!filter.factoryId ||
      !!filter.machineTypeId ||
      typeof filter.readyForFulfill === 'boolean' ||
      !!filter.search,
    [filter],
  );

  return { filter, queryString, isActive, toggle, setScalar, setReady, clearAll };
}

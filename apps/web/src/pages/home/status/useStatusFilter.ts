import { useCallback, useEffect, useMemo, useState } from 'react';
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
  // Use local date components — `Date.toISOString()` converts to UTC, which
  // returns yesterday's date in UTC+ timezones during morning hours.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Status-tab filter state. Workshop-flow filters (printStatus, assignee...)
 * round-trip through the URL so deep links + tab switches preserve them.
 * Date range is intentionally local-only — workshop staff want a fresh "today"
 * every mount; URL-shared dates from a previous session caused stale views.
 */
export function useStatusFilter() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Dates live in component state, NOT URL — always default to today on mount.
  const [createdFrom, setCreatedFrom] = useState<string>(todayISO());
  const [createdTo, setCreatedTo] = useState<string>(todayISO());

  // Belt + suspenders: even if HMR preserved a stale state across a hot edit,
  // force both inputs back to today on the very first mount. Runs once.
  useEffect(() => {
    const today = todayISO();
    setCreatedFrom(today);
    setCreatedTo(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const search = searchParams.get('search') || undefined;
    if (factoryId) f.factoryId = factoryId;
    if (machineTypeId) f.machineTypeId = machineTypeId;
    if (ready === 'true') f.readyForFulfill = true;
    else if (ready === 'false') f.readyForFulfill = false;
    f.createdFrom = createdFrom;
    f.createdTo = createdTo;
    f.search = search;
    return f;
  }, [searchParams, createdFrom, createdTo]);

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
      // Dates: local state. Others: URL.
      if (key === 'createdFrom') {
        setCreatedFrom(value || todayISO());
        return;
      }
      if (key === 'createdTo') {
        setCreatedTo(value || todayISO());
        return;
      }
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
      sp.delete('search');
    });
    setCreatedFrom(todayISO());
    setCreatedTo(todayISO());
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

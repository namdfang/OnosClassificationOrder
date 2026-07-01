import { useEffect, useRef } from 'react';

import { RepositoryRemote } from '@/services';

const POLL_INTERVAL_MS = 5000;
const MAX_DURATION_MS = 5 * 60 * 1000;

interface RowWithDesigns {
  _id: string;
  designs?: Record<string, string | undefined>;
  designsStatus?: Partial<Record<string, 'pending' | 'ready' | 'failed'>>;
}

/**
 * Polling auto-refresh khi có row với `designsStatus.{k}='pending'`. BE chỉ
 * trả về subset field (`_id`, `designs`, `designsStatus`) cho các id pending.
 *
 * Gọi `patchRow(id, patch)` mỗi 5s đến khi không còn row nào pending hoặc hết
 * timeout 5 phút (safety net cho job hỏng / queue tắc).
 *
 * Dependencies: `rows` phải là reference ổn định khi không đổi để effect không
 * spam restart interval. Caller pass list từ state mong muốn (vd: items array).
 */
export function usePendingDesignsPoll(
  rows: RowWithDesigns[],
  patchRow: (id: string, patch: Partial<RowWithDesigns>) => void,
) {
  const startedAtRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // `rows`/`patchRow` đổi reference mỗi render (fetch/patch) → giữ trong ref để
  // effect KHÔNG tear-down + tạo lại interval liên tục. `tick` đọc giá trị mới
  // nhất qua ref, nên effect chỉ cần depend vào `hasPending` (boolean).
  const rowsRef = useRef(rows);
  const patchRef = useRef(patchRow);
  rowsRef.current = rows;
  patchRef.current = patchRow;

  const hasPending = rows.some((r) => {
    const st = r.designsStatus;
    if (!st) return false;
    return Object.values(st).some((v) => v === 'pending');
  });

  useEffect(() => {
    if (!hasPending) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startedAtRef.current = 0;
      return;
    }

    if (!startedAtRef.current) startedAtRef.current = Date.now();

    const tick = async () => {
      // Reduce id list mỗi lần tick — chỉ poll row còn pending (đọc rows mới nhất).
      const pendingIds = rowsRef.current
        .filter((r) =>
          r.designsStatus && Object.values(r.designsStatus).some((v) => v === 'pending'),
        )
        .map((r) => r._id);

      if (pendingIds.length === 0) return;
      if (Date.now() - startedAtRef.current > MAX_DURATION_MS) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      try {
        const res = await RepositoryRemote.order.checkPendingDesigns(pendingIds);
        const items = (res.data?.data || []) as RowWithDesigns[];
        for (const item of items) {
          patchRef.current(item._id, {
            designs: item.designs,
            designsStatus: item.designsStatus,
          });
        }
      } catch {
        // silent — sẽ retry tick sau
      }
    };

    intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasPending]);
}

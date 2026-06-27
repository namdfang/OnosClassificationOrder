import { useCallback } from 'react';
import { WorkshopConfigCategory } from 'shared';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

/**
 * Hook check 1 row "không tool" để tô màu hàng (light blue background).
 *
 * Convention đồng bộ với BE (`order.service.ts:1706` → `toolHasCodes` query):
 *   `name` bắt đầu bằng "Có" (case-insensitive) = "có tool".
 *
 * → "không tool" = `toolResult` đã set + resolve qua `workshopConfigStore` +
 *   `name` KHÔNG bắt đầu bằng "Có".
 *
 * Row `toolResult` null/empty (chưa check) → KHÔNG tô màu (tránh hiểu nhầm
 * "chưa biết" thành "không có tool").
 *
 * Trả về callback nhận `toolResult` code → boolean. Callback stable nên có
 * thể dùng trực tiếp trong `map()` mà không lo re-render mỗi row.
 */
export function useIsNoTool(): (toolResult?: string | null) => boolean {
  const resolve = useWorkshopConfigStore((s) => s.resolve);

  return useCallback(
    (toolResult) => {
      if (!toolResult) return false;
      const cfg = resolve(WorkshopConfigCategory.ToolResult, toolResult);
      if (!cfg?.name) return false;
      return !/^Có/i.test(cfg.name.trim());
    },
    [resolve],
  );
}

/** Tailwind class áp lên `<TableRow>` khi `useIsNoTool()(toolResult) === true`.
 *  Light: `bg-sky-100` + border-l 2px `sky-400`. Dark: `bg-sky-500/20` +
 *  border-l `sky-400/60`. Cường độ vừa đủ để scan nhanh trong bảng dài;
 *  border-l làm cue mạnh mà không phá readability của text cell. Selection
 *  vẫn thắng vì caller compose: `cn(noToolClass, selected && 'bg-primary/5')`. */
export const NO_TOOL_ROW_CLASS =
  'bg-sky-100 dark:bg-sky-500/20 border-l-2 border-l-sky-400 dark:border-l-sky-400/60';

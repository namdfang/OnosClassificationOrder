import type { WorkshopStageFilterKey } from 'shared';

/**
 * Màu MỘT NGUỒN cho 8 chặng (+ `done`) của trang "Đơn hàng theo xưởng": ô phễu
 * (`WorkshopStageStrip`), thanh mini theo loại sản phẩm (`WorkshopTypeRail`) và chip
 * chặng ở tiêu đề bảng phải dùng CÙNG bảng này để người xem đối chiếu bằng mắt.
 * Dùng lớp Tailwind tường minh (không `bg-primary` — biến `--primary` của theme là
 * navy đậm, không phải indigo của hệ thiết kế).
 */
export const STAGE_COLORS: Record<WorkshopStageFilterKey, { bar: string; dot: string; chip: string }> = {
  'tool-check': { bar: 'bg-slate-400', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  designer: { bar: 'bg-sky-400', dot: 'bg-sky-400', chip: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200' },
  print: { bar: 'bg-indigo-500', dot: 'bg-indigo-500', chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200' },
  press: { bar: 'bg-amber-400', dot: 'bg-amber-400', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200' },
  'qc-post-press': { bar: 'bg-violet-400', dot: 'bg-violet-400', chip: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200' },
  'sew-in': { bar: 'bg-emerald-400', dot: 'bg-emerald-400', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' },
  'sew-out': { bar: 'bg-teal-500', dot: 'bg-teal-500', chip: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200' },
  pack: { bar: 'bg-lime-500', dot: 'bg-lime-500', chip: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-200' },
  done: { bar: 'bg-emerald-700', dot: 'bg-emerald-700', chip: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100' },
};

/** Thứ tự vẽ thanh mini (cùng thứ tự phễu, thêm `done` cuối). */
export const STAGE_BAR_ORDER: WorkshopStageFilterKey[] = [
  'tool-check',
  'designer',
  'print',
  'press',
  'qc-post-press',
  'sew-in',
  'sew-out',
  'pack',
  'done',
];

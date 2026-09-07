import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

export function fmtVND(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

// THG-ATT-006: format mọi giá trị trễ theo "Xh YY'" — minutes padded 2
// digit, apostrophe cho phút. Tên cột đi kèm là "Thời gian trễ".
// Trường hợp 0 phút giữ chuỗi "0" để row no-late khỏi nhiễu visual.
export function formatLateMinutes(minutes: number): string {
  if (minutes <= 0) return "0";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}'`;
}

export function fmtUSD(n: number | null | undefined): string {
  // Tolerant: caller có thể truyền null/undefined (vd wallet balance khi
  // API chưa load, hoặc field optional schema). Trước đây crash runtime
  // với "can't access property toLocaleString, n is undefined". Quay
  // about $0.00 thay vì throw — UI tự update khi data load xong.
  if (n === null || n === undefined || !Number.isFinite(n)) {
    return "$0.00";
  }
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

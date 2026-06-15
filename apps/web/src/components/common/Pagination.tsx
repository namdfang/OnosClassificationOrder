import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
  onChange: (page: number, pageSize: number) => void;
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  pageSizeOptions = [10, 20, 50, 100],
  onChange,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  // Compute page numbers to show (sliding window of 5)
  const pages: number[] = [];
  const windowSize = 5;
  let start = Math.max(1, safePage - 2);
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  const go = (p: number) => {
    if (p < 1 || p > totalPages || p === safePage) return;
    onChange(p, pageSize);
  };

  return (
    <div className={cn('flex items-center justify-between gap-3 flex-wrap', className)}>
      <p className="text-xs text-muted-foreground">
        {total === 0 ? 'Không có kết quả' : `Hiển thị ${from}–${to} / ${total}`}
      </p>

      <div className="flex items-center gap-1.5">
        <select
          value={pageSize}
          onChange={(e) => onChange(1, Number(e.target.value))}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {pageSizeOptions.map((s) => (
            <option key={s} value={s}>
              {s}/trang
            </option>
          ))}
        </select>

        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(1)} disabled={safePage === 1}>
          <ChevronsLeft size={14} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => go(safePage - 1)}
          disabled={safePage === 1}
        >
          <ChevronLeft size={14} />
        </Button>

        {pages.map((p) => (
          <Button
            key={p}
            variant={p === safePage ? 'default' : 'outline'}
            size="sm"
            className="h-8 min-w-8 px-2"
            onClick={() => go(p)}
          >
            {p}
          </Button>
        ))}

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => go(safePage + 1)}
          disabled={safePage === totalPages}
        >
          <ChevronRight size={14} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => go(totalPages)}
          disabled={safePage === totalPages}
        >
          <ChevronsRight size={14} />
        </Button>
      </div>
    </div>
  );
}

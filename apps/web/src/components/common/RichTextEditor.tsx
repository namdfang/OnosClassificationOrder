import React from 'react';
import ReactQuill from 'react-quill';

import { cn } from '@/utils/cn';

import 'react-quill/dist/quill.snow.css';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Chiều cao tối thiểu vùng soạn thảo (px). */
  minHeight?: number;
  className?: string;
}

const MODULES = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ color: [] }, { background: [] }],
    ['link'],
    ['clean'],
  ],
};

/**
 * Rich text editor (react-quill, theme snow) — giá trị là HTML string. Lưu ý:
 * quill trả "<p><br></p>" khi rỗng — caller tự lọc (xem `cleanHtml` ở trang
 * chi tiết sản phẩm). Style override qua Tailwind arbitrary selector để khớp
 * theme + dark mode.
 */
export function RichTextEditor({ value, onChange, placeholder, minHeight = 140, className }: RichTextEditorProps) {
  return (
    <div
      style={{ '--rte-min-h': `${minHeight}px` } as React.CSSProperties}
      className={cn(
        'rounded-md border border-input bg-background overflow-hidden',
        '[&_.ql-toolbar]:border-0 [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-border [&_.ql-toolbar]:bg-muted/40',
        '[&_.ql-container]:border-0 [&_.ql-container]:text-sm [&_.ql-container]:font-sans',
        '[&_.ql-editor]:min-h-[var(--rte-min-h)] [&_.ql-editor]:text-foreground',
        '[&_.ql-editor.ql-blank::before]:text-muted-foreground [&_.ql-editor.ql-blank::before]:not-italic',
        'dark:[&_.ql-snow_.ql-stroke]:stroke-slate-300 dark:[&_.ql-snow_.ql-fill]:fill-slate-300 dark:[&_.ql-snow_.ql-picker]:text-slate-300',
        className,
      )}
    >
      <ReactQuill theme="snow" value={value} onChange={onChange} placeholder={placeholder} modules={MODULES} />
    </div>
  );
}

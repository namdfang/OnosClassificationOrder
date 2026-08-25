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
 *
 * PRD-8 — CHỈ báo `onChange` khi `source === 'user'`.
 *
 * Quill không giữ nguyên chuỗi HTML nạp vào: nó parse thành Delta rồi render
 * lại theo dạng chuẩn của chính nó, nên HTML lưu trong DB bị viết lại NGAY LÚC
 * MOUNT — bỏ thuộc tính lạ (`data-start`/`data-end` của HTML dán từ nơi khác),
 * bỏ xuống dòng trong `<li>`... Quill bắn kèm `source: 'api'` cho lần viết lại
 * đó. Trước PRD-8, `onChange` nuốt luôn cả loại này nên state đổi mà người dùng
 * chưa gõ gì ⇒ trang chi tiết sản phẩm báo "Chưa lưu" ngay khi vừa mở, hộp
 * thoại rời trang bung vô cớ, và báo động giả lặp lại làm người dùng học cách
 * bấm bừa qua nó — tới lúc có thay đổi THẬT thì cơ chế đã mất tác dụng.
 *
 * Lọc theo `source` chứ không so chuỗi: đây là tín hiệu do chính Quill cấp để
 * phân biệt "người dùng gõ" với "tôi tự chuẩn hoá". Người dùng gõ / bấm nút
 * toolbar / dán đều là `'user'` nên KHÔNG mất thay đổi thật nào.
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
      <ReactQuill
        theme="snow"
        value={value}
        onChange={(html, _delta, source) => {
          if (source === 'user') onChange(html);
        }}
        placeholder={placeholder}
        modules={MODULES}
      />
    </div>
  );
}

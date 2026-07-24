import React from 'react';
import ReactQuill from 'react-quill';

import 'react-quill/dist/quill.snow.css';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Chiều cao vùng soạn thảo (px), mặc định 180. */
  minHeight?: number;
}

const MODULES = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ color: [] }, { background: [] }],
    ['link', 'clean'],
  ],
};

/**
 * Rich text editor dùng chung (react-quill, theme snow) — lưu HTML string.
 * Style override tối thiểu cho hợp theme (border token + dark mode) đặt inline
 * ở đây thay vì globals.css để component tự chứa.
 */
export function RichTextEditor({ value, onChange, placeholder, minHeight = 180 }: Props) {
  return (
    <div className="rte-wrapper rounded-md border border-input bg-background [&_.ql-toolbar]:rounded-t-md [&_.ql-toolbar]:border-0 [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-border [&_.ql-container]:rounded-b-md [&_.ql-container]:border-0 [&_.ql-editor]:text-sm dark:[&_.ql-toolbar_.ql-stroke]:stroke-slate-300 dark:[&_.ql-toolbar_.ql-fill]:fill-slate-300 dark:[&_.ql-picker-label]:text-slate-300">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        modules={MODULES}
        style={{ minHeight }}
      />
      <style>{`.rte-wrapper .ql-editor { min-height: ${minHeight}px; }`}</style>
    </div>
  );
}

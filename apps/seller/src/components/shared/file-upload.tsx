"use client";

import { useState, useRef, useCallback } from "react";
import { X, Paperclip, FileText, Image as ImageIcon, Download, ExternalLink } from "lucide-react";
import { apiFetch } from "@/hooks/use-api";
export interface TaskAttachment {
  url: string;
  name: string;
  size: number;
  type: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon size={14} className="text-blue-500" />;
  return <FileText size={14} className="text-text-muted" />;
}

interface FileUploadProps {
  files: TaskAttachment[];
  onChange: (files: TaskAttachment[]) => void;
  folder?: string;
  disabled?: boolean;
  compact?: boolean; // mobile-friendly compact mode
}

export function FileUpload({ files, onChange, folder = "tasks", disabled, compact }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);
    const newFiles: TaskAttachment[] = [];

    for (const file of Array.from(selectedFiles)) {
      if (file.size > MAX_FILE_SIZE) {
        continue; // skip too large
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        continue; // skip unsupported
      }

      try {
        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Upload to server
        const result = await apiFetch<{ url: string }>("/api/upload", {
          method: "POST",
          body: JSON.stringify({ base64Data: base64, folder }),
        });

        newFiles.push({
          url: result.url,
          name: file.name,
          size: file.size,
          type: file.type,
        });
      } catch {
        // skip failed uploads silently
      }
    }

    if (newFiles.length > 0) {
      onChange([...files, ...newFiles]);
    }
    setUploading(false);

    // Reset input
    if (inputRef.current) inputRef.current.value = "";
  }, [files, onChange, folder]);

  const removeFile = useCallback((index: number) => {
    onChange(files.filter((_, i) => i !== index));
  }, [files, onChange]);

  return (
    <div className="space-y-2">
      {/* File list */}
      {files.length > 0 && (
        <div className={`space-y-1.5 ${compact ? "" : ""}`}>
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-sidebar border border-border1 rounded-lg"
            >
              {getFileIcon(f.type)}
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex-1 font-medium text-text-primary hover:text-[#141d2e] hover:underline truncate ${compact ? "text-xs" : "text-[11px]"}`}
              >
                {f.name}
              </a>
              <span className="text-[9px] text-text-muted shrink-0">{formatFileSize(f.size)}</span>
              <div className="flex items-center gap-1 shrink-0">
                {f.url.startsWith("http") && (
                  <a
                    href={f.url}
                    download={f.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-5 h-5 rounded flex items-center justify-center text-accent bg-info-bg border border-[#e8eaf0] cursor-pointer hover:bg-[#e8eaf0]"
                    title="Download/Open"
                  >
                    {f.type === "text/html" ? <ExternalLink size={10} /> : <Download size={10} />}
                  </a>
                )}
                {!disabled && (
                  <button
                    onClick={() => removeFile(i)}
                    className="w-5 h-5 rounded flex items-center justify-center text-error bg-error-bg border border-error cursor-pointer hover:bg-error-bg"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {!disabled && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border1 bg-card cursor-pointer hover:bg-card-hover disabled:opacity-50 disabled:cursor-default ${compact ? "text-xs w-full justify-center py-2.5" : "text-[10.5px]"}`}
        >
          <Paperclip size={compact ? 14 : 12} className="text-text-muted" />
          <span className="text-text-secondary font-medium">
            {uploading ? "Uploading..." : "Attach Files"}
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

/** Read-only file list for detail views */
export function FileList({ files, compact }: { files: TaskAttachment[]; compact?: boolean }) {
  if (!files || files.length === 0) {
    return <span className="text-[10px] text-text-muted">No attachments</span>;
  }

  return (
    <div className="space-y-1.5">
      {files.map((f, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2.5 py-1.5 bg-sidebar border border-border1 rounded-lg"
        >
          {getFileIcon(f.type)}
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-1 font-medium text-text-primary hover:text-[#141d2e] hover:underline truncate ${compact ? "text-xs" : "text-[11px]"}`}
          >
            {f.name}
          </a>
          <span className="text-[9px] text-text-muted shrink-0">{formatFileSize(f.size)}</span>
          {f.url.startsWith("http") && (
            <a
              href={f.url}
              download={f.name}
              target="_blank"
              rel="noopener noreferrer"
              className="w-5 h-5 rounded flex items-center justify-center text-accent bg-info-bg border border-[#e8eaf0] cursor-pointer hover:bg-[#e8eaf0] ml-1"
              title="Download/Open"
            >
              {f.type === "text/html" ? <ExternalLink size={10} /> : <Download size={10} />}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

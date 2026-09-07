"use client";

import { useEffect } from "react";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: string;
  loading?: boolean;
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", confirmColor = "#b91c1c", loading }: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" />
      <div
        className="relative bg-card rounded-xl border border-border1 shadow-2xl p-6 w-full max-w-[400px] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[14px] font-extrabold text-text-primary m-0 mb-1">{title}</h3>
        <p className="text-[11.5px] text-text-secondary m-0 mb-5 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border1 bg-card text-[11px] font-semibold cursor-pointer hover:bg-card-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-white text-[11px] font-semibold cursor-pointer transition-colors border-none disabled:opacity-60"
            style={{ background: loading ? "#999" : confirmColor }}
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

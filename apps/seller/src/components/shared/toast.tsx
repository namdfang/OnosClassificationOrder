"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  toast: (type: ToastType, message: string) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} className="text-success" />,
  error: <XCircle size={16} className="text-error" />,
  info: <Info size={16} className="text-accent" />,
  warning: <AlertTriangle size={16} className="text-warning" />,
};

const bgColors: Record<ToastType, string> = {
  success: "bg-success-bg border-success",
  error: "bg-error-bg border-error",
  info: "bg-info-bg border-accent-light",
  warning: "bg-warning-bg border-[#fed7aa]",
};

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={() => remove(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setShow(true));
    const duration = toast.type === "error" ? 8000 : toast.type === "info" ? 5000 : 3000;
    const timer = setTimeout(() => {
      setShow(false);
      setTimeout(onDone, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur-sm ${bgColors[toast.type]} transition-all duration-300 ${show ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"}`}
      style={{ minWidth: 260, maxWidth: 380 }}
    >
      {icons[toast.type]}
      <span className="text-[11.5px] font-semibold text-text-primary flex-1">{toast.message}</span>
      <button onClick={() => { setShow(false); setTimeout(onDone, 300); }} className="text-text-muted hover:text-[#555] cursor-pointer bg-transparent border-none p-0">
        <XCircle size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  return useContext(Ctx);
}

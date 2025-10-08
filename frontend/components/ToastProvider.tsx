"use client";
import * as React from "react";

export type Toast = { id: number; title?: string; description?: string };

const ToastCtx = React.createContext<{
  toasts: Toast[];
  show: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
} | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const show = (t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s, { id, ...t }]);
    setTimeout(() => dismiss(id), 3000);
  };
  const dismiss = (id: number) => setToasts((s) => s.filter((x) => x.id !== id));

  return (
    <ToastCtx.Provider value={{ toasts, show, dismiss }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow p-3 text-sm">
            {t.title && <div className="font-medium mb-0.5">{t.title}</div>}
            {t.description && <div className="opacity-80">{t.description}</div>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

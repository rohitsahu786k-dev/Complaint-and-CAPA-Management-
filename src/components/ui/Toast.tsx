import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ToastContext, type ToastContextValue, type ToastMessage, type ToastTone } from "./toast-context";

const toneStyles: Record<ToastTone, { wrapper: string; icon: typeof Info }> = {
  success: { wrapper: "border-green-200 bg-green-50 text-green-900", icon: CheckCircle2 },
  error: { wrapper: "border-red-200 bg-red-50 text-red-900", icon: AlertTriangle },
  info: { wrapper: "border-slate-200 bg-white text-slate-900", icon: Info }
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const push = useCallback(
    (toast: Omit<ToastMessage, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { ...toast, id }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) => push({ tone: "success", title, description }),
      error: (title, description) => push({ tone: "error", title, description })
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6">
        {toasts.map((toast) => {
          const tone = toneStyles[toast.tone];
          const Icon = tone.icon;
          return (
            <div
              key={toast.id}
              role="status"
              className={cn("pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-3 shadow-soft", tone.wrapper)}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description ? <p className="mt-1 text-xs leading-5 opacity-80">{toast.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="rounded p-1 hover:bg-black/5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

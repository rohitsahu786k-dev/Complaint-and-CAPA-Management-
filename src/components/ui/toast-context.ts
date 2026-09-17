import { createContext, useContext } from "react";

export type ToastTone = "success" | "error" | "info";

export type ToastMessage = { id: number; tone: ToastTone; title: string; description?: string };

export type ToastContextValue = {
  push: (toast: Omit<ToastMessage, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  /** Shows a rejected request with the field issues the server named. */
  failure: (error: unknown, fallback: string) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

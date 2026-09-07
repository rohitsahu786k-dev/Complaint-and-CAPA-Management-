import type { ReactNode } from "react";

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

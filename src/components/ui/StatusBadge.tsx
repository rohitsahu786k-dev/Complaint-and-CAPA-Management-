import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const toneMap = {
  neutral: "bg-slate-100 text-slate-700",
  green: "bg-green-50 text-green-700 ring-green-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200"
};

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof toneMap }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-slate-200", toneMap[tone])}>
      {children}
    </span>
  );
}

import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : typeof value === "string" ? parseISO(value) : new Date(String(value));
  return isValid(parsed) ? parsed : null;
}

export function formatDate(value: unknown, fallback = "—"): string {
  const parsed = toDate(value);
  return parsed ? format(parsed, "dd MMM yyyy") : fallback;
}

export function formatDateTime(value: unknown, fallback = "—"): string {
  const parsed = toDate(value);
  return parsed ? format(parsed, "dd MMM yyyy, HH:mm") : fallback;
}

export function formatDateInput(value: unknown): string {
  const parsed = toDate(value);
  return parsed ? format(parsed, "yyyy-MM-dd") : "";
}

export function formatRelative(value: unknown, fallback = "—"): string {
  const parsed = toDate(value);
  return parsed ? `${formatDistanceToNowStrict(parsed)} ago` : fallback;
}

export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "0";
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "0%";
  return `${value}%`;
}

export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function monthLabel(key: string): string {
  const parsed = toDate(`${key}-01`);
  return parsed ? format(parsed, "MMM yy") : key;
}

export type Tone = "neutral" | "green" | "amber" | "red";

const STATUS_TONES: Record<string, Tone> = {
  Open: "neutral",
  Acknowledged: "neutral",
  Contained: "neutral",
  "RCA Done": "neutral",
  "CAPA Assigned": "neutral",
  "Under Verification": "amber",
  "In Progress": "amber",
  Completed: "green",
  Closed: "green",
  Effective: "green",
  Accepted: "green",
  Reopened: "red",
  "Not Effective": "red",
  Rejected: "red",
  "Rejected/Reopened": "red",
  Pending: "amber"
};

export function statusTone(status: string | undefined): Tone {
  if (!status) return "neutral";
  return STATUS_TONES[status] ?? "neutral";
}

export function tatTone(health: string | undefined): Tone {
  if (health === "overdue") return "red";
  if (health === "due-soon") return "amber";
  if (health === "on-time") return "green";
  return "neutral";
}

export function tatLabel(health: string | undefined): string {
  if (health === "overdue") return "Overdue";
  if (health === "due-soon") return "Due soon";
  if (health === "on-time") return "On time";
  return "Not started";
}

/** Human label for a stored delay or workflow field name, used by the audit viewer. */
export function humaniseKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]/g, " ")
    .replace(/^\w/, (character) => character.toUpperCase());
}

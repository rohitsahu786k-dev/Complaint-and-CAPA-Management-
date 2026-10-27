import type { ApiEnvelope } from "@shared/types/api";

export type ApiIssue = { field: string; message: string; section?: string };

export class ApiError extends Error {
  status: number;
  issues: ApiIssue[];

  constructor(message: string, status: number, issues: ApiIssue[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
  }
}

/** The server caps a list page at 100 rows, so an export reads every page in turn. */
export async function fetchAllPages<T>(path: string, params: Record<string, string> = {}, maxRows = 5000): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; items.length < maxRows; page += 1) {
    const query = new URLSearchParams({ ...params, page: String(page), pageSize: "100" });
    const result = await api<{ items: T[]; totalPages: number }>(`${path}?${query.toString()}`);
    items.push(...result.items);
    if (result.items.length === 0 || page >= result.totalPages) break;
  }
  return items;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = (isJson ? await response.json().catch(() => ({})) : {}) as Partial<ApiEnvelope<T>> & {
    message?: string;
    issues?: ApiIssue[];
  };
  if (!response.ok) {
    const message = payload.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, Array.isArray(payload.issues) ? payload.issues : []);
  }
  return payload.data as T;
}

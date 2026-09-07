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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<ApiEnvelope<T>> & { message?: string; issues?: ApiIssue[] };
  if (!response.ok) {
    throw new ApiError(payload.message || "Request failed", response.status, Array.isArray(payload.issues) ? payload.issues : []);
  }
  return payload.data as T;
}

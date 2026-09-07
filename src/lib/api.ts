import type { ApiEnvelope } from "@shared/types/api";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<ApiEnvelope<T>> & { message?: string };
  if (!response.ok) throw new Error(payload.message || "Request failed");
  return payload.data as T;
}

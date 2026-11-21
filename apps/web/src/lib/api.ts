import type { ApiError } from "@team1/shared";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    credentials: "include",
    headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = (data as ApiError | undefined)?.error;
    let message = err?.message ?? res.statusText;
    if (err?.code === "validation_error" && err.details && typeof err.details === "object") {
      const [fieldName, issues] = Object.entries(err.details as Record<string, string[]>)[0] ?? [];
      if (fieldName && issues?.[0]) message = `${fieldName}: ${issues[0]}`;
    }
    throw new ApiRequestError(res.status, err?.code ?? "http_error", message, err?.details);
  }
  return data as T;
}

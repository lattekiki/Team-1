import type { ApiError } from "@team1/shared";
import { translateDynamic } from "./i18n.tsx";

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

// Turns an API error code into a message in the current language, falling back to the server's English text.
export function localizeError(code: string, serverMessage: string | undefined, details: unknown) {
  if (code === "validation_error" && details && typeof details === "object") {
    const [fieldName] = Object.keys(details as Record<string, string[]>);
    if (fieldName) return translateDynamic(`errField_${fieldName}`, translateDynamic("err_validation_error", ""));
  }
  if (code === "not_eligible" && details && typeof details === "object" && "reason" in details) {
    return translateDynamic(`elig_${(details as { reason: string }).reason}`, translateDynamic("err_not_eligible", ""));
  }
  return translateDynamic(`err_${code}`, serverMessage ?? translateDynamic("err_internal", ""));
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      credentials: "include",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiRequestError(0, "network", localizeError("network", undefined, undefined));
  }
  const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = (data as ApiError | undefined)?.error;
    const code = err?.code ?? "internal";
    throw new ApiRequestError(res.status, code, localizeError(code, err?.message, err?.details), err?.details);
  }
  return data as T;
}

/** Multipart upload; do not set Content-Type — the browser adds the boundary. */
export async function apiForm<T>(path: string, form: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { method: "POST", credentials: "include", body: form });
  } catch {
    throw new ApiRequestError(0, "network", localizeError("network", undefined, undefined));
  }
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = (data as ApiError | undefined)?.error;
    const code = err?.code ?? "internal";
    throw new ApiRequestError(res.status, code, localizeError(code, err?.message, err?.details), err?.details);
  }
  return data as T;
}

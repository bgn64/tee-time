"use client";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function golfRequest<T>(path = "", body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/golf${path}`, {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Could not reach the server. Your changes have not been confirmed. Retry when connected.", 0);
  }
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new ApiError("The server response could not be read. The change is unconfirmed; retry to reconcile it safely.", 502); }
  if (!response.ok) {
    const message = value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "The server rejected this request.";
    throw new ApiError(message, response.status);
  }
  return value as T;
}

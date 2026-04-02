import type { Booking, BookingInput, BookingStatus, DashboardPayload, PublicConfig } from "@business-automation/shared";

type JsonOptions = RequestInit & {
  jsonBody?: unknown;
};

async function requestJson<T>(path: string, options: JsonOptions = {}): Promise<T> {
  const { jsonBody, ...requestOptions } = options;
  const response = await fetch(path, {
    ...requestOptions,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(requestOptions.headers ?? {}),
    },
    body: jsonBody === undefined ? requestOptions.body : JSON.stringify(jsonBody),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchPublicConfig() {
  return requestJson<PublicConfig>("/api/public-config");
}

export function createBooking(input: BookingInput) {
  return requestJson<{ booking: Booking }>("/api/bookings", {
    method: "POST",
    jsonBody: input,
  });
}

export function fetchDashboard() {
  return requestJson<DashboardPayload>("/api/bookings");
}

export function login(passcode: string) {
  return requestJson<{ ok: true }>("/api/admin/login", {
    method: "POST",
    jsonBody: { passcode },
  });
}

export function logout() {
  return requestJson<{ ok: true }>("/api/admin/logout", {
    method: "POST",
  });
}

export function updateBookingStatus(id: string, status: BookingStatus) {
  return requestJson<{ booking: Booking }>(`/api/bookings/${id}/status`, {
    method: "PATCH",
    jsonBody: { status },
  });
}

export function resetDemo() {
  return requestJson<DashboardPayload>("/api/demo/reset", {
    method: "POST",
  });
}

export function runDemo() {
  return requestJson<{ booking: Booking }>("/api/demo/run", {
    method: "POST",
  });
}

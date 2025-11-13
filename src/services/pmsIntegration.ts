export type PMSProvider = "ghl" | "salesforce" | "hubspot";

export interface PatientInfo {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  externalContactId?: string;
}

export interface BookingPayload {
  patient: PatientInfo;
  service: string;
  startTime: string;
  endTime?: string;
  timezone?: string;
  locationId?: string;
  notes?: string;
  price?: number;
  currency?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdatePayload extends Partial<BookingPayload> {
  status?: "pending" | "confirmed" | "rescheduled" | "cancelled" | "completed";
}

export interface CancelPayload {
  reason?: string;
  cancelledBy?: "user" | "assistant" | "system";
  timestamp?: string;
}

export interface PerformanceExportPayload {
  report?: unknown;
  tags?: string[];
  sentAt?: string;
  target?: string;
}

export interface ProviderSummary {
  id: PMSProvider;
  label: string;
  configured: boolean;
  baseUrl: string;
}

export interface IntegrationResponse<T = unknown> {
  status: "success" | "error";
  result?: T;
  message?: string;
  details?: unknown;
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

const ISO_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;

const BASE_URL = "/api/integrations/pms";

function assertIso(label: string, value?: string) {
  if (!value || !ISO_REGEX.test(value)) {
    throw new Error(`${label} must be a valid ISO-8601 datetime string`);
  }
}

function validatePatient(patient: PatientInfo) {
  if (!patient) {
    throw new Error("patient is required");
  }
  if (!patient.firstName && !patient.lastName) {
    throw new Error("patient.firstName or patient.lastName is required");
  }
  if (patient.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patient.email)) {
    throw new Error(`Invalid email: ${patient.email}`);
  }
  if (patient.phone && !/^[0-9+\-\s()]{6,20}$/.test(patient.phone)) {
    throw new Error(`Invalid phone: ${patient.phone}`);
  }
}

async function request<T>(
  path: string,
  method: HttpMethod,
  body?: unknown
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload?.message || `Request failed with status ${response.status}`
    ) as Error & { details?: unknown; status?: number };
    error.details = payload?.details;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export async function listConfiguredProviders() {
  const payload = await request<{ providers: ProviderSummary[] }>(
    `${BASE_URL}/providers`,
    "GET"
  );
  return payload.providers;
}

export async function bookAppointment(
  provider: PMSProvider,
  payload: BookingPayload
) {
  validatePatient(payload.patient);
  assertIso("startTime", payload.startTime);
  if (payload.endTime) {
    assertIso("endTime", payload.endTime);
  }

  return request<IntegrationResponse>(
    `${BASE_URL}/${provider}/book`,
    "POST",
    payload
  );
}

export async function updateAppointment(
  provider: PMSProvider,
  bookingId: string,
  payload: UpdatePayload
) {
  if (!bookingId) {
    throw new Error("bookingId is required");
  }
  if (payload.patient) {
    validatePatient(payload.patient);
  }
  if (payload.startTime) {
    assertIso("startTime", payload.startTime);
  }
  if (payload.endTime) {
    assertIso("endTime", payload.endTime);
  }

  return request<IntegrationResponse>(
    `${BASE_URL}/${provider}/booking/${bookingId}`,
    "PATCH",
    payload
  );
}

export async function cancelAppointment(
  provider: PMSProvider,
  bookingId: string,
  payload?: CancelPayload
) {
  if (!bookingId) {
    throw new Error("bookingId is required");
  }
  if (payload?.timestamp) {
    assertIso("timestamp", payload.timestamp);
  }
  return request<IntegrationResponse>(
    `${BASE_URL}/${provider}/booking/${bookingId}`,
    "DELETE",
    payload
  );
}

export async function pushPerformanceReport(
  provider: PMSProvider,
  payload: PerformanceExportPayload = {}
) {
  return request<IntegrationResponse>(
    `${BASE_URL}/${provider}/performance`,
    "POST",
    payload
  );
}


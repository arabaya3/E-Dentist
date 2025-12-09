type ProviderId = "ghl" | "salesforce" | "hubspot";

export type PMSProvider = ProviderId;

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "rescheduled"
  | "cancelled"
  | "completed";

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
  serviceType?: string;
  startTime: string;
  appointmentTime?: string;
  endTime?: string;
  timezone?: string;
  locationId?: string;
  clinicBranch?: string;
  doctorName?: string;
  notes?: string;
  price?: number;
  currency?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdatePayload extends Partial<BookingPayload> {
  status?: BookingStatus;
}

export interface CancelPayload {
  reason?: string;
  cancelledBy?: "user" | "assistant" | "system";
  timestamp?: string;
  clinicBranch?: string;
  doctorName?: string;
  serviceType?: string;
}

export interface PerformanceReportPayload {
  report: unknown;
  tags?: string[];
  sentAt?: string;
  target?: string;
}

interface ProviderConfig {
  id: ProviderId;
  label: string;
  baseUrl: string;
  apiKey?: string;
  authStrategy: "bearer" | "api-key";
  apiKeyHeader?: string;
  timeoutMs: number;
  defaults?: Record<string, unknown>;
}

interface ProviderMap {
  [key: string]: ProviderConfig;
}

interface IntegrationResult<T = unknown> {
  provider: ProviderId;
  status: number;
  externalId?: string;
  payload: T;
  correlationId?: string | null;
}

class IntegrationError extends Error {
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, status: number = 500, details?: unknown) {
    super(message);
    this.name = "IntegrationError";
    this.status = status;
    this.details = details;
  }
}

const ISO_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;

const DEFAULT_TIMEOUT = 15000;

const PROVIDER_LABELS: Record<ProviderId, string> = {
  ghl: "GoHighLevel",
  salesforce: "Salesforce",
  hubspot: "HubSpot",
};

const PROVIDER_ROUTES = {
  ghl: {
    booking: {
      create: "/appointments",
      update: (id: string) => `/appointments/${id}`,
      cancel: (id: string) => `/appointments/${id}/cancel`,
    },
    performance: "/integrations/performance",
  },
  salesforce: {
    booking: {
      create: "/services/data/v58.0/sobjects/Event",
      update: (id: string) => `/services/data/v58.0/sobjects/Event/${id}`,
      cancel: (id: string) =>
        `/services/data/v58.0/sobjects/Event/${id}?status=Canceled`,
    },
    performance:
      "/services/data/v58.0/composite/sobjects/EDentist_Performance__c",
  },
  hubspot: {
    booking: {
      create: "/crm/v3/objects/meetings",
      update: (id: string) => `/crm/v3/objects/meetings/${id}`,
      cancel: (id: string) => `/crm/v3/objects/meetings/${id}`,
    },
    performance: "/crm/v3/objects/ed_performance_metrics",
  },
} as const;

function readEnv(key: string, fallback = "") {
  const value = process.env[key];
  if (value && value.trim().length) {
    return value.trim();
  }
  return fallback;
}

const CLINIC_API_BASE_URL = readEnv("CLINIC_API_BASE_URL");
const CLINIC_API_KEY = readEnv("CLINIC_API_KEY");

function buildProviderConfig(): ProviderMap {
  const configs: ProviderMap = {};

  const ghlBase = readEnv(
    "PMS_GHL_BASE_URL",
    "https://rest.gohighlevel.com/v1"
  );
  configs.ghl = {
    id: "ghl",
    label: PROVIDER_LABELS.ghl,
    baseUrl: ghlBase,
    apiKey: readEnv("PMS_GHL_API_KEY"),
    authStrategy: "bearer",
    timeoutMs: Number(readEnv("PMS_GHL_TIMEOUT_MS", `${DEFAULT_TIMEOUT}`)),
    defaults: {
      locationId: readEnv("PMS_GHL_LOCATION_ID"),
      calendarId: readEnv("PMS_GHL_CALENDAR_ID"),
    },
  };

  const salesforceBase = readEnv(
    "PMS_SALESFORCE_BASE_URL",
    "https://your-instance.salesforce.com"
  );
  configs.salesforce = {
    id: "salesforce",
    label: PROVIDER_LABELS.salesforce,
    baseUrl: salesforceBase,
    apiKey: readEnv("PMS_SALESFORCE_TOKEN"),
    authStrategy: "bearer",
    timeoutMs: Number(
      readEnv("PMS_SALESFORCE_TIMEOUT_MS", `${DEFAULT_TIMEOUT}`)
    ),
    defaults: {
      recordTypeId: readEnv("PMS_SALESFORCE_EVENT_RECORD_TYPE"),
      ownerId: readEnv("PMS_SALESFORCE_OWNER_ID"),
    },
  };

  const hubspotBase = readEnv(
    "PMS_HUBSPOT_BASE_URL",
    "https://api.hubapi.com"
  );
  configs.hubspot = {
    id: "hubspot",
    label: PROVIDER_LABELS.hubspot,
    baseUrl: hubspotBase,
    apiKey: readEnv("PMS_HUBSPOT_PRIVATE_APP_TOKEN"),
    authStrategy: "bearer",
    timeoutMs: Number(readEnv("PMS_HUBSPOT_TIMEOUT_MS", `${DEFAULT_TIMEOUT}`)),
    defaults: {
      pipeline: readEnv("PMS_HUBSPOT_PIPELINE_ID"),
      stage: readEnv("PMS_HUBSPOT_STAGE_ID"),
    },
  };

  return configs;
}

function ensureIsoString(value: string | undefined, label: string) {
  if (!value) {
    throw new IntegrationError(`${label} is required`, 400);
  }
  if (!ISO_REGEX.test(value)) {
    throw new IntegrationError(
      `${label} must be an ISO-8601 string (received "${value}")`,
      400
    );
  }
}

function assertClinicWorkingHours(isoTimestamp: string) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw new IntegrationError(
      `startTime "${isoTimestamp}" could not be parsed`,
      400
    );
  }
  const day = date.getDay();
  if (day === 5 || day === 6) {
    throw new IntegrationError(
      "Clinic is closed on Fridays and Saturdays. Please choose a day Sunday–Thursday.",
      409
    );
  }
  const hour = date.getHours();
  if (hour < 9 || hour >= 21) {
    throw new IntegrationError(
      "Requested appointment is outside working hours (9 AM – 9 PM).",
      409
    );
  }
}

function extractTimeFromIso(isoTimestamp: string) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function mergeHeaders(
  base: Record<string, string>,
  overrides?: Record<string, string | undefined>
) {
  if (!overrides) {
    return base;
  }
  return Object.entries(overrides).reduce((acc, [key, value]) => {
    if (value) {
      acc[key] = value;
    }
    return acc;
  }, { ...base });
}

function asJson<T>(value: T | null | undefined) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return JSON.stringify(value);
}

function guessExternalId(
  provider: ProviderId,
  payload: unknown,
  fallback?: string
) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.id === "string") {
    return record.id;
  }
  if (typeof (record as { Id?: unknown }).Id === "string") {
    return (record as { Id: string }).Id;
  }
  if (provider === "hubspot") {
    const properties = (record as {
      properties?: Record<string, unknown>;
    }).properties;
    const hubspotId = properties?.hs_object_id;
    if (typeof hubspotId === "string") {
      return hubspotId;
    }
  }
  const data = (record as { data?: Record<string, unknown> }).data;
  if (data && typeof data.id === "string") {
    return data.id as string;
  }
  return fallback;
}

export class PMSIntegration {
  private providers: ProviderMap;

  constructor() {
    this.providers = buildProviderConfig();
  }

  reload() {
    this.providers = buildProviderConfig();
  }

  listProviders() {
    return Object.values(this.providers).map((provider) => ({
      id: provider.id,
      label: provider.label,
      baseUrl: provider.baseUrl,
      configured: Boolean(provider.apiKey),
    }));
  }

  private resolveProvider(providerId: string): ProviderConfig {
    const normalized = providerId.toLowerCase();
    const provider = this.providers[normalized];
    if (!provider) {
      throw new IntegrationError(
        `Provider "${providerId}" is not supported`,
        404
      );
    }
    if (!provider.apiKey) {
      throw new IntegrationError(
        `Provider "${provider.label}" is not configured. Check API credentials.`,
        501
      );
    }
    return provider;
  }

  private buildUrl(config: ProviderConfig, path: string) {
    const normalizedBase = config.baseUrl.replace(/\/+$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  }

  private buildHeaders(
    config: ProviderConfig,
    overrides?: Record<string, string>
  ) {
    const baseHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (config.authStrategy === "bearer" && config.apiKey) {
      baseHeaders.Authorization = `Bearer ${config.apiKey}`;
    }
    if (config.authStrategy === "api-key" && config.apiKey) {
      const headerName = config.apiKeyHeader ?? "X-API-Key";
      baseHeaders[headerName] = config.apiKey;
    }
    return mergeHeaders(baseHeaders, overrides);
  }

  private async performRequest<T>(
    providerId: ProviderId,
    config: ProviderConfig,
    path: string,
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<IntegrationResult<T>> {
    const url = this.buildUrl(config, path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: this.buildHeaders(config, headers),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!response.ok) {
        throw new IntegrationError(
          `Provider "${config.label}" responded with ${response.status}`,
          response.status,
          data
        );
      }

      return {
        provider: providerId,
        status: response.status,
        externalId: guessExternalId(providerId, data),
        payload: data as T,
        correlationId: response.headers.get("x-request-id"),
      };
    } catch (error) {
      if (error instanceof IntegrationError) {
        throw error;
      }
      if ((error as Error).name === "AbortError") {
        throw new IntegrationError(
          `Request to provider "${config.label}" timed out after ${config.timeoutMs}ms`,
          504
        );
      }
      throw new IntegrationError(
        `Failed to call provider "${config.label}": ${(error as Error).message}`,
        502
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private validatePatient(patient: PatientInfo) {
    if (!patient || typeof patient !== "object") {
      throw new IntegrationError("patient is required", 400);
    }
    if (!patient.firstName && !patient.lastName) {
      throw new IntegrationError(
        "patient.firstName or patient.lastName must be provided",
        400
      );
    }
    if (patient.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patient.email)) {
      throw new IntegrationError(
        `patient.email "${patient.email}" is not valid`,
        400
      );
    }
    if (patient.phone && !/^[0-9+\-\s()]{6,20}$/.test(patient.phone)) {
      throw new IntegrationError(
        `patient.phone "${patient.phone}" is not valid`,
        400
      );
    }
  }

  private validateBookingPayload(payload: BookingPayload) {
    if (!payload) {
      throw new IntegrationError("booking payload is required", 400);
    }
    this.validatePatient(payload.patient);

    if (payload.serviceType && !payload.service) {
      payload.service = payload.serviceType;
    }
    if (payload.service && !payload.serviceType) {
      payload.serviceType = payload.service;
    }

    if (!payload.service) {
      throw new IntegrationError("service is required", 400);
    }
    if (!payload.serviceType) {
      throw new IntegrationError("serviceType is required", 400);
    }
    if (!payload.doctorName) {
      throw new IntegrationError("doctorName is required", 400);
    }
    if (!payload.clinicBranch) {
      throw new IntegrationError("clinicBranch is required", 400);
    }

    ensureIsoString(payload.startTime, "startTime");
    assertClinicWorkingHours(payload.startTime);
    payload.appointmentTime =
      payload.appointmentTime ?? extractTimeFromIso(payload.startTime);
    if (!payload.appointmentTime) {
      throw new IntegrationError("appointmentTime could not be determined", 400);
    }
    if (payload.endTime) {
      ensureIsoString(payload.endTime, "endTime");
    }
    if (payload.price !== undefined && Number.isNaN(Number(payload.price))) {
      throw new IntegrationError("price must be numeric", 400);
    }
  }

  private validateUpdatePayload(payload: UpdatePayload) {
    if (!payload || Object.keys(payload).length === 0) {
      throw new IntegrationError("update payload must include at least one property", 400);
    }
    if (payload.patient) {
      this.validatePatient(payload.patient);
    }
    if (payload.serviceType && !payload.service) {
      payload.service = payload.serviceType;
    }
    if (payload.service && !payload.serviceType) {
      payload.serviceType = payload.service;
    }
    if (payload.startTime) {
      ensureIsoString(payload.startTime, "startTime");
      assertClinicWorkingHours(payload.startTime);
      payload.appointmentTime =
        payload.appointmentTime ?? extractTimeFromIso(payload.startTime);
    }
    if (payload.endTime) {
      ensureIsoString(payload.endTime, "endTime");
    }
    if (payload.service && !payload.serviceType) {
      payload.serviceType = payload.service;
    }
    if (payload.serviceType && !payload.service) {
      payload.service = payload.serviceType;
    }
  }

  private validateCancelPayload(payload: CancelPayload | undefined) {
    if (!payload) {
      return;
    }
    if (payload.timestamp) {
      ensureIsoString(payload.timestamp, "timestamp");
    }
  }

  private mapBookingPayload(
    provider: ProviderId,
    payload: BookingPayload
  ): Record<string, unknown> {
    const fullName = `${payload.patient.firstName ?? ""} ${
      payload.patient.lastName ?? ""
    }`
      .trim()
      .replace(/\s+/g, " ");
    const serviceType = payload.serviceType ?? payload.service;
    const appointmentTime =
      payload.appointmentTime ?? extractTimeFromIso(payload.startTime);
    const enrichedMetadata = {
      ...(payload.metadata ?? {}),
      clinic_branch: payload.clinicBranch,
      doctor_name: payload.doctorName,
      service_type: serviceType,
      appointment_time: appointmentTime,
    };

    switch (provider) {
      case "ghl":
        return {
          calendar_id:
            payload.metadata?.calendarId ??
            payload.locationId ??
            this.providers.ghl.defaults?.calendarId,
          location_id:
            payload.locationId ??
            (this.providers.ghl.defaults?.locationId as string | undefined),
          contact: {
            id: payload.patient.externalContactId,
            name: fullName,
            email: payload.patient.email,
            phone: payload.patient.phone,
          },
          appointment: {
            service: payload.service,
            startTime: payload.startTime,
            endTime: payload.endTime,
            timezone: payload.timezone,
            notes: payload.notes,
            price: payload.price,
            currency: payload.currency ?? "USD",
            source: payload.source ?? "eDentist.AI",
            doctor_name: payload.doctorName,
            clinic_branch: payload.clinicBranch,
            service_type: serviceType,
            appointment_time: appointmentTime,
            metadata: enrichedMetadata,
          },
        };
      case "salesforce":
        return {
          Subject: `${payload.service} - ${fullName}`.trim(),
          StartDateTime: payload.startTime,
          EndDateTime: payload.endTime ?? payload.startTime,
          Description: payload.notes,
          Location: payload.locationId,
          TimeZoneSidKey: payload.timezone,
          WhoId: payload.patient.externalContactId,
          OwnerId: this.providers.salesforce.defaults?.ownerId,
          RecordTypeId: this.providers.salesforce.defaults?.recordTypeId,
          eDentist_Source__c: payload.source ?? "eDentist.AI",
          Service__c: payload.service,
          Service_Type__c: serviceType,
          Doctor__c: payload.doctorName,
          Clinic_Branch__c: payload.clinicBranch,
          Patient_Email__c: payload.patient.email,
          Patient_Phone__c: payload.patient.phone,
          Metadata__c: asJson(enrichedMetadata),
        };
      case "hubspot":
        return {
          properties: {
            hs_meeting_title: `${payload.service} with ${fullName}`.trim(),
            hs_start_time: payload.startTime,
            hs_end_time: payload.endTime ?? payload.startTime,
            eDentist_source: payload.source ?? "eDentist.AI",
            eDentist_notes: payload.notes,
            hs_timezone: payload.timezone,
            eDentist_service: payload.service,
             eDentist_service_type: serviceType,
             eDentist_doctor: payload.doctorName,
             eDentist_clinic_branch: payload.clinicBranch,
            eDentist_patient_email: payload.patient.email,
            eDentist_patient_phone: payload.patient.phone,
            eDentist_metadata: asJson(enrichedMetadata),
          },
          associations: payload.patient.externalContactId
            ? [
                {
                  to: { id: payload.patient.externalContactId },
                  types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
                },
              ]
            : undefined,
        };
      default:
        return {
          ...payload,
          clinic_branch: payload.clinicBranch,
          doctor_name: payload.doctorName,
          service_type: serviceType,
          appointment_time: appointmentTime,
          metadata: enrichedMetadata,
        };
    }
  }

  private mapUpdatePayload(
    provider: ProviderId,
    payload: UpdatePayload
  ): Record<string, unknown> {
    const serviceType = payload.serviceType ?? payload.service;
    const appointmentTime =
      payload.appointmentTime ??
      (payload.startTime ? extractTimeFromIso(payload.startTime) : undefined);
    const metaRecord = payload.metadata as
      | Record<string, unknown>
      | undefined;
    const metadata = {
      ...(payload.metadata ?? {}),
      clinic_branch:
        payload.clinicBranch ??
        (metaRecord?.["clinic_branch"] as string | undefined),
      doctor_name:
        payload.doctorName ??
        (metaRecord?.["doctor_name"] as string | undefined),
      service_type:
        serviceType ??
        (metaRecord?.["service_type"] as string | undefined),
      appointment_time:
        appointmentTime ??
        (metaRecord?.["appointment_time"] as string | undefined),
    };

    switch (provider) {
      case "ghl":
        return {
          ...(payload.patient
            ? {
                contact: {
                  id: payload.patient.externalContactId,
                  name: `${payload.patient.firstName ?? ""} ${
                    payload.patient.lastName ?? ""
                  }`.trim(),
                  email: payload.patient.email,
                  phone: payload.patient.phone,
                },
              }
            : {}),
          appointment: {
            service: payload.service,
            startTime: payload.startTime,
            endTime: payload.endTime,
            timezone: payload.timezone,
            notes: payload.notes,
            price: payload.price,
            status: payload.status,
            doctor_name: payload.doctorName,
            clinic_branch: payload.clinicBranch,
            service_type: serviceType,
            appointment_time: appointmentTime,
            metadata,
          },
        };
      case "salesforce":
        return {
          ...(payload.patient
            ? {
                WhoId: payload.patient.externalContactId,
                Patient_Email__c: payload.patient.email,
                Patient_Phone__c: payload.patient.phone,
              }
            : {}),
          Service__c: payload.service,
          Service_Type__c: serviceType,
          Doctor__c: payload.doctorName,
          Clinic_Branch__c: payload.clinicBranch,
          StartDateTime: payload.startTime,
          EndDateTime: payload.endTime ?? payload.startTime,
          Description: payload.notes,
          TimeZoneSidKey: payload.timezone,
          eDentist_Status__c: payload.status,
          Metadata__c: asJson(metadata ?? payload.metadata),
        };
      case "hubspot":
        return {
          properties: {
            hs_meeting_title: payload.service,
            hs_start_time: payload.startTime,
            hs_end_time: payload.endTime ?? payload.startTime,
            eDentist_notes: payload.notes,
            eDentist_service: payload.service,
            eDentist_service_type: serviceType,
            eDentist_doctor: payload.doctorName,
            eDentist_clinic_branch: payload.clinicBranch,
            eDentist_status: payload.status,
            eDentist_metadata: asJson(metadata ?? payload.metadata),
          },
        };
      default:
        return {
          ...payload,
          clinic_branch: payload.clinicBranch,
          doctor_name: payload.doctorName,
          service_type: serviceType,
          appointment_time: appointmentTime,
          metadata,
        };
    }
  }

  private mapCancelPayload(
    provider: ProviderId,
    payload: CancelPayload | undefined
  ): Record<string, unknown> | undefined {
    if (!payload) {
      return undefined;
    }
    switch (provider) {
      case "ghl":
        return {
          reason: payload.reason,
          cancelledBy: payload.cancelledBy ?? "assistant",
          cancelledAt: payload.timestamp ?? new Date().toISOString(),
          doctor_name: payload.doctorName,
          clinic_branch: payload.clinicBranch,
          service_type: payload.serviceType,
        };
      case "salesforce":
        return {
          Status: "Canceled",
          eDentist_Cancelled_By__c: payload.cancelledBy ?? "assistant",
          eDentist_Cancelled_Reason__c: payload.reason,
          eDentist_Cancelled_At__c:
            payload.timestamp ?? new Date().toISOString(),
          Doctor__c: payload.doctorName,
          Clinic_Branch__c: payload.clinicBranch,
          Service_Type__c: payload.serviceType,
        };
      case "hubspot":
        return {
          properties: {
            eDentist_status: "cancelled",
            eDentist_cancelled_reason: payload.reason,
            eDentist_cancelled_at:
              payload.timestamp ?? new Date().toISOString(),
            eDentist_doctor: payload.doctorName,
            eDentist_clinic_branch: payload.clinicBranch,
            eDentist_service_type: payload.serviceType,
          },
        };
      default:
        return {
          ...payload,
          clinic_branch: payload.clinicBranch,
          doctor_name: payload.doctorName,
          service_type: payload.serviceType,
        };
    }
  }

  private async ensureDoctorAvailability(
    doctorName: string | undefined,
    isoDateTime: string
  ) {
    if (!doctorName || !doctorName.trim()) {
      return;
    }
    if (!CLINIC_API_BASE_URL) {
      return;
    }
    const trimmedDoctor = doctorName.trim();
    const date = isoDateTime.split("T")[0] ?? isoDateTime;
    const time = extractTimeFromIso(isoDateTime);
    const endpoint = new URL(
      "/api/doctors/availability",
      CLINIC_API_BASE_URL
    );
    endpoint.searchParams.set("doctor", trimmedDoctor);
    endpoint.searchParams.set("date", date);
    if (time) {
      endpoint.searchParams.set("time", time);
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (CLINIC_API_KEY) {
      headers.Authorization = `Bearer ${CLINIC_API_KEY}`;
    }

    try {
      const response = await fetch(endpoint.toString(), {
        method: "GET",
        headers,
      });
      if (!response.ok) {
        const details = await response.text().catch(() => undefined);
        throw new IntegrationError(
          `Failed to verify doctor availability (${response.status}).`,
          response.status,
          details
        );
      }
      const availability = await response.json().catch(() => null);
      const available =
        availability?.available ??
        availability?.isAvailable ??
        availability?.data?.available;
      if (available === false) {
        throw new IntegrationError(
          `الدكتور ${trimmedDoctor} غير متاح في هذا الوقت، هل ترغب باقتراح موعد آخر؟`,
          409,
          availability
        );
      }
    } catch (error) {
      if (error instanceof IntegrationError) {
        throw error;
      }
      throw new IntegrationError(
        `Failed to verify doctor availability: ${(error as Error).message}`,
        502
      );
    }
  }

  async createBooking(providerId: string, data: BookingPayload) {
    const provider = this.resolveProvider(providerId);
    this.validateBookingPayload(data);
    await this.ensureDoctorAvailability(data.doctorName, data.startTime);
    const mapped = this.mapBookingPayload(provider.id, data);
    const result = await this.performRequest(
      provider.id,
      provider,
      PROVIDER_ROUTES[provider.id].booking.create,
      "POST",
      mapped
    );
    return {
      ...result,
      externalId: guessExternalId(provider.id, result.payload),
    };
  }

  async updateBooking(
    providerId: string,
    bookingId: string,
    data: UpdatePayload
  ) {
    if (!bookingId) {
      throw new IntegrationError("bookingId is required", 400);
    }
    const provider = this.resolveProvider(providerId);
    this.validateUpdatePayload(data);
    if (data.startTime) {
      await this.ensureDoctorAvailability(data.doctorName, data.startTime);
    }
    const mapped = this.mapUpdatePayload(provider.id, data);
    const pathResolver = PROVIDER_ROUTES[provider.id].booking.update;
    const path =
      typeof pathResolver === "function"
        ? pathResolver(bookingId)
        : `${pathResolver}/${bookingId}`;
    const result = await this.performRequest(
      provider.id,
      provider,
      path,
      provider.id === "hubspot" ? "PATCH" : "PATCH",
      mapped
    );
    return {
      ...result,
      externalId: bookingId ?? guessExternalId(provider.id, result.payload),
    };
  }

  async cancelBooking(
    providerId: string,
    bookingId: string,
    data?: CancelPayload
  ) {
    if (!bookingId) {
      throw new IntegrationError("bookingId is required", 400);
    }
    const provider = this.resolveProvider(providerId);
    this.validateCancelPayload(data);
    const mapped = this.mapCancelPayload(provider.id, data);
    const pathResolver = PROVIDER_ROUTES[provider.id].booking.cancel;
    const path =
      typeof pathResolver === "function"
        ? pathResolver(bookingId)
        : `${pathResolver}/${bookingId}`;

    const method =
      provider.id === "ghl"
        ? "POST"
        : provider.id === "hubspot"
        ? "PATCH"
        : "PATCH";

    const result = await this.performRequest(
      provider.id,
      provider,
      path,
      method,
      mapped
    );
    return {
      ...result,
      externalId: bookingId ?? guessExternalId(provider.id, result.payload),
    };
  }

  async pushPerformanceReport(
    providerId: string,
    payload: PerformanceReportPayload
  ) {
    if (!payload || !payload.report) {
      throw new IntegrationError(
        "performance report payload with 'report' field is required",
        400
      );
    }
    const provider = this.resolveProvider(providerId);
    const path = PROVIDER_ROUTES[provider.id].performance;
    const body =
      provider.id === "hubspot"
        ? {
            properties: {
              eDentist_payload: asJson(payload.report),
              eDentist_tags: (payload.tags ?? []).join(","),
              eDentist_sent_at:
                payload.sentAt ?? new Date().toISOString(),
              eDentist_target: payload.target,
            },
          }
        : provider.id === "salesforce"
        ? {
            Records: [
              {
                attributes: { type: "EDentist_Performance__c" },
                Payload__c: asJson(payload.report),
                Tags__c: (payload.tags ?? []).join(";"),
                Target__c: payload.target,
                Sent_At__c: payload.sentAt ?? new Date().toISOString(),
              },
            ],
          }
        : {
            report: payload.report,
            tags: payload.tags,
            sent_at: payload.sentAt ?? new Date().toISOString(),
            target: payload.target,
          };

    return this.performRequest(
      provider.id,
      provider,
      path,
      "POST",
      body
    );
  }
}

export const pmsIntegration = new PMSIntegration();
export { IntegrationError };


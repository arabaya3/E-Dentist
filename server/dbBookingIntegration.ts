import { Prisma } from "@prisma/client";
import { db } from "./db";

type Locale = "ar" | "en";

export type CreateBookingArgs = {
  doctor_name: string;
  clinic_branch: string;
  patient_name: string;
  patient_phone: string;
  service_type: string;
  appointment_date: string;
  appointment_time: string;
};

export type UpdateBookingArgs = Partial<CreateBookingArgs> & {
  status?: string;
};

export type BookingResult = {
  success: boolean;
  message: string;
  booking?: unknown;
  reason?: string;
};

type PractitionerRecord = {
  agentId: string;
  agentName: string;
  clinicName: string | null;
};

export type AgentProfile = {
  id: number;
  agentId: string;
  agentName: string;
  clinicId: number | null;
  clinicName: string | null;
  welcomeMessage: string | null;
  initialGreetingMessage: string | null;
  color: string | null;
  image: string | null;
  agentAvatar: string | null;
  provider: string;
  gender: string;
  requiredInfo: Prisma.JsonValue | null;
  updatedAt: Date;
};

function buildRawDetails(
  data: CreateBookingArgs,
  overrides?: Partial<Record<string, unknown>>
) {
  return {
    doctorName: data.doctor_name,
    clinicBranch: data.clinic_branch,
    patientName: data.patient_name,
    patientPhone: data.patient_phone,
    serviceType: data.service_type,
    appointmentDate: data.appointment_date,
    appointmentTime: data.appointment_time,
    status: "confirmed",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function resolvePractitioner(
  doctorName: string,
  clinicBranch: string
): Promise<PractitionerRecord | null> {
  const practitioner = await db.agentPageConfig.findFirst({
    where: {
      agentName: { equals: doctorName, mode: "insensitive" },
    },
    include: { clinic: true },
  });

  if (practitioner) {
    const clinicName = practitioner.clinic?.name ?? clinicBranch;
    if (
      clinicBranch &&
      clinicName &&
      clinicName.toLowerCase() !== clinicBranch.toLowerCase()
    ) {
      return null;
    }
    return {
      agentId: practitioner.agentId,
      agentName: practitioner.agentName || practitioner.agentId,
      clinicName,
    };
  }

  // fallback: try locating a clinic admin user with matching name
  const user = await db.user.findFirst({
    where: {
      name: { equals: doctorName, mode: "insensitive" },
      clinic: {
        name: { equals: clinicBranch, mode: "insensitive" },
      },
    },
    include: { clinic: true },
  });
  if (user) {
    return {
      agentId: user.id.toString(),
      agentName: user.name ?? doctorName,
      clinicName: user.clinic?.name ?? clinicBranch,
    };
  }

  return null;
}

export async function createBookingViaDB(
  data: CreateBookingArgs
): Promise<BookingResult> {
  const practitioner = await resolvePractitioner(
    data.doctor_name,
    data.clinic_branch
  );

  if (!practitioner) {
    return {
      success: false,
      message: `لم نتمكن من العثور على مقدم الخدمة "${data.doctor_name}" في فرع ${data.clinic_branch}.`,
      reason: "PRACTITIONER_NOT_FOUND",
    };
  }

  const booking = await db.appointment.create({
    data: {
      appointment_raw_details: buildRawDetails(data, {
        practitionerId: practitioner.agentId,
        practitionerName: practitioner.agentName,
      }),
    },
  });

  return {
    success: true,
    message: `تم تسجيل موعدك مع ${practitioner.agentName} يوم ${data.appointment_date} الساعة ${data.appointment_time}.`,
    booking,
  };
}

export async function updateBookingViaDB(
  id: number,
  updates: UpdateBookingArgs
): Promise<BookingResult> {
  const existing = await db.appointment.findUnique({
    where: { id },
  });

  if (!existing) {
    return {
      success: false,
      message: "لم يتم العثور على هذا الموعد.",
      reason: "BOOKING_NOT_FOUND",
    };
  }

  const currentDetails =
    (existing.appointment_raw_details as Prisma.JsonObject) ?? {};

  const mergedDetails = {
    ...currentDetails,
    doctorName: updates.doctor_name ?? currentDetails["doctorName"],
    clinicBranch: updates.clinic_branch ?? currentDetails["clinicBranch"],
    patientName: updates.patient_name ?? currentDetails["patientName"],
    patientPhone: updates.patient_phone ?? currentDetails["patientPhone"],
    serviceType: updates.service_type ?? currentDetails["serviceType"],
    appointmentDate:
      updates.appointment_date ?? currentDetails["appointmentDate"],
    appointmentTime:
      updates.appointment_time ?? currentDetails["appointmentTime"],
    status: updates.status ?? currentDetails["status"] ?? "confirmed",
    updatedAt: new Date().toISOString(),
  };

  const booking = await db.appointment.update({
    where: { id },
    data: {
      appointment_raw_details: mergedDetails,
    },
  });

  return {
    success: true,
    message: `تم تحديث تفاصيل الموعد بنجاح.`,
    booking,
  };
}

export async function cancelBookingViaDB(
  id: number
): Promise<BookingResult> {
  const existing = await db.appointment.findUnique({
    where: { id },
  });

  if (!existing) {
    return {
      success: false,
      message: "لم يتم العثور على هذا الموعد.",
      reason: "BOOKING_NOT_FOUND",
    };
  }

  const currentDetails =
    (existing.appointment_raw_details as Prisma.JsonObject) ?? {};

  const booking = await db.appointment.update({
    where: { id },
    data: {
      appointment_raw_details: {
        ...currentDetails,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      },
    },
  });

  return {
    success: true,
    message: "تم إلغاء الموعد بنجاح.",
    booking,
  };
}

export async function getAvailableDoctors(): Promise<string[]> {
  const configs = await db.agentPageConfig.findMany({
    include: { clinic: true },
  });

  if (configs.length > 0) {
    return configs.map((config) => {
      const name = config.agentName || config.agentId;
      const clinic = config.clinic?.name;
      return clinic ? `${name} (${clinic})` : name;
    });
  }

  const clinicUsers = await db.user.findMany({
    where: { clinicId: { not: null } },
    take: 5,
  });

  if (clinicUsers.length > 0) {
    return clinicUsers.map((user) => user.name ?? "أخصائي العيادة");
  }

  return [];
}

function sanitizeTemplate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function fetchClinicContent(
  slug: string,
  locale: Locale
): Promise<string | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  const normalizedLocale: Locale = locale === "ar" ? "ar" : "en";
  const fallbackLocale: Locale = normalizedLocale === "ar" ? "en" : "ar";

  for (const currentLocale of [normalizedLocale, fallbackLocale]) {
    try {
      const template = await db.clinicContent.findFirst({
        where: {
          slug: normalizedSlug,
          locale: currentLocale,
        },
        orderBy: { updatedAt: "desc" },
      });
      const content = sanitizeTemplate(template?.content);
      if (content) {
        return content;
      }
    } catch (error) {
      console.warn(
        `Failed to fetch clinic content for ${normalizedSlug}/${currentLocale}:`,
        error
      );
      break;
    }
  }

  if (
    normalizedSlug === "initial.greeting" ||
    normalizedSlug === "agent.initial_greeting" ||
    normalizedSlug === "agent.welcome"
  ) {
    try {
      const agent = await db.agentPageConfig.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: "desc" },
      });
      if (!agent) {
        return null;
      }

      const welcome = sanitizeTemplate(agent.welcomeMessage);
      const initialGreeting = sanitizeTemplate(agent.initialGreetingMessage);
      if (normalizedSlug === "agent.welcome") {
        return welcome ?? initialGreeting;
      }
      return normalizedLocale === "ar"
        ? welcome ?? initialGreeting
        : initialGreeting ?? welcome;
    } catch (error) {
      console.warn("Failed to fetch fallback agent greeting:", error);
    }
  }

  return null;
}

export async function getActiveAgentProfile(): Promise<AgentProfile | null> {
  const config = await db.agentPageConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    include: { clinic: true },
  });

  if (!config) {
    return null;
  }

  return {
    id: config.id,
    agentId: config.agentId,
    agentName: config.agentName || config.agentId,
    clinicId: config.clinicId ?? null,
    clinicName: config.clinic?.name ?? null,
    welcomeMessage: sanitizeTemplate(config.welcomeMessage),
    initialGreetingMessage: sanitizeTemplate(config.initialGreetingMessage),
    color: config.color || null,
    image: config.image || null,
    agentAvatar: config.agentAvatar || null,
    provider: config.provider,
    gender: config.gender,
    requiredInfo: (config.requiredInfo as Prisma.JsonValue) ?? null,
    updatedAt: config.updatedAt,
  };
}

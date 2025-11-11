import { db } from "./db";

type Locale = "ar" | "en";

type DoctorRecord = {
  id: number;
  name: string;
  branch: string;
  work_start: Date;
  work_end: Date;
  available_days: string[];
};

type ValidationError = {
  message: string;
  reason: string;
};

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

const ACTIVE_APPOINTMENT_STATUSES = ["confirmed", "pending"];

function toDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function getWeekday(date: Date) {
  return date.toLocaleString("en-US", { weekday: "long" });
}

function toTimeString(date: Date) {
  return date.toISOString().substring(11, 16);
}

async function resolveDoctor(name: string, branch: string) {
  return db.doctors.findFirst({
    where: { name, branch },
  }) as Promise<DoctorRecord | null>;
}

function validateDoctorDayAvailability(
  doctor: DoctorRecord,
  appointmentDate: Date
): ValidationError | null {
  const weekday = getWeekday(appointmentDate);
  if (!doctor.available_days.includes(weekday)) {
    return {
      message: `الدكتور ${doctor.name} غير متاح يوم ${weekday}.`,
      reason: "DOCTOR_NOT_AVAILABLE_DAY",
    };
  }
  return null;
}

function validateDoctorHours(
  doctor: DoctorRecord,
  dateISO: string,
  appointmentDate: Date
): ValidationError | null {
  const workStart = new Date(`${dateISO}T${toTimeString(doctor.work_start)}:00`);
  const workEnd = new Date(`${dateISO}T${toTimeString(doctor.work_end)}:00`);
  if (appointmentDate < workStart || appointmentDate >= workEnd) {
    return {
      message: `الطبيب ${doctor.name} يستقبل المرضى بين ${toTimeString(
        doctor.work_start
      )} و ${toTimeString(doctor.work_end)}.`,
      reason: "OUTSIDE_WORKING_HOURS",
    };
  }
  return null;
}

async function ensureDoctorSlotFree(
  doctorId: number,
  appointmentDate: Date,
  ignoreAppointmentId?: number
): Promise<ValidationError | null> {
  const existing = await db.appointments.findFirst({
    where: {
      doctor_id: doctorId,
      appointment_date: appointmentDate,
      appointment_time: appointmentDate,
      status: { in: ACTIVE_APPOINTMENT_STATUSES },
      ...(ignoreAppointmentId
        ? { NOT: { id: ignoreAppointmentId } }
        : undefined),
    },
  });
  if (existing) {
    return {
      message: `الطبيب غير متاح في ${toTimeString(appointmentDate)}. هل ترغب باقتراح وقت آخر؟`,
      reason: "ALREADY_BOOKED",
    };
  }
  return null;
}

export async function createBookingViaDB(
  data: CreateBookingArgs
): Promise<BookingResult> {
  const doctor = await resolveDoctor(data.doctor_name, data.clinic_branch);

  if (!doctor) {
    return {
      success: false,
      message: `لم يتم العثور على الدكتور ${data.doctor_name} في فرع ${data.clinic_branch}.`,
      reason: "DOCTOR_NOT_FOUND",
    };
  }

  const appointmentDateTime = toDateTime(
    data.appointment_date,
    data.appointment_time
  );

  const dayError = validateDoctorDayAvailability(doctor, appointmentDateTime);
  if (dayError) {
    return { success: false, ...dayError };
  }

  const hoursError = validateDoctorHours(
    doctor,
    data.appointment_date,
    appointmentDateTime
  );
  if (hoursError) {
    return { success: false, ...hoursError };
  }

  const slotError = await ensureDoctorSlotFree(
    doctor.id,
    appointmentDateTime
  );
  if (slotError) {
    return { success: false, ...slotError };
  }

  const booking = await db.appointments.create({
    data: {
      doctor_id: doctor.id,
      patient_name: data.patient_name,
      patient_phone: data.patient_phone,
      service_type: data.service_type,
      appointment_date: appointmentDateTime,
      appointment_time: appointmentDateTime,
    },
  });

  return {
    success: true,
    message: `تم حجز الموعد مع الدكتور ${doctor.name} يوم ${data.appointment_date} الساعة ${data.appointment_time}.`,
    booking,
  };
}

export async function updateBookingViaDB(
  id: number,
  updates: UpdateBookingArgs
): Promise<BookingResult> {
  const existing = await db.appointments.findUnique({
    where: { id },
    include: { doctor: true },
  });

  if (!existing) {
    return {
      success: false,
      message: "لم يتم العثور على هذا الموعد.",
      reason: "BOOKING_NOT_FOUND",
    };
  }

  let doctor = existing.doctor as DoctorRecord;
  if (updates.doctor_name || updates.clinic_branch) {
    if (!(updates.doctor_name && updates.clinic_branch)) {
      return {
        success: false,
        message: "لتغيير الطبيب يجب تحديد الاسم والفرع معاً.",
        reason: "DOCTOR_DATA_INCOMPLETE",
      };
    }
    const resolved = await resolveDoctor(
      updates.doctor_name,
      updates.clinic_branch
    );
    if (!resolved) {
      return {
        success: false,
        message: `لم يتم العثور على الدكتور ${updates.doctor_name} في فرع ${updates.clinic_branch}.`,
        reason: "DOCTOR_NOT_FOUND",
      };
    }
    doctor = resolved;
  }

  const dateISO =
    updates.appointment_date ??
    existing.appointment_date.toISOString().substring(0, 10);
  const time =
    updates.appointment_time ??
    existing.appointment_time.toISOString().substring(11, 16);

  const appointmentDateTime = toDateTime(dateISO, time);

  const dayError = validateDoctorDayAvailability(doctor, appointmentDateTime);
  if (dayError) {
    return { success: false, ...dayError };
  }

  const hoursError = validateDoctorHours(doctor, dateISO, appointmentDateTime);
  if (hoursError) {
    return { success: false, ...hoursError };
  }

  const slotError = await ensureDoctorSlotFree(
    doctor.id,
    appointmentDateTime,
    existing.id
  );
  if (slotError) {
    return { success: false, ...slotError };
  }

  const payload: Record<string, any> = {
    patient_name: updates.patient_name ?? existing.patient_name,
    patient_phone: updates.patient_phone ?? existing.patient_phone,
    service_type: updates.service_type ?? existing.service_type,
    appointment_date: appointmentDateTime,
    appointment_time: appointmentDateTime,
    status: updates.status ?? existing.status,
    doctor_id: doctor.id,
  };

  const booking = await db.appointments.update({
    where: { id },
    data: payload,
  });

  return {
    success: true,
    message: `تم تحديث موعدك ليكون يوم ${dateISO} الساعة ${time}.`,
    booking,
  };
}

export async function cancelBookingViaDB(
  id: number
): Promise<BookingResult> {
  try {
    const booking = await db.appointments.update({
      where: { id },
      data: { status: "cancelled" },
    });
    return {
      success: true,
      message: "تم إلغاء الموعد بنجاح.",
      booking,
    };
  } catch (error) {
    return {
      success: false,
      message: "تعذر إلغاء الموعد. يرجى المحاولة لاحقاً.",
      reason: "CANCEL_FAILED",
    };
  }
}

export async function getAvailableDoctors(date: string, branch: string) {
  const targetDate = new Date(date);
  const weekday = getWeekday(targetDate);
  return db.doctors.findMany({
    where: {
      branch,
      available_days: {
        has: weekday,
      },
    },
  });
}

export async function fetchClinicContent(
  slug: string,
  locale: Locale
): Promise<string | null> {
  const baseQuery = {
    orderBy: { updated_at: "desc" as const },
  };

  const primary = await db.clinic_content.findFirst({
    where: { slug, locale },
    ...baseQuery,
  });
  if (primary?.content) {
    return primary.content;
  }
  if (locale !== "en") {
    const fallback = await db.clinic_content.findFirst({
      where: { slug, locale: "en" },
      ...baseQuery,
    });
    if (fallback?.content) {
      return fallback.content;
    }
  }
  return null;
}


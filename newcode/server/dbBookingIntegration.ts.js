// =========================================================
// Imports
// =========================================================
const { Prisma } = require("@prisma/client");
const { db } = require("./db");

// =========================================================
// resolvePractitioner – البحث عن الدكتور
// =========================================================
async function resolvePractitioner(doctorName, clinicBranch) {
  const doctor = await db.user.findFirst({
    where: {
      name: doctorName,
      clinic: {
        is: {
          name: clinicBranch,
        },
      },
    },
    include: { clinic: true },
  });

  if (!doctor) return null;

  return {
    agentId: doctor.id.toString(),
    agentName: doctor.name || doctorName,
    clinicName: doctor.clinic?.name || null,
  };
}

// =========================================================
// Raw Details Builder
// =========================================================
function buildRawDetails(data, overrides) {
  return {
    doctorName: data.doctor_name,
    clinicBranch: data.clinic_branch,
    patientName: data.patient_name,
    patientPhone: data.patient_phone,
    serviceType: data.service_type,
    appointmentDate: data.appointment_date,
    appointmentTime: data.appointment_time,
    otp: data.otp || null,
    status: "confirmed",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// =========================================================
// createBookingViaDB
// =========================================================
async function createBookingViaDB(data) {
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

// =========================================================
// updateBookingViaDB
// =========================================================
async function updateBookingViaDB(id, updates) {
  const existing = await db.appointment.findUnique({ where: { id } });

  if (!existing) {
    return {
      success: false,
      message: "لم يتم العثور على هذا الموعد.",
      reason: "BOOKING_NOT_FOUND",
    };
  }

  const currentDetails = existing.appointment_raw_details || {};

  const mergedDetails = {
    ...currentDetails,
    doctorName: updates.doctor_name || currentDetails["doctorName"],
    clinicBranch: updates.clinic_branch || currentDetails["clinicBranch"],
    patientName: updates.patient_name || currentDetails["patientName"],
    patientPhone: updates.patient_phone || currentDetails["patientPhone"],
    serviceType: updates.service_type || currentDetails["serviceType"],
    appointmentDate: updates.appointment_date || currentDetails["appointmentDate"],
    appointmentTime: updates.appointment_time || currentDetails["appointmentTime"],
    status: updates.status || currentDetails["status"] || "confirmed",
    updatedAt: new Date().toISOString(),
  };

  const booking = await db.appointment.update({
    where: { id },
    data: { appointment_raw_details: mergedDetails },
  });

  return {
    success: true,
    message: "تم تحديث تفاصيل الموعد بنجاح.",
    booking,
  };
}
// =========================================================
// getActiveAgentProfile – يعيد بيانات الإيجنت الأساسي
// =========================================================
async function getActiveAgentProfile() {
  const agent = await db.agentPageConfig.findFirst({
    where: { isActive: true },
  });

  if (!agent) return null;

  return {
    name: agent.agentName || "Default Agent",
    language: "ar",
    version: "1.0.0",
    welcomeMessage: agent.welcomeMessage,
    initialGreetingMessage: agent.initialGreetingMessage,
    color: agent.color,
    avatar: agent.agentAvatar,
    provider: agent.provider
  };
}


// =========================================================
// cancelBookingViaDB
// =========================================================
async function cancelBookingViaDB(id, data) {
  const existing = await db.appointment.findUnique({ where: { id } });

  if (!existing) {
    return {
      success: false,
      message: "لم يتم العثور على هذا الموعد.",
      reason: "BOOKING_NOT_FOUND",
    };
  }

  const currentDetails = existing.appointment_raw_details || {};

  if (data?.patient_name && data.patient_name !== currentDetails.patientName) {
    return {
      success: false,
      message: "الاسم غير مطابق.",
      reason: "NAME_MISMATCH",
    };
  }

  if (data?.patient_phone && data.patient_phone !== currentDetails.patientPhone) {
    return {
      success: false,
      message: "رقم الهاتف غير مطابق.",
      reason: "PHONE_MISMATCH",
    };
  }

  if (data?.otp && data.otp !== currentDetails.otp) {
    return {
      success: false,
      message: "رمز التحقق OTP غير صحيح.",
      reason: "OTP_MISMATCH",
    };
  }

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

// =========================================================
// getAvailableDoctors
// =========================================================
async function getAvailableDoctors() {
  const clinicUsers = await db.user.findMany({
    where: { clinicId: { not: null } },
  });

  return clinicUsers.map((u) => u.name || "أخصائي العيادة");
}

// =========================================================
// Exports
// =========================================================
module.exports = {
  createBookingViaDB,
  updateBookingViaDB,
  cancelBookingViaDB,
  getAvailableDoctors,
  getActiveAgentProfile,   // ← أضفها هنا
};


import {
  GoogleGenAI,
  Content,
  ToolConfig,
  FunctionDeclaration,
  Schema,
  Type,
} from "@google/genai";
import {
  LIVE_CLIENT_OPTIONS,
  GEMINI_TEXT_MODEL,
  GEMINI_REQUESTED_MODEL,
} from "../config";
import {
  PMSProvider,
  BookingPayload,
  bookAppointment,
  UpdatePayload,
  updateAppointment,
  cancelAppointment,
  CancelPayload,
} from "./pmsIntegration";
import {
  createBookingViaDB,
  updateBookingViaDB,
  cancelBookingViaDB,
  getAvailableDoctors,
  fetchClinicContent,
} from "../../server/dbBookingIntegration";
import {
  detectPreferredLanguage,
  joinByLanguage,
} from "../utils/language";

export type Intent =
  | "BOOK_APPOINTMENT"
  | "CANCEL_APPOINTMENT"
  | "RESCHEDULE_APPOINTMENT"
  | "INQUIRY"
  | "UNKNOWN"
  | "FOLLOW_UP"
  | "ORTHODONTICS_INQUIRY"
  | "REMINDER_CALL";

export type EntityMap = {
  customerName?: string;
  phoneNumber?: string;
  email?: string;
  service?: string;
  service_type?: string;
  appointmentDate?: string;
  appointment_time?: string;
  notes?: string;
  bookingId?: string;
  provider?: PMSProvider;
  doctor_name?: string;
  clinic_branch?: string;
};

export type ConversationTurn = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  intent?: Intent;
  entities?: EntityMap;
  timestamp: number;
};

export type ConversationState = {
  sessionId: string;
  turns: ConversationTurn[];
  currentIntent: Intent;
  entities: EntityMap;
};

const KNOWN_INTENTS: Intent[] = [
  "BOOK_APPOINTMENT",
  "CANCEL_APPOINTMENT",
  "RESCHEDULE_APPOINTMENT",
  "INQUIRY",
  "UNKNOWN",
  "FOLLOW_UP",
  "ORTHODONTICS_INQUIRY",
  "REMINDER_CALL",
];

const INTENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      description:
        "Detected intent (BOOK_APPOINTMENT, CANCEL_APPOINTMENT, RESCHEDULE_APPOINTMENT, INQUIRY, UNKNOWN, FOLLOW_UP, ORTHODONTICS_INQUIRY, REMINDER_CALL)",
    },
    entities: {
      type: Type.OBJECT,
      properties: {
        customerName: { type: Type.STRING },
        phoneNumber: { type: Type.STRING },
        email: { type: Type.STRING },
        service: { type: Type.STRING },
        service_type: { type: Type.STRING },
        appointmentDate: { type: Type.STRING },
        appointment_time: { type: Type.STRING },
        notes: { type: Type.STRING },
        bookingId: { type: Type.STRING },
        provider: { type: Type.STRING },
        doctor_name: { type: Type.STRING },
        clinic_branch: { type: Type.STRING },
      },
    },
  },
};

const ENTITY_FUNCTION: FunctionDeclaration = {
  name: "capture_clinic_entities",
  description: "Extract relevant user details like phone, preferred service, dates and names.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      customerName: { type: Type.STRING },
      phoneNumber: { type: Type.STRING },
      email: { type: Type.STRING },
      appointmentDate: { type: Type.STRING },
      appointment_time: { type: Type.STRING },
      service: { type: Type.STRING },
      service_type: { type: Type.STRING },
      notes: { type: Type.STRING },
      bookingId: { type: Type.STRING },
      provider: { type: Type.STRING },
      doctor_name: { type: Type.STRING },
      clinic_branch: { type: Type.STRING },
    },
  },
};

const TOOL_CONFIG: ToolConfig = {
  functionCallingConfig: {
    mode: "AUTO" as any,
    allowedFunctionNames: ["capture_clinic_entities"],
  },
};

export class ConversationManager {
  private client: GoogleGenAI;
  private model: string;
  private state: ConversationState;

  constructor(sessionId: string = generateId()) {
    this.client = new GoogleGenAI(LIVE_CLIENT_OPTIONS);
    this.model = GEMINI_TEXT_MODEL ?? GEMINI_REQUESTED_MODEL;
    this.state = {
      sessionId,
      turns: [],
      currentIntent: "UNKNOWN",
      entities: {},
    };
  }

  public getState() {
    return this.state;
  }

  public async ingestUserMessage(message: string) {
    const turn: ConversationTurn = {
      id: generateId(),
      role: "user",
      text: message,
      timestamp: Date.now(),
    };
    this.state.turns.push(turn);
    await this.analyzeIntentAndEntities();
  }

  private async analyzeIntentAndEntities() {
    const context: Content[] = this.state.turns.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    }));

    const request: any = {
      model: this.model,
      contents: context,
      config: {
        temperature: 0.2,
        systemInstruction: {
          role: "system",
          parts: [
            {
              text: `You are eDentist.AI — a strict, domain-limited dental clinic assistant.

❗ Allowed domain (you MUST stay strictly inside this scope):
- Booking, confirming, rescheduling, or canceling dental appointments.
- Information about dental services: cleaning, whitening, orthodontics, implants, fillings.
- Follow-ups after treatment: pain check, medication guidance, hygiene reminders.
- Insurance, pricing, offers, or clinic policies.
- Doctor availability, branch information, working hours.

❌ Forbidden (absolutely do NOT answer these):
- Any topic unrelated to dentistry or appointment management.
- General medical questions outside dentistry.
- Politics, programming, math, personal advice, life coaching, or storytelling.
- Anything outside the clinic domain.

If the user asks anything outside allowed scope:
→ Respond ONLY with:
"عذراً، لا يمكنني المساعدة في هذا السؤال لأنه خارج نطاق مساعد الأسنان الإلكتروني."

🗣️ Language & Dialect Rules:
- Detect user's language automatically (Arabic or English).
- If the user uses Arabic, respond in the SAME DIALECT they use (Jordanian, Palestinian, Saudi, Egyptian, Gulf, etc.) but keep it professional.
- Match the user's tone: formal ↔ casual.
- Never switch language unless the user switches.
- When responding in Arabic, convert all numbers into Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩). Never output English digits in Arabic replies.

📦 Technical rules:
- Always extract entities using capture_clinic_entities.
- Always respond with valid JSON only.
- Be concise, accurate, and strictly domain-focused.
- Never improvise or invent information outside this domain.

🔐 OTP Policy:
- For canceling or rescheduling an appointment: always detect that the user intends to modify or cancel a booking, and ALWAYS include an “otp” entity when the user provides it.
- If the user requests cancelation or rescheduling but has NOT provided an OTP, mark otp as missing in the extracted entities.

`,
            },
          ],
        },
      },
      tools: [{ functionDeclarations: [ENTITY_FUNCTION] }],
      toolConfig: TOOL_CONFIG,
    };

    const response = await this.client.models.generateContent(request);

    const fnCalls = response.functionCalls ?? [];
    const latestFn = fnCalls[fnCalls.length - 1];
    const functionEntities: EntityMap =
      (latestFn?.args as EntityMap) ?? {};

    const intentText = response.text;
    let intent: Intent = this.state.currentIntent;
    try {
      if (intentText) {
        const parsed = JSON.parse(intentText);
        if (parsed.intent) {
          const normalized = normalizeIntent(parsed.intent);
          if (normalized) {
            intent = normalized;
          }
        }
        if (parsed.entities) {
          Object.assign(functionEntities, parsed.entities);
        }
      }
    } catch (err) {
      console.warn("Failed to parse intent JSON:", err);
    }

    if (functionEntities.service_type && !functionEntities.service) {
      functionEntities.service = functionEntities.service_type;
    }
    if (functionEntities.service && !functionEntities.service_type) {
      functionEntities.service_type = functionEntities.service;
    }

    this.state.currentIntent = intent;
    this.state.entities = { ...this.state.entities, ...functionEntities };
    const latestTurn = this.state.turns[this.state.turns.length - 1];
    latestTurn.intent = intent;
    latestTurn.entities = functionEntities;
  }

  public async generateAssistantReply(): Promise<string> {
    const context: Content[] = this.state.turns.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    }));

    const lastUserMessage =
      [...this.state.turns].reverse().find((turn) => turn.role === "user")
        ?.text ?? "";
    const language = detectPreferredLanguage(lastUserMessage);
    const prefersArabic = language === "ar";
    const assistantTurnsCount = this.state.turns.filter(
      (turn) => turn.role === "assistant"
    ).length;

    const greetingRegex =
      /(مرحبا|مرحباً|أهلاً|اهلا|هلا|السلام عليكم|hi\b|hello\b|hey\b|good\s+(morning|afternoon|evening))/i;
    if (
      assistantTurnsCount === 0 &&
      lastUserMessage.trim().length > 0 &&
      greetingRegex.test(lastUserMessage.trim())
    ) {
      let greetingReply: string | null = null;
      try {
        const dbGreeting = await fetchClinicContent("initial.greeting", language);
        if (dbGreeting && dbGreeting.trim().length) {
          greetingReply = dbGreeting.trim();
        }
      } catch (error) {
        console.warn("Failed to load initial greeting from database:", error);
      }

      if (!greetingReply) {
        greetingReply = prefersArabic
          ? "مرحباً! أنا eDentist.AI، مساعد الحجوزات الذكي للعيادات السنية. أستطيع مساعدتك في حجز، تعديل، أو إلغاء المواعيد بالإضافة إلى الإجابة عن أسئلة الخدمات. كيف أقدر أساعدك اليوم؟"
          : "Hello! I’m eDentist.AI, your dental clinic assistant. I can help you book, adjust, or cancel appointments and answer questions about our services. How can I assist you today?";
      }

      this.state.currentIntent = "UNKNOWN";
      this.state.turns.push({
        id: generateId(),
        role: "assistant",
        text: greetingReply,
        intent: "UNKNOWN",
        entities: this.state.entities,
        timestamp: Date.now(),
      });
      return greetingReply;
    }

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: context,
      config: {
        temperature: 0.5,
        systemInstruction: {
          role: "system",
          parts: [
            {
              text:`You are eDentist AI — a strict, domain-limited intelligent dental clinic assistant.

Intent: ${this.state.currentIntent}
Entities: ${JSON.stringify(this.state.entities)}

❗ Allowed scope (only respond within these topics):
- Booking, confirming, rescheduling, or canceling dental appointments.
- Information about dental services: cleaning, whitening, orthodontics, implants, fillings.
- Post-treatment follow-ups: pain check, medication instructions, hygiene reminders.
- Insurance questions, pricing, offers, clinic policies.
- Doctor availability, branches, and working hours.

❌ Forbidden (absolutely do NOT answer these):
- General medical topics outside dentistry.
- Anything unrelated to the clinic (politics, lifestyle, programming, math, personal topics, etc.)
- Storytelling, advice outside dental care, or anything outside this domain.

If the user asks anything outside your allowed domain:
→ Respond ONLY with:
"عذراً، لا يمكنني المساعدة في هذا السؤال لأنه خارج نطاق مساعد الأسنان الإلكتروني."

🗣️ Language & Dialect Rules:
- Detect the user's language automatically (Arabic or English).
- If user speaks Arabic, respond in the SAME dialect (Jordanian/Palestinian/Gulf/Egyptian) but keep it professional.
- Match the user's tone: formal ↔ casual.
- Never switch language unless the user switches.
- When responding in Arabic, convert all numbers into Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩). Never output English digits in Arabic replies.

📦 Technical Rules:
- Always extract entities using capture_clinic_entities.
- Always respond with valid JSON only.
- Stay concise, accurate, and strictly domain-focused.
- Never invent, guess, or answer outside the scope.

🔐 OTP Verification Rule:
- When the user requests CANCEL_APPOINTMENT or RESCHEDULE_APPOINTMENT:
    • Before performing the action, you MUST ask the user to provide the OTP code.
    • The assistant cannot proceed unless the user provides the OTP.
    • If OTP is missing, say clearly: 
      "لإتمام العملية، يرجى تزويدي برمز التحقق (OTP)."
    • Only after receiving the OTP can the assistant continue with canceling or rescheduling.

`

            },
          ],
        },
      },
    });

    const doctorName = this.state.entities.doctor_name;
    const clinicBranch = this.state.entities.clinic_branch;
    const appointmentDate = this.state.entities.appointmentDate;
    const appointmentTime = this.state.entities.appointment_time;
    const serviceType =
      this.state.entities.service_type ?? this.state.entities.service;

    const replyParams = {
      doctorName,
      clinicBranch,
      appointmentDate,
      appointmentTime,
      serviceType,
    };

    const templateParams: Record<string, string> = {
      doctor_name: doctorName ?? "",
      clinic_branch: clinicBranch ?? "",
      appointment_date: appointmentDate ?? "",
      appointment_time: appointmentTime ?? "",
      service_type: serviceType ?? "",
      patient_name: this.state.entities.customerName ?? "",
      patient_phone: this.state.entities.phoneNumber ?? "",
      notes: this.state.entities.notes ?? "",
    };

    const templateKeys: Partial<Record<Intent, string>> = {
      BOOK_APPOINTMENT: "booking.confirmed",
      CANCEL_APPOINTMENT: "booking.cancelled",
      RESCHEDULE_APPOINTMENT: "booking.rescheduled",
      INQUIRY: "inquiry.general",
      UNKNOWN: "fallback.unknown",
      FOLLOW_UP: "follow_up.general",
      ORTHODONTICS_INQUIRY: "service.orthodontics",
      REMINDER_CALL: "booking.reminder",
    };

    const replyTemplates: Record<
      Intent,
      {
        ar: (params: typeof replyParams) => string;
        en: (params: typeof replyParams) => string;
      }
    > = {
      BOOK_APPOINTMENT: {
        ar: (params) =>
          params.doctorName &&
          params.clinicBranch &&
          params.appointmentDate &&
          params.appointmentTime
            ? `تم حجز موعدك مع الدكتور ${params.doctorName} في فرع ${params.clinicBranch} يوم ${params.appointmentDate} الساعة ${params.appointmentTime}.`
            : "تم تسجيل طلبك، تفضل بتزويدنا باسم الطبيب، الفرع ووقت الموعد لتأكيد الحجز.",
        en: (params) =>
          params.doctorName &&
          params.clinicBranch &&
          params.appointmentDate &&
          params.appointmentTime
            ? `Your appointment with Dr. ${params.doctorName} at ${params.clinicBranch} is booked for ${params.appointmentDate} at ${params.appointmentTime}.`
            : "I have your request noted. Please share the doctor, branch, and preferred time so I can confirm the booking.",
      },
      CANCEL_APPOINTMENT: {
        ar: () => "تم إلغاء الموعد بنجاح. نأمل نراك قريباً!",
        en: () =>
          "Your appointment has been cancelled successfully. We hope to see you soon!",
      },
      RESCHEDULE_APPOINTMENT: {
        ar: (params) =>
          params.appointmentDate && params.appointmentTime
            ? `تم تعديل موعدك ليصبح يوم ${params.appointmentDate} الساعة ${params.appointmentTime}.`
            : "سأقوم بتعديل الموعد، هل يمكنك تحديد اليوم والوقت الجديدين؟",
        en: (params) =>
          params.appointmentDate && params.appointmentTime
            ? `Your appointment has been rescheduled to ${params.appointmentDate} at ${params.appointmentTime}.`
            : "I'll reschedule that for you. Could you share the new date and time?",
      },
      INQUIRY: {
        ar: () =>
          "يسرّنا الرد على استفساراتك حول خدمات العيادة مثل التنظيف، التقويم، الزراعة أو التبييض. كيف يمكنني مساعدتك؟",
        en: () =>
          "I'm happy to help with any questions about our services such as cleaning, orthodontics, implants, or whitening. How can I assist you today?",
      },
      UNKNOWN: {
        ar: () =>
          "لم أفهم طلبك تماماً، هل يمكنك التوضيح أكثر أو تحديد الخدمة التي تحتاجها؟",
        en: () =>
          "I didn't fully catch that. Could you clarify what you need help with?",
      },
      FOLLOW_UP: {
        ar: () =>
          "كيف تشعر بعد علاجك الأخير؟ هل ترغب بموعد متابعة؟",
        en: () =>
          "How are you feeling after your recent treatment? Would you like to schedule a follow-up visit?",
      },
      ORTHODONTICS_INQUIRY: {
        ar: () =>
          "العلاج التقويمي يحتاج تقييماً أولياً مع الطبيب المختص، هل ترغب بتحديد موعد فحص؟",
        en: () =>
          "Orthodontic treatment requires an initial assessment with a specialist. Would you like me to schedule a consultation?",
      },
      REMINDER_CALL: {
        ar: (params) =>
          params.doctorName && params.clinicBranch && params.appointmentTime
            ? `تذكير: موعدك غداً مع الدكتور ${params.doctorName} في فرع ${params.clinicBranch} الساعة ${params.appointmentTime}.`
            : "تذكير: لديك موعد قريب في عيادة eDentist. يرجى التواصل معنا لتأكيد التفاصيل.",
        en: (params) =>
          params.doctorName && params.clinicBranch && params.appointmentTime
            ? `Reminder: Your appointment is tomorrow with Dr. ${params.doctorName} at the ${params.clinicBranch} branch at ${params.appointmentTime}.`
            : "Reminder: You have an upcoming appointment at eDentist. Please contact us to confirm the details.",
      },
    };

    let reply = response.text ?? "";
    let handled = false;
    let replyKey: string | null = null;

    const missingFieldLabels: Record<string, { ar: string; en: string }> = {
      doctorName: { ar: "اسم الطبيب", en: "doctor's name" },
      clinicBranch: { ar: "فرع العيادة", en: "clinic branch" },
      appointmentDate: { ar: "تاريخ الموعد", en: "appointment date" },
      appointmentTime: { ar: "وقت الموعد", en: "appointment time" },
      customerName: { ar: "اسم المريض", en: "patient name" },
      phoneNumber: { ar: "رقم الجوال", en: "phone number" },
      serviceType: { ar: "نوع الخدمة", en: "service type" },
      bookingId: { ar: "رقم الحجز", en: "booking ID" },
    };

    const ensureBookingEntities = () => {
      const required: Record<string, string | undefined> = {
        doctorName,
        clinicBranch,
        appointmentDate,
        appointmentTime,
        customerName: this.state.entities.customerName,
        phoneNumber: this.state.entities.phoneNumber,
        serviceType: serviceType ?? undefined,
      };
      const missing = Object.entries(required)
        .filter(([, value]) => !value || !value.trim())
        .map(([key]) => missingFieldLabels[key][language]);
      return { missing, required };
    };

    const ensureRescheduleEntities = () => {
      const required: Record<string, string | undefined> = {
        appointmentDate,
        appointmentTime,
      };
      const missing = Object.entries(required)
        .filter(([, value]) => !value || !value.trim())
        .map(([key]) => missingFieldLabels[key][language]);
      return { missing, required };
    };

    const ensureBookingId = () => {
      const id = this.state.entities.bookingId;
      if (!id || !id.trim()) {
        return null;
      }
      const parsed = parseInt(id.trim(), 10);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const appendDoctorSuggestions = async (baseReply: string) => {
      try {
        const available = await getAvailableDoctors();
        if (!available.length) {
          return baseReply;
        }
        const joined = joinByLanguage(language, available);
        const suggestion = prefersArabic
          ? ` المتاحون حالياً: ${joined}.`
          : ` Available specialists right now: ${joined}.`;
        return `${baseReply} ${suggestion}`.trim();
      } catch (err) {
        console.warn("Failed to fetch practitioner list:", err);
        return baseReply;
      }
    };

    const followUpRequested =
      /(متابعة|متابعه|بعد العلاج|hygiene|follow[-\s]?up|check)/i.test(
        lastUserMessage
      ) ||
      (this.state.entities.notes ?? "")
        .toLowerCase()
        .includes("follow-up");
    if (this.state.currentIntent === "BOOK_APPOINTMENT") {
      const { missing } = ensureBookingEntities();
      if (missing.length) {
        const joined = joinByLanguage(language, missing);
        templateParams.missing_fields = joined;
        reply = prefersArabic
          ? `لإتمام الحجز أحتاج إلى: ${joined}.`
          : `To finish the booking I still need: ${joined}.`;
        handled = true;
        replyKey = "booking.missing_fields";
      } else {
        try {
          const bookingResult = await createBookingViaDB({
            doctor_name: doctorName!,
            clinic_branch: clinicBranch!,
            patient_name: this.state.entities.customerName!,
            patient_phone: this.state.entities.phoneNumber!,
            service_type: serviceType ?? "general",
            appointment_date: appointmentDate!,
            appointment_time: appointmentTime!,
          });

          if (bookingResult.success) {
            reply = replyTemplates.BOOK_APPOINTMENT[language](replyParams);
            replyKey = templateKeys.BOOK_APPOINTMENT ?? "booking.confirmed";
            if (
              bookingResult.booking &&
              typeof bookingResult.booking === "object" &&
              "id" in bookingResult.booking
            ) {
              this.state.entities.bookingId = String(
                (bookingResult.booking as any).id
              );
            }
          } else {
            templateParams.reason = bookingResult.reason ?? "";
            if (bookingResult.reason === "ALREADY_BOOKED") {
              const doctorLabel = doctorName ?? (prefersArabic ? "الطبيب المطلوب" : "the requested doctor");
              const timeLabel = appointmentTime ?? (prefersArabic ? "الوقت المطلوب" : "the requested time");
              reply = prefersArabic
                ? `الدكتور ${doctorLabel} غير متاح في ${timeLabel}. هل ترغب باقتراح موعد آخر؟`
                : `Dr. ${doctorLabel} is not available at ${timeLabel}. Would you like me to suggest another slot?`;
            } else if (prefersArabic) {
              reply = bookingResult.message;
            } else {
              reply = "I couldn't confirm that booking. Could you provide another time or doctor?";
            }
            const reasonKeyMap: Record<string, string> = {
              DOCTOR_NOT_FOUND: "booking.failure_doctor_not_found",
              DOCTOR_NOT_AVAILABLE_DAY: "booking.failure_not_available_day",
              OUTSIDE_WORKING_HOURS: "booking.failure_outside_hours",
              ALREADY_BOOKED: "booking.failure_already_booked",
            };
            replyKey =
              reasonKeyMap[bookingResult.reason ?? ""] ??
              "booking.failure_general";
            reply = await appendDoctorSuggestions(reply);
          }
        } catch (error) {
          reply = prefersArabic
            ? "تعذر إنشاء الحجز حالياً، يرجى المحاولة لاحقاً أو التواصل مع موظف الاستقبال."
            : "I couldn't complete the booking right now. Please try again later or call the clinic.";
          replyKey = "booking.failure_general";
        }
        handled = true;
      }
    } else if (this.state.currentIntent === "CANCEL_APPOINTMENT") {
      const bookingId = ensureBookingId();
      if (!bookingId) {
        const missingLabel = missingFieldLabels.bookingId[language];
        templateParams.missing_fields = missingLabel;
        reply = prefersArabic
          ? `لإلغاء الموعد أحتاج إلى ${missingLabel}.`
          : `To cancel the appointment I still need the ${missingLabel}.`;
        replyKey = "booking.missing_fields";
      } else {
        const result = await cancelBookingViaDB(bookingId);
        if (result.success) {
          reply = replyTemplates.CANCEL_APPOINTMENT[language](replyParams);
          replyKey = templateKeys.CANCEL_APPOINTMENT ?? "booking.cancelled";
          delete this.state.entities.bookingId;
        } else {
          reply = prefersArabic
            ? result.message
            : "I wasn't able to cancel that booking right now. Please try again later.";
          replyKey = "booking.failure_general";
        }
      }
      handled = true;
    } else if (this.state.currentIntent === "RESCHEDULE_APPOINTMENT") {
      const bookingId = ensureBookingId();
      if (!bookingId) {
        const missingLabel = missingFieldLabels.bookingId[language];
        templateParams.missing_fields = missingLabel;
        reply = prefersArabic
          ? `لتعديل الموعد أحتاج إلى ${missingLabel}.`
          : `To reschedule I still need the ${missingLabel}.`;
        replyKey = "booking.missing_fields";
      } else {
        const { missing } = ensureRescheduleEntities();
        if (missing.length) {
          const joined = joinByLanguage(language, missing);
          templateParams.missing_fields = joined;
          reply = prefersArabic
            ? `لتحديث الموعد أحتاج إلى: ${joined}.`
            : `To update the appointment I still need: ${joined}.`;
          replyKey = "booking.missing_fields";
        } else {
          const result = await updateBookingViaDB(bookingId, {
            appointment_date: appointmentDate!,
            appointment_time: appointmentTime!,
            service_type: serviceType ?? undefined,
            doctor_name: doctorName,
            clinic_branch: clinicBranch,
          });
          if (result.success) {
            reply = replyTemplates.RESCHEDULE_APPOINTMENT[language](
              replyParams
            );
            replyKey =
              templateKeys.RESCHEDULE_APPOINTMENT ?? "booking.rescheduled";
          } else {
            reply = prefersArabic
              ? result.message
              : "I couldn't reschedule that appointment. Could you share another time or doctor?";
            const reasonKeyMap: Record<string, string> = {
              DOCTOR_NOT_FOUND: "booking.failure_doctor_not_found",
              DOCTOR_NOT_AVAILABLE_DAY: "booking.failure_not_available_day",
              OUTSIDE_WORKING_HOURS: "booking.failure_outside_hours",
              ALREADY_BOOKED: "booking.failure_already_booked",
            };
            replyKey =
              reasonKeyMap[result.reason ?? ""] ??
              "booking.failure_general";
            reply = await appendDoctorSuggestions(reply);
          }
        }
      }
      handled = true;
    } else if (this.state.currentIntent === "UNKNOWN" && followUpRequested && doctorName) {
      reply = replyTemplates.FOLLOW_UP[language](replyParams);
      replyKey = templateKeys.FOLLOW_UP ?? "follow_up.general";
      handled = true;
    } else if (
      this.state.currentIntent === "FOLLOW_UP" ||
      this.state.currentIntent === "ORTHODONTICS_INQUIRY" ||
      this.state.currentIntent === "REMINDER_CALL" ||
      this.state.currentIntent === "INQUIRY"
    ) {
      const template = replyTemplates[this.state.currentIntent];
      if (template) {
        try {
          reply = template[language](replyParams);
          replyKey =
            templateKeys[this.state.currentIntent] ??
            templateKeys.UNKNOWN ??
            null;
          handled = true;
        } catch (err) {
          console.warn("Failed to apply reply template:", err);
        }
      }
    }

    if (!handled) {
      const template = replyTemplates[this.state.currentIntent];
      if (template) {
        try {
          reply = template[language](replyParams);
          replyKey =
            templateKeys[this.state.currentIntent] ??
            templateKeys.UNKNOWN ??
            null;
          handled = true;
        } catch (err) {
          console.warn("Failed to apply reply template:", err);
        }
      }
    }

    if (!replyKey) {
      replyKey =
        templateKeys[this.state.currentIntent] ??
        templateKeys.UNKNOWN ??
        "fallback.unknown";
    }

    if (replyKey) {
      const dynamic = await this.renderTemplate(
        replyKey,
        language,
        templateParams
      );
      if (dynamic) {
        reply = dynamic;
      }
    }

    this.state.turns.push({
      id: generateId(),
      role: "assistant",
      text: reply,
      intent: this.state.currentIntent,
      entities: this.state.entities,
      timestamp: Date.now(),
    });

    return reply;
  }

  private ensureEntity<K extends keyof EntityMap>(key: K): string {
    const value = this.state.entities[key];
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new Error(
        `Missing required entity "${String(key)}" to sync with PMS`
      );
    }
    return value.trim();
  }

  private ensureServiceType(): string {
    const service =
      this.state.entities.service_type ?? this.state.entities.service ?? "";
    if (!service.trim()) {
      throw new Error(
        'Missing required entity "service_type" to sync with PMS'
      );
    }
    return service.trim();
  }

  private parseName(fullName: string) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return { firstName: "Unknown" };
    }
    if (parts.length === 1) {
      return { firstName: parts[0] };
    }
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
    };
  }

  private toIsoOrThrow(dateRaw: string, timeRaw?: string) {
    const normalizedDate = dateRaw.trim();
    const combined = timeRaw
      ? `${normalizedDate} ${timeRaw.trim()}`
      : normalizedDate;
    let timestamp = Date.parse(combined);
    if (Number.isNaN(timestamp)) {
      const isoCandidate = this.combineIso(normalizedDate, timeRaw);
      timestamp = Date.parse(isoCandidate);
    }
    if (Number.isNaN(timestamp)) {
      throw new Error(
        `appointment date/time "${combined}" could not be converted to a valid ISO timestamp`
      );
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `appointment date/time "${combined}" could not be converted to a valid ISO timestamp`
      );
    }
    return date.toISOString();
  }

  private combineIso(dateValue: string, timeValue?: string) {
    if (!timeValue) {
      return dateValue;
    }
    const match = timeValue
      .trim()
      .toLowerCase()
      .match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!match) {
      return `${dateValue} ${timeValue}`;
    }
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const meridiem = match[3];
    if (meridiem === "pm" && hours < 12) {
      hours += 12;
    }
    if (meridiem === "am" && hours === 12) {
      hours = 0;
    }
    const hourStr = String(hours).padStart(2, "0");
    const minuteStr = String(minutes).padStart(2, "0");
    return `${dateValue}T${hourStr}:${minuteStr}:00`;
  }

  private validateBusinessHours(isoDate: string) {
    const date = new Date(isoDate);
    const day = date.getDay();
    if (day === 5 || day === 6) {
      throw new Error(
        "Requested appointment falls outside clinic working days (Sunday–Thursday)."
      );
    }
    const hour = date.getHours();
    if (hour < 9 || hour >= 21) {
      throw new Error(
        "Requested appointment time is outside working hours (9 AM – 9 PM)."
      );
    }
  }

  private async renderTemplate(
    slug: string,
    locale: "ar" | "en",
    params: Record<string, string>
  ): Promise<string | null> {
    try {
      const template = await fetchClinicContent(slug, locale);
      if (!template) {
        return null;
      }
      return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
        const value = params[key];
        return value !== undefined ? value : "";
      });
    } catch (error) {
      console.warn("Failed to fetch template:", error);
      return null;
    }
  }

  private buildBookingPayload(): BookingPayload {
    const name = this.parseName(this.ensureEntity("customerName"));
    const appointmentDate = this.ensureEntity("appointmentDate");
    const appointmentTime = this.ensureEntity("appointment_time");
    const doctorName = this.ensureEntity("doctor_name");
    const clinicBranch = this.ensureEntity("clinic_branch");
    const serviceName = this.ensureServiceType();
    const phone = this.state.entities.phoneNumber;
    const email = this.state.entities.email;

    const isoStart = this.toIsoOrThrow(appointmentDate, appointmentTime);
    this.validateBusinessHours(isoStart);

    return {
      patient: {
        firstName: name.firstName,
        lastName: name.lastName,
        phone,
        email,
      },
      service: serviceName,
      startTime: isoStart,
      notes: this.state.entities.notes,
      source: "eDentist.AI",
      metadata: {
        sessionId: this.state.sessionId,
        capturedAt: new Date().toISOString(),
        doctorName,
        clinicBranch,
        appointmentTime,
        serviceType: serviceName,
      },
    };
  }

  private buildUpdatePayload(): UpdatePayload {
    const payload = this.buildBookingPayload();
    return {
      ...payload,
      status: "confirmed",
    };
  }

  public async syncBookingWithPMS(provider: PMSProvider) {
    const bookingId = this.state.entities.bookingId;
    this.ensureEntity("doctor_name");
    this.ensureEntity("clinic_branch");
    this.ensureEntity("appointmentDate");
    this.ensureEntity("appointment_time");
    this.ensureServiceType();

    if (!provider) {
      throw new Error("Missing provider to sync with PMS");
    }

    let response;
    if (bookingId) {
      const updatePayload = this.buildUpdatePayload();
      response = await updateAppointment(provider, bookingId, updatePayload);
    } else {
      const bookingPayload = this.buildBookingPayload();
      response = await bookAppointment(provider, bookingPayload);
    }

    if (response.status === "success") {
      const externalId =
        response.result && typeof response.result === "object"
          ? (response.result as any).externalId ??
            (response.result as any).result?.externalId
          : undefined;
      if (typeof externalId === "string") {
        this.state.entities.bookingId = externalId;
      }
      this.state.entities.provider = provider;
    }
    return response;
  }

  public async cancelBookingWithPMS(
    provider: PMSProvider,
    reason?: string
  ) {
    const bookingId = this.state.entities.bookingId;
    if (!bookingId) {
      throw new Error(
        "Cannot cancel booking: no bookingId found in conversation state"
      );
    }
    const cancelPayload: CancelPayload = {
      reason,
      cancelledBy: "assistant",
      timestamp: new Date().toISOString(),
    };
    const response = await cancelAppointment(provider, bookingId, cancelPayload);
    if (response.status === "success") {
      delete this.state.entities.bookingId;
    }
    return response;
  }
}

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function normalizeIntent(value: unknown): Intent | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (KNOWN_INTENTS.includes(normalized as Intent)) {
    return normalized as Intent;
  }
  return null;
}

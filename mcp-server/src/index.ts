import { Prisma, PrismaClient, VoiceAgentsProvider } from "@prisma/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type ToolResult = {
  content: { type: "text"; text: string }[];
};

const prisma = new PrismaClient();

const server = new McpServer({
  name: "edentist-mcp",
  version: "1.0.0",
});

const toNumber = (value: number | string) =>
  typeof value === "number" ? value : Number.parseInt(value, 10);

const respond = (payload: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload) }],
});

const respondSuccess = (data: unknown) =>
  respond({ success: true, data });

const respondError = (error: unknown, meta?: Record<string, unknown>) => {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  return respond({
    success: false,
    error: message,
    meta,
  });
};

const safeTool =
  <T extends z.ZodTypeAny>(
    toolName: string,
    schema: T,
    handler: (input: z.infer<T>) => Promise<unknown>
  ) =>
  async (rawInput: unknown): Promise<ToolResult> => {
    try {
      // Debug: Log what we receive
      console.log(`[edentist-mcp] Tool ${toolName} received input:`, JSON.stringify(rawInput, null, 2));
      console.log(`[edentist-mcp] Tool ${toolName} input type:`, typeof rawInput);
      
      // When inputSchema is provided, MCP SDK parses and passes the parsed data directly
      // rawInput should already be the parsed arguments object
      let inputToParse = rawInput;
      
      // If rawInput is undefined or null, use empty object
      if (inputToParse === undefined || inputToParse === null) {
        console.warn(`[edentist-mcp] Tool ${toolName} input is undefined/null, using empty object`);
        inputToParse = {};
      }
      
      // If inputToParse is an array, take first element (shouldn't happen, but handle it)
      if (Array.isArray(inputToParse) && inputToParse.length > 0) {
        console.warn(`[edentist-mcp] Tool ${toolName} input is array, taking first element`);
        inputToParse = inputToParse[0];
      }
      
      // If inputToParse is a string, try to parse it as JSON
      if (typeof inputToParse === "string") {
        console.warn(`[edentist-mcp] Tool ${toolName} input is string, attempting JSON parse`);
        try {
          inputToParse = JSON.parse(inputToParse);
        } catch {
          inputToParse = { value: inputToParse };
        }
      }
      
      console.log(`[edentist-mcp] Tool ${toolName} parsing with schema...`);
      const parsed = schema.parse(inputToParse);
      console.log(`[edentist-mcp] Tool ${toolName} schema validation passed`);
      const data = await handler(parsed);
      return respondSuccess(data);
    } catch (error) {
      console.error(`[edentist-mcp] tool failure (${toolName}):`, error);
      return respondError(error);
    }
  };

const createAppointmentSchema = z.object({
  doctorName: z.string().min(1),
  clinicBranch: z.string().min(1),
  patientName: z.string().min(1),
  patientPhone: z.string().min(3),
  serviceType: z.string().min(1),
  appointmentDate: z.string().min(1),
  appointmentTime: z.string().min(1),
  status: z.string().optional(),
  notes: z.string().optional(),
  otp: z.string().optional(),
});

const updateAppointmentSchema = z.object({
  appointmentId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  doctorName: z.string().min(1).optional(),
  clinicBranch: z.string().min(1).optional(),
  patientName: z.string().min(1).optional(),
  patientPhone: z.string().min(3).optional(),
  serviceType: z.string().min(1).optional(),
  appointmentDate: z.string().optional(),
  appointmentTime: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const cancelAppointmentSchema = z.object({
  appointmentId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  reason: z.string().optional(),
  cancelledBy: z.string().optional(),
});

const listClinicsSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
});

const listDoctorsSchema = z.object({
  clinicId: z.number().int().positive().optional(),
  includeClinic: z.boolean().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const validateVoucherSchema = z.object({
  code: z.string().min(3),
});

const logVoiceCallSchema = z.object({
  agentId: z.string().min(1),
  conversationId: z.string().min(1),
  status: z.string().min(1),
  provider: z.string().optional(),
  clinicId: z.number().int().positive().optional(),
  collectedData: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const findUserByPhoneSchema = z.object({
  phone: z.string().min(3),
});

const findUserByNameSchema = z.object({
  name: z.string().min(1),
  limit: z.number().int().positive().max(50).optional(),
});

const listUserAppointmentsSchema = z.object({
  patientPhone: z.string().min(3).optional(),
  patientName: z.string().min(1).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const searchAppointmentsSchema = z.object({
  doctorName: z.string().optional(),
  clinicBranch: z.string().optional(),
  appointmentDate: z.string().optional(),
  status: z.string().optional(),
  patientName: z.string().optional(),
  patientPhone: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

type AppointmentRaw = Record<string, any>;

const getAppointmentRaw = (details: Prisma.JsonValue): AppointmentRaw =>
  details && typeof details === "object" && !Array.isArray(details)
    ? (details as AppointmentRaw)
    : {};

const normalizeAppointment = (
  appointment: {
    id: number;
    appointment_raw_details: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }
) => ({
  id: appointment.id,
  createdAt: appointment.createdAt,
  updatedAt: appointment.updatedAt,
  ...getAppointmentRaw(appointment.appointment_raw_details),
});

server.registerTool(
  "create_appointment",
  {
    title: "Create appointment",
    description: "Creates a new appointment stored in the Prisma database.",
    inputSchema: createAppointmentSchema as any,
  },
  safeTool("create_appointment", createAppointmentSchema, async (input) => {
    const payload = {
      ...input,
      status: input.status ?? "confirmed",
      createdAt: new Date().toISOString(),
    };

    const appointment = await prisma.appointment.create({
      data: {
        appointment_raw_details: payload,
      },
    });

    return {
      appointmentId: appointment.id,
      details: payload,
    };
  })
);

server.registerTool(
  "update_appointment",
  {
    title: "Update appointment",
    description: "Updates appointment fields such as date, time, doctor, or status.",
    inputSchema: updateAppointmentSchema as any,
  },
  safeTool("update_appointment", updateAppointmentSchema, async ({ appointmentId, ...updates }) => {
    const hasUpdates = Object.values(updates).some(
      (value) => value !== undefined && value !== null
    );
    if (!hasUpdates) {
      return respondError(
        new Error("Provide at least one field to update the appointment.")
      );
    }

    const id = toNumber(appointmentId);
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) {
      return respondError(new Error(`Appointment ${id} not found.`));
    }

    const details = getAppointmentRaw(existing.appointment_raw_details);
    const merged = {
      ...details,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await prisma.appointment.update({
      where: { id },
      data: { appointment_raw_details: merged as Prisma.InputJsonValue },
    });

    return {
      appointmentId: id,
      details: merged,
    };
  })
);

server.registerTool(
  "cancel_appointment",
  {
    title: "Cancel appointment",
    description: "Marks an appointment as cancelled.",
    inputSchema: cancelAppointmentSchema as any,
  },
  safeTool("cancel_appointment", cancelAppointmentSchema, async ({ appointmentId, ...rest }) => {
    const id = toNumber(appointmentId);
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) {
      return respondError(new Error(`Appointment ${id} not found.`));
    }

    const details = getAppointmentRaw(existing.appointment_raw_details);
    const merged = {
      ...details,
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancellationReason: rest.reason,
      cancelledBy: rest.cancelledBy,
    };

    await prisma.appointment.update({
      where: { id },
      data: { appointment_raw_details: merged as Prisma.InputJsonValue },
    });

    return {
      appointmentId: id,
      details: merged,
    };
  })
);

server.registerTool(
  "list_clinics",
  {
    title: "List clinics",
    description: "Lists clinics along with summary counts.",
    inputSchema: listClinicsSchema as any,
  },
  safeTool("list_clinics", listClinicsSchema, async ({ limit }) => {
    const clinics = await prisma.clinic.findMany({
      take: limit ?? 50,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            users: true,
            vouchers: true,
            agentAssignments: true,
            voiceCalls: true,
          },
        },
      },
    });

    return clinics;
  })
);

server.registerTool(
  "list_doctors",
  {
    title: "List doctors",
    description: "Returns clinic members with clinic assignments.",
    inputSchema: listDoctorsSchema as any,
  },
  safeTool("list_doctors", listDoctorsSchema, async ({ clinicId, includeClinic, limit }) => {
    const where: Prisma.UserWhereInput = clinicId
      ? { clinicId }
      : { clinicId: { not: null } };

    const doctors = await prisma.user.findMany({
      where,
      include: { clinic: true },
      take: limit ?? 50,
    });

    return doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      phone: doctor.mobileNumber,
      email: doctor.email,
      clinic: includeClinic ? doctor.clinic : undefined,
    }));
  })
);

server.registerTool(
  "validate_voucher",
  {
    title: "Validate voucher",
    description: "Checks whether a voucher code is active and not expired.",
    inputSchema: validateVoucherSchema as any,
  },
  safeTool("validate_voucher", validateVoucherSchema, async ({ code }) => {
    const voucher = await prisma.voucher.findUnique({ where: { code } });
    if (!voucher) {
      return { valid: false, reason: "NOT_FOUND" };
    }

    const now = new Date();
    if (voucher.expirationDate < now) {
      return { valid: false, reason: "EXPIRED", voucher };
    }
    if (!voucher.isActive) {
      return { valid: false, reason: "INACTIVE", voucher };
    }
    if (voucher.seats <= 0) {
      return { valid: false, reason: "NO_SEATS", voucher };
    }

    return { valid: true, voucher };
  })
);

server.registerTool(
  "log_voice_call",
  {
    title: "Log voice call",
    description: "Persists a voice call record.",
    inputSchema: logVoiceCallSchema as any,
  },
  safeTool("log_voice_call", logVoiceCallSchema, async (input) => {
    const providerEnumValues = Object.values(VoiceAgentsProvider);
    const provider = providerEnumValues.includes(
      input.provider as VoiceAgentsProvider
    )
      ? (input.provider as VoiceAgentsProvider)
      : VoiceAgentsProvider.ELEVEN_LABS;

    const call = await prisma.voiceCall.create({
      data: {
        agentId: input.agentId,
        conversationId: input.conversationId,
        status: input.status,
        provider,
        clinicId: input.clinicId,
        collectedData: {
          ...(input.collectedData ?? {}),
          metadata: input.metadata,
        } as Prisma.InputJsonValue,
      },
    });

    return call;
  })
);

server.registerTool(
  "find_user_by_phone",
  {
    title: "Find user by phone",
    description: "Retrieves a patient using the mobileNumber field.",
    inputSchema: findUserByPhoneSchema as any,
  },
  safeTool("find_user_by_phone", findUserByPhoneSchema, async ({ phone }) => {
    const user = await prisma.user.findUnique({
      where: { mobileNumber: phone },
      include: {
        clinic: true,
        reports: { take: 5, orderBy: { created_at: "desc" } },
      },
    });

    if (!user) {
      return { found: false };
    }

    return { found: true, user };
  })
);

server.registerTool(
  "find_user_by_name",
  {
    title: "Find user by name",
    description: "Performs a case-insensitive match on the user name field.",
    inputSchema: findUserByNameSchema as any,
  },
  safeTool("find_user_by_name", findUserByNameSchema, async ({ name, limit }) => {
    const users = await prisma.user.findMany({
      where: {
        name: {
          contains: name,
        },
      },
      take: limit ?? 25,
      include: {
        clinic: true,
      },
    });

    return users;
  })
);

const extractAppointments = (
  appointments: {
    id: number;
    appointment_raw_details: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }[],
  predicate: (details: AppointmentRaw) => boolean
) =>
  appointments
    .map((appt) => normalizeAppointment(appt))
    .filter((details) => predicate(details));

server.registerTool(
  "list_user_appointments",
  {
    title: "List appointments for a patient",
    description: "Lists appointments filtered by patient phone or name.",
    inputSchema: listUserAppointmentsSchema as any,
  },
  safeTool("list_user_appointments", listUserAppointmentsSchema, async ({ patientPhone, patientName, limit }) => {
    if (!patientPhone && !patientName) {
      throw new Error("Provide patientPhone or patientName when listing appointments.");
    }

    const appointments = await prisma.appointment.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit ?? 50,
    });

    const result = extractAppointments(appointments, (details) => {
      const matchesPhone = patientPhone
        ? typeof details.patientPhone === "string" &&
          details.patientPhone.toLowerCase().includes(patientPhone.toLowerCase())
        : true;
      const matchesName = patientName
        ? typeof details.patientName === "string" &&
          details.patientName.toLowerCase().includes(patientName.toLowerCase())
        : true;
      return matchesPhone && matchesName;
    });

    return result;
  })
);

server.registerTool(
  "search_appointments",
  {
    title: "Search appointments",
    description: "Search appointments by doctor, clinic branch, patient, or status.",
    inputSchema: searchAppointmentsSchema as any,
  },
  safeTool("search_appointments", searchAppointmentsSchema, async (filters) => {
    const appointments = await prisma.appointment.findMany({
      orderBy: { updatedAt: "desc" },
      take: filters.limit ?? 50,
    });

    const result = extractAppointments(appointments, (details) => {
      const matchesDoctor = filters.doctorName
        ? typeof details.doctorName === "string" &&
          details.doctorName.toLowerCase().includes(filters.doctorName.toLowerCase())
        : true;
      const matchesClinic = filters.clinicBranch
        ? typeof details.clinicBranch === "string" &&
          details.clinicBranch.toLowerCase().includes(filters.clinicBranch.toLowerCase())
        : true;
      const matchesDate = filters.appointmentDate
        ? typeof details.appointmentDate === "string" &&
          details.appointmentDate.toLowerCase().includes(filters.appointmentDate.toLowerCase())
        : true;
      const matchesStatus = filters.status
        ? typeof details.status === "string" &&
          details.status.toLowerCase().includes(filters.status.toLowerCase())
        : true;
      const matchesPatientName = filters.patientName
        ? typeof details.patientName === "string" &&
          details.patientName.toLowerCase().includes(filters.patientName.toLowerCase())
        : true;
      const matchesPatientPhone = filters.patientPhone
        ? typeof details.patientPhone === "string" &&
          details.patientPhone.toLowerCase().includes(filters.patientPhone.toLowerCase())
        : true;

      return (
        matchesDoctor &&
        matchesClinic &&
        matchesDate &&
        matchesStatus &&
        matchesPatientName &&
        matchesPatientPhone
      );
    });

    return result;
  })
);

const transport = new StdioServerTransport();

async function start() {
  await server.connect(transport);
  console.log("edentist-mcp server ready (stdio transport).");
}

start().catch((error) => {
  console.error("Failed to start edentist-mcp server:", error);
  process.exit(1);
});

const shutdown = async () => {
  await prisma.$disconnect();
  transport.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);


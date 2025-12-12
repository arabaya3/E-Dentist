"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
// =====================
//  API CONFIG & HELPERS
// =====================
// استخدام متغير البيئة إذا كان موجوداً، وإلا استخدم القيمة الافتراضية
const API_BASE = process.env.EDENTIST_API_BASE_URL ||
    "https://edentist-be-stage-576483531725.europe-west1.run.app/api/v1";
function buildUrl(path, query) {
    const url = new URL(path.replace(/^\//, ""), API_BASE + "/");
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null && value !== "") {
                url.searchParams.set(key, String(value));
            }
        }
    }
    return url.toString();
}
async function apiGet(path, query) {
    const url = buildUrl(path, query);
    console.log("[edentist-mcp] GET", url);
    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} - ${text}`);
    }
    return (await res.json());
}
async function apiPost(path, body) {
    const url = buildUrl(path);
    console.log("[edentist-mcp] POST", url, "body:", JSON.stringify(body));
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST ${url} failed: ${res.status} ${res.statusText} - ${text}`);
    }
    return (await res.json());
}
async function apiDelete(path, query) {
    const url = buildUrl(path, query);
    console.log("[edentist-mcp] DELETE", url);
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`DELETE ${url} failed: ${res.status} ${res.statusText} - ${text}`);
    }
    return (await res.json());
}
// =====================
//  MCP SERVER BASE
// =====================
const server = new mcp_js_1.McpServer({
    name: "edentist-mcp",
    version: "2.0.0-api-only",
});
const toNumber = (value) => typeof value === "number" ? value : Number.parseInt(value, 10);
const respond = (payload) => ({
    content: [{ type: "text", text: JSON.stringify(payload) }],
});
const respondSuccess = (data) => respond({ success: true, data });
const respondError = (error, meta) => {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    return respond({
        success: false,
        error: message,
        meta,
    });
};
const safeTool = (toolName, schema, handler) => async (rawInput) => {
    try {
        console.log(`[edentist-mcp] Tool ${toolName} received input:`, JSON.stringify(rawInput, null, 2));
        let inputToParse = rawInput ?? {};
        if (Array.isArray(inputToParse) && inputToParse.length > 0) {
            console.warn(`[edentist-mcp] Tool ${toolName} input is array, taking first element`);
            inputToParse = inputToParse[0];
        }
        if (typeof inputToParse === "string") {
            console.warn(`[edentist-mcp] Tool ${toolName} input is string, attempting JSON parse`);
            try {
                inputToParse = JSON.parse(inputToParse);
            }
            catch {
                inputToParse = { value: inputToParse };
            }
        }
        console.log(`[edentist-mcp] Tool ${toolName} parsing with schema...`);
        const parsed = schema.parse(inputToParse);
        console.log(`[edentist-mcp] Tool ${toolName} schema validation passed`);
        const data = await handler(parsed);
        return respondSuccess(data);
    }
    catch (error) {
        console.error(`[edentist-mcp] tool failure (${toolName}):`, error);
        return respondError(error);
    }
};
// =====================
//  SCHEMAS (Zod)
// =====================
// NOTE: عدّلنا هذا السكيمـا ليتوافق مع الـ API الحقيقي
const createAppointmentSchema = zod_1.z.object({
    clinicId: zod_1.z.number().int().positive(),
    doctorId: zod_1.z.string().min(1),
    start: zod_1.z.string().min(1), // ISO datetime
    end: zod_1.z.string().min(1), // ISO datetime
    userId: zod_1.z.number().int().positive(),
    patientName: zod_1.z.string().min(1).optional(),
    patientPhone: zod_1.z.string().min(3).optional(),
    patientEmail: zod_1.z.string().email().optional(),
    notes: zod_1.z.string().optional(),
});
// لا يوجد endpoint واضح للتحديث في الـ PDF، نخليها لكن بدون ربط حقيقي
const updateAppointmentSchema = zod_1.z.object({
    appointmentId: zod_1.z.union([
        zod_1.z.number().int().positive(),
        zod_1.z.string().regex(/^\d+$/),
    ]),
    doctorName: zod_1.z.string().min(1).optional(),
    clinicBranch: zod_1.z.string().min(1).optional(),
    patientName: zod_1.z.string().min(1).optional(),
    patientPhone: zod_1.z.string().min(3).optional(),
    appointmentDate: zod_1.z.string().optional(),
    appointmentTime: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
// عدّلنا هنا وأضفنا userId لأنه مطلوب في الـ DELETE API
const cancelAppointmentSchema = zod_1.z.object({
    appointmentId: zod_1.z.union([
        zod_1.z.number().int().positive(),
        zod_1.z.string().regex(/^\d+$/),
    ]),
    userId: zod_1.z.union([
        zod_1.z.number().int().positive(),
        zod_1.z.string().regex(/^\d+$/),
    ]),
    reason: zod_1.z.string().optional(),
    cancelledBy: zod_1.z.string().optional(),
});
// list_clinics الآن تستخدم /agnet/clinic مع فلاتر اختيارية
const listClinicsSchema = zod_1.z.object({
    country: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    limit: zod_1.z.number().int().positive().max(100).optional(),
});
// list_doctors → /agnet/clinic/doctors?clinicId=1
const listDoctorsSchema = zod_1.z.object({
    clinicId: zod_1.z.number().int().positive(),
    limit: zod_1.z.number().int().positive().max(100).optional(),
});
// هذه التولز حالياً ليست مربوطة بـ API موثّق
const validateVoucherSchema = zod_1.z.object({
    code: zod_1.z.string().min(3),
});
const logVoiceCallSchema = zod_1.z.object({
    agentId: zod_1.z.string().min(1),
    conversationId: zod_1.z.string().min(1),
    status: zod_1.z.string().min(1),
    provider: zod_1.z.string().optional(),
    clinicId: zod_1.z.number().int().positive().optional(),
    collectedData: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
});
const findUserByPhoneSchema = zod_1.z.object({
    phone: zod_1.z.string().min(3),
});
const findUserByNameSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    limit: zod_1.z.number().int().positive().max(50).optional(),
});
// عدّلنا لتتوافق مع API list appointments by user
const listUserAppointmentsSchema = zod_1.z.object({
    userId: zod_1.z.union([
        zod_1.z.number().int().positive(),
        zod_1.z.string().regex(/^\d+$/),
    ]),
    doctorId: zod_1.z.string().optional(),
    startFrom: zod_1.z.string().optional(), // ISO
    startTo: zod_1.z.string().optional(), // ISO
    limit: zod_1.z.number().int().positive().max(100).optional(),
});
// نترك search_appointments كـ placeholder حالياً
const searchAppointmentsSchema = zod_1.z.object({
    doctorName: zod_1.z.string().optional(),
    clinicBranch: zod_1.z.string().optional(),
    appointmentDate: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    patientName: zod_1.z.string().optional(),
    patientPhone: zod_1.z.string().optional(),
    limit: zod_1.z.number().int().positive().max(100).optional(),
});
// =====================
//  TOOLS IMPLEMENTATION
// =====================
// 1) CREATE APPOINTMENT -> POST /agnet/clinic/appointment
server.registerTool("create_appointment", {
    title: "Create appointment",
    description: "Creates a new appointment via eDentist backend API (no local DB).",
    inputSchema: createAppointmentSchema,
}, safeTool("create_appointment", createAppointmentSchema, async (input) => {
    const body = {
        clinicId: input.clinicId,
        doctorId: input.doctorId,
        start: input.start,
        end: input.end,
        patientName: input.patientName,
        patientPhone: input.patientPhone,
        patientEmail: input.patientEmail,
        notes: input.notes ?? "",
        userId: input.userId,
    };
    const data = await apiPost("/agnet/clinic/appointment", body);
    return data;
}));
// 2) UPDATE APPOINTMENT -> غير مدعومة في الـ API حالياً
server.registerTool("update_appointment", {
    title: "Update appointment",
    description: "Updates appointment fields (NOT IMPLEMENTED on external API yet).",
    inputSchema: updateAppointmentSchema,
}, safeTool("update_appointment", updateAppointmentSchema, async () => {
    throw new Error("update_appointment is not implemented against the external API yet. Use cancel_appointment + create_appointment instead.");
}));
// 3) CANCEL APPOINTMENT -> DELETE /agnet/clinic/appointment?userId=&appointmentId=
server.registerTool("cancel_appointment", {
    title: "Cancel appointment",
    description: "Cancels an appointment via eDentist backend API (no local DB).",
    inputSchema: cancelAppointmentSchema,
}, safeTool("cancel_appointment", cancelAppointmentSchema, async ({ appointmentId, userId, reason, cancelledBy }) => {
    const id = toNumber(appointmentId);
    const uid = toNumber(userId);
    const data = await apiDelete("/agnet/clinic/appointment", {
        appointmentId: id,
        userId: uid,
    });
    // نرجّع الـ response من الـ API + سبب الإلغاء لو حابب تستخدمه في النص
    return {
        apiResponse: data,
        cancellation: {
            reason,
            cancelledBy,
        },
    };
}));
// 4) LIST CLINICS -> GET /agnet/clinic
server.registerTool("list_clinics", {
    title: "List clinics",
    description: "Lists clinics via eDentist backend API with optional country/city/address filters.",
    inputSchema: listClinicsSchema,
}, safeTool("list_clinics", listClinicsSchema, async ({ country, city, address, limit }) => {
    const clinics = await apiGet("/agnet/clinic", {
        country,
        city,
        address,
    });
    if (limit) {
        return clinics.slice(0, limit);
    }
    return clinics;
}));
// 5) LIST DOCTORS -> GET /agnet/clinic/doctors?clinicId=1
server.registerTool("list_doctors", {
    title: "List doctors for a clinic",
    description: "Returns doctors for a clinic via eDentist backend API (requires clinicId).",
    inputSchema: listDoctorsSchema,
}, safeTool("list_doctors", listDoctorsSchema, async ({ clinicId, limit }) => {
    const doctors = await apiGet("/agnet/clinic/doctors", {
        clinicId,
    });
    if (limit) {
        return doctors.slice(0, limit);
    }
    return doctors;
}));
// 6) VALIDATE VOUCHER -> NOT CONNECTED TO API YET
server.registerTool("validate_voucher", {
    title: "Validate voucher",
    description: "Checks whether a voucher code is active (NOT IMPLEMENTED on API yet; no DB).",
    inputSchema: validateVoucherSchema,
}, safeTool("validate_voucher", validateVoucherSchema, async () => {
    throw new Error("validate_voucher is not connected to the external API. No local database is used.");
}));
// 7) LOG VOICE CALL -> console only
server.registerTool("log_voice_call", {
    title: "Log voice call",
    description: "Logs voice call metadata (currently only logs to console; no DB / API).",
    inputSchema: logVoiceCallSchema,
}, safeTool("log_voice_call", logVoiceCallSchema, async (input) => {
    console.log("[edentist-mcp] VOICE CALL LOG:", JSON.stringify(input, null, 2));
    return {
        logged: true,
        loggedAt: new Date().toISOString(),
        ...input,
    };
}));
// 8) FIND USER BY PHONE -> NOT IMPLEMENTED
server.registerTool("find_user_by_phone", {
    title: "Find user by phone",
    description: "Find user by phone (real API)",
    inputSchema: findUserByPhoneSchema,
}, safeTool("find_user_by_phone", findUserByPhoneSchema, async ({ phone }) => {
    return await apiGet("/user", { phone });
}));
// 9) FIND USER BY NAME -> NOT IMPLEMENTED
server.registerTool("find_user_by_name", {
    title: "Find user by name",
    description: "Searches users by name (NOT IMPLEMENTED on external API).",
    inputSchema: findUserByNameSchema,
}, safeTool("find_user_by_name", findUserByNameSchema, async () => {
    throw new Error("find_user_by_name is not connected to the external API. No local database is used.");
}));
// 10) LIST USER APPOINTMENTS -> GET /agnet/clinic/appointment/{userId}
server.registerTool("list_user_appointments", {
    title: "List appointments for a user",
    description: "Lists appointments for a user via eDentist backend API (userId required).",
    inputSchema: listUserAppointmentsSchema,
}, safeTool("list_user_appointments", listUserAppointmentsSchema, async ({ userId, doctorId, startFrom, startTo, limit }) => {
    const uid = toNumber(userId);
    const path = `/agnet/clinic/appointment/${uid}`;
    const appointments = await apiGet(path, {
        doctorId,
        startFrom,
        startTo,
    });
    if (limit) {
        return appointments.slice(0, limit);
    }
    return appointments;
}));
// 11) SEARCH APPOINTMENTS -> NOT IMPLEMENTED
server.registerTool("search_appointments", {
    title: "Search appointments",
    description: "Search appointments (NOT IMPLEMENTED on external API; use list_user_appointments instead).",
    inputSchema: searchAppointmentsSchema,
}, safeTool("search_appointments", searchAppointmentsSchema, async () => {
    throw new Error("search_appointments is not implemented against the external API. Use list_user_appointments with filters instead.");
}));
// FREE SLOTS TOOL
const freeSlotsSchema = zod_1.z.object({
    clinicId: zod_1.z.number().int().positive(),
    doctorId: zod_1.z.string().optional(),
    start: zod_1.z.string().min(1), // ISO datetime
    end: zod_1.z.string().min(1), // ISO datetime
});
server.registerTool("free_slots", {
    title: "Get free appointment slots",
    description: "Returns available appointment slots from the backend API for a clinic (optionally filtered by doctor).",
    inputSchema: freeSlotsSchema,
}, safeTool("free_slots", freeSlotsSchema, async ({ clinicId, doctorId, start, end }) => {
    const slots = await apiGet("/agnet/clinic/solt", {
        clinicId,
        doctorId,
        start,
        end,
    });
    return {
        clinicId,
        doctorId: doctorId ?? null,
        start,
        end,
        slots,
    };
}));
// =====================
//  TRANSPORT & LIFECYCLE
// =====================
const transport = new stdio_js_1.StdioServerTransport();
async function start() {
    await server.connect(transport);
    console.log("edentist-mcp server ready (stdio transport, API-only mode).");
}
start().catch((error) => {
    console.error("Failed to start edentist-mcp server:", error);
    process.exit(1);
});
const shutdown = async () => {
    transport.close();
    process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

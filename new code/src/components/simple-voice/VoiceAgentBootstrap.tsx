import { useEffect } from "react";
import {
  FunctionDeclaration,
  LiveServerToolCall,
  Modality,
  Type,
} from "@google/genai";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { GEMINI_LIVE_MODEL } from "../../config";
import {
  getPendingOtpUserId,
  sendOtp,
  verifyOtp,
} from "../../services/otp";

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/$/, "");
const withApiBase = (path: string) => `${API_BASE}${path}`;

/**
 * Calls backend MCP bridge - frontend NEVER talks to MCP directly
 */
async function callBackendTool(
  name: string,
  args: Record<string, unknown> = {}
) {
  const response = await fetch(withApiBase(`/api/mcp/tools/${encodeURIComponent(name)}`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args ?? {}),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch (error) {
    // ignore non-JSON bodies
  }

  if (!response.ok) {
    const extractedError =
      payload &&
      typeof payload === "object" &&
      payload !== null &&
      "error" in (payload as Record<string, unknown>) &&
      typeof (payload as Record<string, unknown>).error === "string"
        ? (payload as Record<string, string>).error
        : null;
    const errorMessage =
      (extractedError && extractedError.length
        ? extractedError
        : null) ?? `Tool ${name} failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  // MCP returns { content: [{ type: "text", text: JSON.stringify(result) }] }
  // Extract the actual data
  if (
    payload &&
    typeof payload === "object" &&
    "content" in payload &&
    Array.isArray((payload as any).content) &&
    (payload as any).content.length > 0 &&
    typeof (payload as any).content[0] === "object" &&
    "text" in (payload as any).content[0]
  ) {
    try {
      return JSON.parse((payload as any).content[0].text);
    } catch {
      return payload;
    }
  }

  return payload;
}

type NormalizedFunctionCall = {
  id?: string;
  toolCallId?: string;
  name: string;
  args: Record<string, unknown>;
};

/**
 * All MCP tools declared for Gemini Live
 * These MUST match the tools in mcp-server/src/index.ts
 */
const mcpToolDeclarations: FunctionDeclaration[] = [
  {
    name: "send_otp",
    description:
      "Send an OTP to the user's phone number. MUST be called only after collecting the phone number.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        phoneNumber: {
          type: Type.STRING,
          description: "Phone number in international format (e.g., +9627...).",
        },
      },
      required: ["phoneNumber"],
    },
  },
  {
    name: "verify_otp",
    description:
      "Verify an OTP code using the userId returned from send_otp.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userId: {
          type: Type.NUMBER,
          description: "userId returned from send_otp (required).",
        },
        code: {
          type: Type.STRING,
          description: "OTP code entered by the user (required).",
        },
      },
      required: ["userId", "code"],
    },
  },
  {
    name: "create_appointment",
    description:
      "⚠️ CRITICAL: This tool ACTUALLY CREATES a new dental appointment in the system. You MUST call this tool when the user wants to book an appointment AND you have collected all required data: clinicId, doctorId, start datetime, end datetime, userId, patientName, and patientPhone. This is the ONLY way to book appointments. Do NOT use log_voice_call instead.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        clinicId: {
          type: Type.NUMBER,
          description: "Numeric clinic ID where the appointment will take place.",
        },
        doctorId: {
          type: Type.STRING,
          description: "Doctor ID as returned by list_doctors.",
        },
        start: {
          type: Type.STRING,
          description:
            "Start datetime in ISO format, e.g. 2025-02-11T14:00:00.",
        },
        end: {
          type: Type.STRING,
          description:
            "End datetime in ISO format, e.g. 2025-02-11T14:30:00.",
        },
        userId: {
          type: Type.NUMBER,
          description:
            "Numeric user ID in the backend system (must be provided or inferred from context).",
        },
        patientName: {
          type: Type.STRING,
          description: "Full name of the patient.",
        },
        patientPhone: {
          type: Type.STRING,
          description: "Patient phone number.",
        },
        patientEmail: {
          type: Type.STRING,
          description: "Optional patient email.",
        },
        notes: {
          type: Type.STRING,
          description: "Optional notes or special requests.",
        },
      },
      required: [
        "clinicId",
        "doctorId",
        "start",
        "end",
        "userId",
        "patientName",
        "patientPhone",
      ],
    },
  },
  {
    name: "update_appointment",
    description:
      "Update an existing appointment. NOTE: Currently NOT implemented on the backend API. You should prefer cancel_appointment + create_appointment instead.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        appointmentId: {
          type: Type.STRING,
          description:
            "Appointment ID to update. This tool will usually throw an error because external API does not support updates yet.",
        },
        doctorName: { type: Type.STRING },
        clinicBranch: { type: Type.STRING },
        patientName: { type: Type.STRING },
        patientPhone: { type: Type.STRING },
        appointmentDate: { type: Type.STRING },
        appointmentTime: { type: Type.STRING },
        status: { type: Type.STRING },
        notes: { type: Type.STRING },
      },
      required: ["appointmentId"],
    },
  },
  {
    name: "cancel_appointment",
    description:
      "Cancel an appointment via eDentist backend API. You MUST have both appointmentId and userId.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        appointmentId: {
          type: Type.STRING,
          description: "The appointment ID to cancel (required).",
        },
        userId: {
          type: Type.STRING,
          description:
            "Numeric user ID in string form. REQUIRED by the backend API.",
        },
        reason: {
          type: Type.STRING,
          description: "Reason for cancellation.",
        },
        cancelledBy: {
          type: Type.STRING,
          description: "Who requested the cancellation (patient, clinic, etc).",
        },
      },
      required: ["appointmentId", "userId"],
    },
  },
  {
    name: "list_clinics",
    description:
      "List clinics via eDentist backend API. You can optionally filter by country, city, or address.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        country: {
          type: Type.STRING,
          description: "Optional country filter.",
        },
        city: {
          type: Type.STRING,
          description: "Optional city filter.",
        },
        address: {
          type: Type.STRING,
          description: "Optional address filter.",
        },
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of clinics to return (default: no limit).",
        },
      },
    },
  },
  {
    name: "list_doctors",
    description:
      "List doctors for a specific clinic using the eDentist backend API. clinicId is REQUIRED.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        clinicId: {
          type: Type.NUMBER,
          description: "Clinic ID to list doctors for (required).",
        },
        limit: {
          type: Type.NUMBER,
          description:
            "Maximum number of doctors to return (default: no limit).",
        },
      },
      required: ["clinicId"],
    },
  },
  {
    name: "validate_voucher",
    description:
      "Validate a voucher code. NOTE: Currently NOT connected to the external API and will likely fail.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        code: {
          type: Type.STRING,
          description: "Voucher code to validate.",
        },
      },
      required: ["code"],
    },
  },

  {
    name: "list_user_appointments",
    description:
      "List appointments for a user by userId via eDentist backend API.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userId: {
          type: Type.STRING,
          description:
            "User ID (string) – will be converted to number in the MCP server.",
        },
        doctorId: {
          type: Type.STRING,
          description: "Optional doctorId filter.",
        },
        startFrom: {
          type: Type.STRING,
          description: "Optional ISO datetime filter: start from.",
        },
        startTo: {
          type: Type.STRING,
          description: "Optional ISO datetime filter: start to.",
        },
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of appointments to return.",
        },
      },
      required: ["userId"],
    },
  },
  {
    name: "search_appointments",
    description:
      "Search appointments (NOT implemented on the external API; MCP will throw an error). Use list_user_appointments instead.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        doctorName: { type: Type.STRING },
        clinicBranch: { type: Type.STRING },
        appointmentDate: { type: Type.STRING },
        status: { type: Type.STRING },
        patientName: { type: Type.STRING },
        patientPhone: { type: Type.STRING },
        limit: { type: Type.NUMBER },
      },
    },
  },
  {
    name: "log_voice_call",
    description:
      "⚠️ IMPORTANT: This tool is ONLY for logging metadata about a voice call session. It does NOT create appointments. If the user wants to book an appointment, you MUST use create_appointment instead. Only use log_voice_call at the END of a session to log call metadata.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        agentId: {
          type: Type.STRING,
          description: "Agent identifier (required).",
        },
        conversationId: {
          type: Type.STRING,
          description: "Conversation/session identifier (required).",
        },
        status: {
          type: Type.STRING,
          description: "Call status (required).",
        },
        provider: {
          type: Type.STRING,
          description: "Voice provider (e.g., ELEVEN_LABS).",
        },
        clinicId: {
          type: Type.NUMBER,
          description: "Clinic ID associated with the call.",
        },
        collectedData: {
          type: Type.OBJECT,
          description: "Additional data collected during the call.",
        },
        metadata: {
          type: Type.OBJECT,
          description: "Additional metadata for the call.",
        },
      },
      required: ["agentId", "conversationId", "status"],
    },
  },
  // NEW: free_slots
  {
    name: "free_slots",
    description:
      "Get available appointment slots for a clinic (and optionally a specific doctor) between two datetimes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        clinicId: {
          type: Type.NUMBER,
          description: "Clinic ID to check availability for (required).",
        },
        doctorId: {
          type: Type.STRING,
          description: "Optional doctorId to filter by doctor.",
        },
        start: {
          type: Type.STRING,
          description:
            "Start datetime in ISO format for availability search.",
        },
        end: {
          type: Type.STRING,
          description:
            "End datetime in ISO format for availability search.",
        },
      },
      required: ["clinicId", "start", "end"],
    },
  },
];


const MCP_TOOL_NAMES = new Set(mcpToolDeclarations.map((t) => t.name));
const AUTH_TOOL_NAMES = new Set([
  "sendOtp",
  "verifyOtp",
  "send_otp",
  "verify_otp"
]);

const MCP_BACKEND_TOOL_NAMES = new Set(
  mcpToolDeclarations
    .map((t) => t.name)
    .filter((name): name is string => typeof name === "string")
    .filter((name) => !AUTH_TOOL_NAMES.has(name))
);

function normalizeToolCalls(
  toolCall: LiveServerToolCall
): NormalizedFunctionCall[] {
  if (toolCall.functionCalls?.length) {
    return toolCall.functionCalls
      .filter((call): call is typeof call & { name: string } => {
        return typeof call.name === "string" && call.name.length > 0;
      })
      .map((call) => {
        const normalized = {
          id: call.id,
          toolCallId: (toolCall as unknown as { toolCallId?: string })
            ?.toolCallId,
          name: call.name,
          args: (call.args as Record<string, unknown>) ?? {},
        };
        // Debug: Log what we're extracting
        console.log(`[voice-agent] Normalized tool call:`, {
          name: normalized.name,
          args: normalized.args,
          rawArgs: call.args,
        });
        return normalized;
      });
  }

  const singleName = (toolCall as unknown as { name?: string })?.name;
  if (typeof singleName === "string" && singleName.length) {
    return [
      {
        name: singleName,
        args: (toolCall as unknown as { args?: Record<string, unknown> })
          ?.args ?? {},
        toolCallId: (toolCall as unknown as { toolCallId?: string })?.toolCallId,
      },
    ];
  }

  return [];
}

const renderAltairDeclaration: FunctionDeclaration = {
  name: "render_altair",
  description: "Displays an altair graph in json format.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      json_graph: {
        type: Type.STRING,
        description:
          "JSON STRING representation of the graph to render. Must be a string, not a json object",
      },
    },
    required: ["json_graph"],
  },
};

const DEFAULT_REQUIRED_FIELDS = ["name", "phone"];


type AgentConfigPayload = {
  agentId?: string;
  agentName?: string | null;
  clinicName?: string | null;
  welcomeMessage?: string | null;
  initialGreetingMessage?: string | null;
  requiredInfo?: unknown;
};

function extractRequiredFields(
  source: AgentConfigPayload["requiredInfo"]
): string[] {
  if (!source) {
    return DEFAULT_REQUIRED_FIELDS;
  }

  if (Array.isArray(source)) {
    return source.map((item) => String(item));
  }

  if (typeof source === "object" && source !== null) {
    const fields = (source as Record<string, unknown>).fields;
    if (Array.isArray(fields)) {
      return fields.map((item) => String(item));
    }
  }

  return DEFAULT_REQUIRED_FIELDS;
}

export default function VoiceAgentBootstrap() {
  const { client, setConfig, setModel } = useLiveAPIContext();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setModel(GEMINI_LIVE_MODEL);

      let agentConfig: AgentConfigPayload | null = null;

      try {
        const response = await fetch(withApiBase("/api/agent/config"));
        if (response.ok) {
          const payload = await response.json();
          agentConfig = payload?.config ?? null;
        } else {
          console.warn(
            `[voice-agent] Failed to load agent config: ${response.status}`
          );
        }
      } catch (error) {
        console.warn("[voice-agent] Error loading agent config:", error);
      }

      if (cancelled) {
        return;
      }

      const conciergeName =
        agentConfig?.agentName?.trim() || "the eDentist.AI concierge";
      const clinicName =
        agentConfig?.clinicName?.trim() || "your dental clinic";
      const requiredFields = extractRequiredFields(agentConfig?.requiredInfo);

      // CRITICAL: System instruction that prevents hallucination
      const systemInstruction = `You are medical bot — a bilingual (Arabic/English) voice concierge representing ${clinicName}.
 
      Active concierge persona: ${conciergeName}.
       
      ## CRITICAL RULES - YOU MUST FOLLOW THESE:
       
      1. **YOU MUST use tools for ALL operations involving:**
         - Appointments (create, update, cancel, search, list)
         - Doctors (list, search)
         - Clinics (list, search)
         - Vouchers (validate)
         - Users (find by phone, find by name)
         - Voice call logs (log_voice_call)
       
      2. **YOU MUST NOT answer from your own knowledge.**
         - The database accessed through MCP tools is the ONLY source of truth.
         - Whenever the user asks something related to the database, you MUST call the corresponding tool.
         - Never invent or assume answers.
         - If needed information is missing, ask the user to clarify.
       
      3. **Examples of when you MUST use tools:**
         - User asks "What doctors are available?" → Call list_doctors
         - User asks "Do I have an appointment?" → Call list_user_appointments or search_appointments
         - User wants to book → ⚠️ CRITICAL: Call create_appointment (after collecting all required fields)
           * Example: User says "I want to book" and you have: patientName="mohammad", patientPhone="+962781228314", clinicId=1, doctorId="doc123", start="2025-02-11T14:00:00", end="2025-02-11T14:30:00", userId=123
           * ✅ CORRECT: Call create_appointment with all this data
           * ❌ WRONG: Calling log_voice_call instead - this does NOT book the appointment!
         - User mentions a voucher → Call validate_voucher
         - User asks about clinics → Call list_clinics
       
      4. **Never guess or assume:**
         - If you don't have data from a tool call, you cannot answer.
         - Always call the appropriate tool first, then respond based on the tool's result.
       
       
      ## APPOINTMENT EDITING / CANCELLATION RULES
       
      1. When the user wants to:
         - cancel an appointment  
         - modify / reschedule an appointment  
       
         You MUST NOT ask for "appointment ID".
       
      2. Instead:
         - If there is only **one** upcoming appointment → operate on that one directly.
         - If there are **multiple** → ask only:
           “Which appointment do you mean? When is it scheduled?”
       
      3. After identifying the appointment:
         - For cancellation → use \`cancel_appointment\`
         - For rescheduling → ask:
           “When would you like to move it to?”
           Then call:
           \`update_appointment\`
       
      4. NEVER request appointment ID from the user. IDs are internal and retrieved ONLY through MCP tools.
       
      5. You MUST NOT allow booking or rescheduling to **any past date or time** (earlier than the current date/time).
         If the user requests a past date, respond:
         “I’m sorry, I can’t schedule an appointment in the past. Would you like me to check the nearest available time instead?”
       
       
      When responding in Arabic:
      - You MUST NEVER use Arabic or Western digits (0–9) in your output. Not in any form.
      - You MUST convert every number into fully written Arabic words.
      - You MUST convert times into natural spoken Arabic.
      - You MUST convert dates into full written Arabic.
      - You MUST convert phone numbers digit-by-digit into words.
      - You MUST convert all durations into Arabic words.
      - Any Arabic output containing digits MUST be regenerated.
       
       
      ## Arabic Dialect Handling:
      - Detect the caller’s dialect from the first 1–2 messages.
      - Respond using the same dialect.
      - Do NOT switch dialects unless the user explicitly asks.
       
       
      ## Operating Modes (Patient vs Clinic Owner)
       
      At the start of the session, ask the caller whether they are:
      1. A patient  
      2. A clinic owner/manager  
       
      Follow the corresponding mode rules exactly.
       
      ### Patient Mode:
      - Handle appointment bookings, cancellations, modifications.
      - Use ONLY database + MCP tools.
      - Follow all Arabic grammar, dialect, and digit-conversion rules.
       
      ### Clinic Owner Mode:
      - Explain clinic management features.
      - Show capabilities related to operations, analytics, physicians, and patients.
      - Avoid assumptions; always rely on tool data.
       
       
      ## Session Kickoff:
      - Start with a generic greeting (not from the database).
      - If Arabic → “أهلاً وسهلاً في عيادتنا! كيف بقدر أساعدك اليوم؟”
      - If English → “Welcome to our clinic! How can I assist you today?”
       
       
      ## Core responsibilities:
      - It is MANDATORY to capture and confirm ALL required fields: ${requiredFields.join(", ")}.
       
       
      ## ⚠️ CRITICAL: Appointment Booking vs Call Logging
      
      **NEVER confuse these two tools:**
      
      1. **create_appointment** = Actually books an appointment in the system
         - Use when: User wants to book an appointment AND you have all required data
         - Required data: clinicId, doctorId, start, end, userId, patientName, patientPhone
         - This CREATES the actual appointment
      
      2. **log_voice_call** = Only logs metadata about the call (for analytics/records)
         - Use when: At the END of a session to log call information
         - Does NOT create appointments
         - Does NOT affect bookings
         - This is ONLY for logging purposes
      
      **CORRECT FLOW when user wants to book:**
      1. Collect all required booking data
      2. Call create_appointment FIRST (this actually books it)
      3. If create_appointment succeeds, optionally call log_voice_call at session end
      4. NEVER call log_voice_call INSTEAD of create_appointment
       
       
      ## Booking Flow (MUST FOLLOW STEP-BY-STEP):
       
      1. Determine the goal.
      2. For NEW BOOKINGS, collect:
         - clinicId
         - doctorId
         - exact date
         - exact time
         - userId
         - patientName
         - patientPhone
       
      3. Tool usage order:
         a) list_clinics  
         b) list_doctors  
         c) free_slots  
         d) confirm slot  
         e) create_appointment  ⚠️ CRITICAL: You MUST call create_appointment when all data is collected
       
      4. NEVER call create_appointment with missing data.
       
      5. ⚠️ CRITICAL RULE: When you have collected patientName, patientPhone, clinicId, doctorId, date, and time:
         - You MUST call create_appointment FIRST to actually book the appointment
         - ONLY AFTER create_appointment succeeds, you may call log_voice_call to log the session
         - log_voice_call is ONLY for logging metadata, NOT for booking appointments
         - NEVER use log_voice_call as a substitute for create_appointment
       
      6. For cancellations:
         - (Your OTP rules update overrides this — use the updated OTP flow instead.)
       
       
      ## OTP Authentication Flow (ALWAYS ENFORCE):
       
      - Phone-first:
        - After phone → send_otp
        - Then request OTP
        - Then verify_otp
      - NEVER accept OTP before phone number.
      - After verify_otp success → authenticated.
       
       
      ## Tool Usage Policy:
      - Use create_appointment, update_appointment, cancel_appointment to reflect real booking changes.
      - Use list_clinics / list_doctors for availability.
      - Use find_user_by_phone ONLY AFTER OTP verification.
      - Use list_user_appointments or search_appointments to find user bookings.
      - ⚠️ CRITICAL: log_voice_call is ONLY for logging session metadata at the END of a call
      - ⚠️ NEVER use log_voice_call instead of create_appointment
      - ⚠️ When user wants to book: FIRST call create_appointment, THEN optionally log_voice_call
      - ⚠️ If you have all booking data (patientName, patientPhone, clinicId, doctorId, date, time) → You MUST call create_appointment
       
       
      ## Time & Date Rules (Amman UTC+3 ONLY):
      - ALWAYS use Jordan local time.
      - Convert all natural-language dates accordingly.
       
       
      ## Language & Dialect Behavior Rules:
      - Respond in the same language the user uses.
      - Maintain the same tone and dialect throughout the session.
       
      REMEMBER: Database is the ONLY source of truth. Always use tools. Never hallucinate.
      `;
       
      setConfig({
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede",
            },
          },
        },
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        tools: [
          {
            functionDeclarations: [
              renderAltairDeclaration,
              ...mcpToolDeclarations,
            ],
          },
        ],
      });
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [setConfig, setModel]);

  useEffect(() => {
    /**
     * Universal tool call handler
     * Routes ALL tool calls → Backend MCP Bridge → MCP Server → Prisma
     */
    const handleToolCall = async (toolCall: LiveServerToolCall) => {
      const normalizedCalls = normalizeToolCalls(toolCall);
      if (!normalizedCalls.length) {
        return;
      }

      // Process each tool call
      for (const call of normalizedCalls) {
        // Handle render_altair separately
        if (call.name === "render_altair") {
          const graphPayload =
            typeof call.args["json_graph"] === "string"
              ? (call.args["json_graph"] as string)
              : null;
          if (graphPayload) {
            console.info(
              "[voice-agent] Received Altair graph payload:",
              graphPayload
            );
          }

          const responseId =
            call.id ??
            call.toolCallId ??
            crypto.randomUUID?.() ??
            Date.now().toString();
          client.sendToolResponse({
            functionResponses: [
              {
                response: { output: { success: true } },
                id: responseId,
                name: call.name,
              },
            ],
          });
          continue;
        }
        if (call.name === "find_user_by_phone") {
          if (!getPendingOtpUserId()) {
            console.warn("[voice-agent] BLOCKED find_user_by_phone before OTP");
            // force send_otp instead
            const phone = call.args["phone"] || call.args["phoneNumber"];
            return await handleToolCall({
              name: "send_otp",
              args: { phoneNumber: phone }
            } as any);
          }
        }
        

        // Handle OTP tools locally (no MCP hop)
        if (AUTH_TOOL_NAMES.has(call.name)) {
          try {
            const toolCallId =
              call.toolCallId ??
              call.id ??
              crypto.randomUUID?.() ??
              Date.now().toString();

            let result: unknown;
            if (call.name === "send_otp") {
              const phoneArg =
                (call.args["phoneNumber"] as string | undefined) ??
                (call.args["phone"] as string | undefined) ??
                "";
              result = await sendOtp(phoneArg);
            } else {
              const userIdArg =
                (call.args["userId"] as number | string | undefined) ??
                getPendingOtpUserId();
              const codeArg =
                (call.args["code"] as string | undefined) ??
                (call.args["otp"] as string | undefined) ??
                "";
              result = await verifyOtp({
                userId: userIdArg,
                code: codeArg,
              });
            }

            const wrappedResult = {
              content: [
                {
                  type: "text",
                  text:
                    typeof result === "string"
                      ? result
                      : JSON.stringify(result ?? null),
                },
              ],
            };

            client.sendToolResponse({
              functionResponses: [
                {
                  id: toolCallId,
                  name: call.name,
                  response: {
                    output: wrappedResult,
                  },
                },
              ],
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown OTP error";
            const toolCallId =
              call.toolCallId ??
              call.id ??
              crypto.randomUUID?.() ??
              Date.now().toString();
            client.sendToolResponse({
              functionResponses: [
                {
                  id: toolCallId,
                  name: call.name,
                  response: {
                    output: {
                      content: [
                        {
                          type: "text",
                          text: JSON.stringify({
                            success: false,
                            error: message,
                          }),
                        },
                      ],
                    },
                  },
                },
              ],
            });
          }
          continue;
        }

        // Handle MCP tools - route to backend (exclude auth/OTP tools)
        if (MCP_BACKEND_TOOL_NAMES.has(call.name)) {
          try {
            console.log(
              `[voice-agent] Calling MCP tool: ${call.name}`,
              call.args
            );

            // Call backend MCP bridge
            const result = await callBackendTool(call.name, call.args ?? {});

            // Extract toolCallId for response
            const toolCallId =
              call.toolCallId ??
              call.id ??
              crypto.randomUUID?.() ??
              Date.now().toString();

            // Send response back to Gemini
            // MCP returns { content: [{ type: "text", text: JSON.stringify(data) }] }
            // We need to wrap it properly for Gemini
            const wrappedResult = {
              content: [
                {
                  type: "text",
                  text:
                    typeof result === "string"
                      ? result
                      : JSON.stringify(result ?? null),
                },
              ],
            };

            client.sendToolResponse({
              functionResponses: [
                {
                  id: toolCallId,
                  name: call.name,
                  response: {
                    output: wrappedResult,
                  },
                },
              ],
            });

            console.log(
              `[voice-agent] MCP tool ${call.name} completed successfully`
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown MCP error";
            console.error(
              `[voice-agent] MCP tool ${call.name} failed:`,
              error
            );

            const toolCallId =
              call.toolCallId ??
              call.id ??
              crypto.randomUUID?.() ??
              Date.now().toString();

            // Send error response
            client.sendToolResponse({
              functionResponses: [
                {
                  id: toolCallId,
                  name: call.name,
                  response: {
                    output: {
                      content: [
                        {
                          type: "text",
                          text: JSON.stringify({
                            success: false,
                            error: message,
                          }),
                        },
                      ],
                    },
                  },
                },
              ],
            });
          }
        } else {
          console.warn(
            `[voice-agent] Unknown tool called: ${call.name}, ignoring`
          );
        }
      }
    };

    client.on("toolcall", handleToolCall);

    return () => {
      client.off("toolcall", handleToolCall);
    };
  }, [client]);

  return null;
}

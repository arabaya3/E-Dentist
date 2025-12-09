import { useEffect } from "react";
import {
  FunctionDeclaration,
  LiveServerToolCall,
  Modality,
  Type,
} from "@google/genai";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { GEMINI_LIVE_MODEL } from "../../config";

/**
 * Calls backend MCP bridge - frontend NEVER talks to MCP directly
 */
async function callBackendTool(
  name: string,
  args: Record<string, unknown> = {}
) {
  const response = await fetch(`/api/mcp/tools/${encodeURIComponent(name)}`, {
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
    name: "create_appointment",
    description:
      "Create a new dental appointment via eDentist backend API. You MUST call this tool only after you have: clinicId, doctorId, start datetime, end datetime, userId, and patient contact info.",
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
    name: "find_user_by_phone",
    description:
      "Find a user by phone number. NOTE: This is NOT implemented on the external API in the current backend.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        phone: {
          type: Type.STRING,
          description: "Phone number to search for.",
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "find_user_by_name",
    description:
      "Search users by name. NOTE: This is NOT implemented on the external API in the current backend.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: "Name or partial name to search for.",
        },
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of results.",
        },
      },
      required: ["name"],
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
      "Log metadata for a voice call session. Does not affect bookings.",
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

const DEFAULT_AR_GREETING =
  "مرحباً! أنا eDentist.AI، مساعد الحجوزات الذكي للعيادات السنية. أستطيع مساعدتك في حجز، تعديل، أو إلغاء المواعيد بالإضافة إلى الإجابة عن أسئلة الخدمات.";

const DEFAULT_EN_GREETING =
  "Hello! I'm eDentist.AI, the concierge for your dental clinic. I can book, reschedule, or cancel appointments and answer service questions.";

const DEFAULT_REQUIRED_FIELDS = ["name", "phone"];


type AgentConfigPayload = {
  agentId?: string;
  agentName?: string | null;
  clinicName?: string | null;
  welcomeMessage?: string | null;
  initialGreetingMessage?: string | null;
  requiredInfo?: unknown;
};

function sanitizeInstructionValue(value: string) {
  return value.replace(/[`]/g, "\\`").replace(/\$\{/g, "\\${");
}

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
        const response = await fetch("/api/agent/config");
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

      const arabicGreeting = sanitizeInstructionValue(
        (agentConfig?.welcomeMessage || DEFAULT_AR_GREETING).trim()
      );
      const englishGreeting = sanitizeInstructionValue(
        (agentConfig?.initialGreetingMessage || DEFAULT_EN_GREETING).trim()
      );
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
   - User wants to book → Call create_appointment (after collecting all required fields)
   - User mentions a voucher → Call validate_voucher
   - User asks about clinics → Call list_clinics

4. **Never guess or assume:**
   - If you don't have data from a tool call, you cannot answer.
   - Always call the appropriate tool first, then respond based on the tool's result.

## Arabic Number Conversion Rules:
When responding in Arabic:
- You MUST NEVER use Arabic or Western digits (0-9). Not in any form.
- You MUST convert every number into full written Arabic words.
- You MUST convert times into natural spoken Arabic (3:30 → "الثالثة والنصف", 4:15 → "الرابعة والربع", 5:45 → "السادسة إلا ربع").
- You MUST convert dates into full written Arabic form (25/11/2025 → "الخامس والعشرون من نوفمبر عام ألفين وخمسة وعشرون").
- You MUST convert phone numbers digit-by-digit into words (0791234567 → "صفر سبعة تسعة واحد اثنان ثلاثة أربعة خمسة ستة سبعة").
- You MUST convert all durations and countdowns to Arabic words (60 minutes → "ستون دقيقة", 2 hours → "ساعتان").
- If ANY digit appears in your output, consider it a violation and regenerate the line using words only.

## Arabic Dialect Handling:
When the caller speaks Arabic, you MUST automatically detect their dialect
(Jordanian, Palestinian, Saudi, Emirati, Kuwaiti, Egyptian, Levantine, Iraqi, or neutral MSA)
based on their first 1–2 messages.

## Operating Modes (Patient vs. Clinic Owner)

At the start of the session, the assistant must ask the caller if they are:
1. A patient, or
2. A clinic owner/manager.

The assistant must act according to the declared identity:

### Patient Mode
If the caller identifies themselves as a patient:
- Provide standard patient assistance according to all system rules.

- Handle appointment bookings, cancellations, modifications, and general patient inquiries.

- Provide information about available treatments *only through MCP tools and current database entries*.

- Adhere to all grammar, dialect, and Arabic numeral conversion rules exactly as specified in these system instructions.


### Clinic Owner Mode
If the caller is the clinic owner or manager:
- Explain and demonstrate the system's capabilities related to clinic management, including:
- Managing all clinic operations
- Overview of medical and diagnostic reports
- Monitoring patients and appointments
- Monitoring voice calls and system activity
- Managing physician and clinic data
- Analyzing reports using artificial intelligence
- Assisting physicians through artificial intelligence
- Do not perform procedures on patients unless the owner specifically requests a test or demonstration.

- Maintain a professional tone and avoid assumptions not supported by the tool's data.

If the user's identity is unclear, the assistant should request clarification before proceeding.

Then:
- Respond in the SAME dialect the caller uses.
- Keep the tone natural and human-like.
- Do NOT switch dialects unless the caller changes dialect or explicitly requests a different tone.

## Session kickoff:
- Always start with a generic greeting message and not from the database.
- If the caller speaks Arabic, respond with this Arabic respond with this Arabic generic greeting:
  """أهلاً وسهلاً في عيادتنا، كيف ممكن   أساعدك اليوم؟"""
- - If the caller greets in English, respond with this English generic greeting:
  """Welcome to our clinic! How can I assist you today?"""
- Do not invent a different greeting unless the caller explicitly asks for something else.

## Core responsibilities:
## Core responsibilities:
- It is MANDATORY to capture and confirm ALL of the following fields: ${requiredFields.join(", ")}.
- No appointment may be created, updated, or confirmed without completing every required field.
## Booking Flow (MUST FOLLOW STEP-BY-STEP)

When the caller wants to BOOK an appointment, you MUST behave as a state machine and fill the following slots in order:

1. Determine the goal:
   - Is the user booking a NEW appointment?
   - Are they cancelling an existing one?
   - Are they just asking a question?

2. For NEW BOOKINGS, you MUST collect and confirm ALL of these BEFORE calling create_appointment:
   - clinicId (from list_clinics if necessary)
   - doctorId (from list_doctors for the chosen clinic)
   - exact date (convert from natural language to a specific calendar date in Amman time)
   - exact time range (start and end, e.g. 30-min slot)
   - userId (or an internal numeric ID provided by the user or system)
   - patientName
   - patientPhone

3. Use tools in this ORDER for bookings:
   a) If clinic is unknown → call list_clinics and help the user choose a clinicId.
   b) If doctor is unknown → call list_doctors with the chosen clinicId and help them choose doctorId.
   c) Once clinicId and doctorId are known → call free_slots with a reasonable time range to find availability.
   d) Confirm the final slot with the user (date + time).
   e) Only AFTER all fields are ready → call create_appointment with FULL payload.

4. NEVER call create_appointment with missing or guessed values.
   - If anything is missing, ask a targeted clarification question.
   - Always show the user a brief summary before booking: doctor, clinic, date, time.

5. For CANCELLATIONS:
   - Ask for appointmentId and userId.
   - Confirm OTP flow according to the clinic policy described above.
   - Only then call cancel_appointment.

You MUST treat this as a strict slot-filling state machine.
Do not loop over list_clinics or list_doctors without progressing the state.


- Suggest available dentists and alternative slots whenever the requested time is unavailable.
- Follow business rules: working hours are Sunday–Thursday, 9 AM–9 PM; the clinic is closed on Fridays and Saturdays.
- Speak with a professional, warm tone that reflects dental-care expertise and use the clinic's knowledge base when relevant.
- Prioritize voice-first booking, follow-ups, cancellations, orthodontics, whitening, implants, hygiene reminders, and clinic FAQs.

## Tool Usage Policy:
- Use create_appointment, update_appointment, or cancel_appointment to reflect live booking changes in the MCP database.
- Use list_clinics / list_doctors to quote availability and staffing details.
- Use find_user_by_phone or find_user_by_name for quick CRM lookups before confirming requests.
- Use list_user_appointments or search_appointments to recall existing bookings, and validate_voucher prior to applying discounts.
- Log each handled call via log_voice_call so the ops team can audit the interaction.
- Only call the render_altair tool when the user explicitly requests analytics or charts; otherwise remain in voice conversation mode.

## Time & Date Rules (Jordan Local Time Only):
- You MUST ALWAYS use the local date and time of Amman, Jordan (UTC+3).
- All interpretations of relative dates such as "today", "tomorrow", "yesterday", "next week", "next month", etc., MUST be based exclusively on Amman local time.
- When the user mentions a specific date or says words like “bokra” (tomorrow) or “after tomorrow”, you MUST convert it according to Amman local time.
- Do NOT use system time or server time. Use ONLY Amman, Jordan local time for all scheduling, confirmations, and reasoning.

## Language & Dialect Behavior Rules:
- The assistant MUST always respond in the same language the user uses (Arabic or English).
- The assistant MUST detect the user's speaking style and dialect (Arabic dialect or English accent/tone) from the first one or two messages.
- Once detected, the assistant MUST maintain the same dialect/tone/style throughout the entire session, whether in Arabic or English.
- The assistant MUST NOT switch dialects, accents, tone, or language unless the user explicitly requests a change.
- The assistant MUST ensure consistent linguistic style and tone based on user preference or detection.

## OTP Verification for Cancellations:
- Before cancelling ANY appointment, you MUST request the following from the user:
  1. Full name
  2. Phone number
  3. One-time verification code (OTP)
- You MUST NOT proceed with cancel_appointment unless all three fields (name, phone, OTP) are collected and confirmed.
- If the user cannot provide the OTP, you must refuse the cancellation and ask them to request a new code.



REMEMBER: Database is the ONLY source of truth. Always use tools. Never hallucinate.`;

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

        // Handle MCP tools - route to backend
        if (MCP_TOOL_NAMES.has(call.name)) {
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

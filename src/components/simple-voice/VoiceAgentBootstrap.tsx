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
      "Create a new dental appointment. REQUIRED: doctorName, clinicBranch, patientName, patientPhone, serviceType, appointmentDate, appointmentTime. Database is the only source of truth - use this tool to create appointments.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        doctorName: {
          type: Type.STRING,
          description: "Full name of the doctor for this appointment.",
        },
        clinicBranch: {
          type: Type.STRING,
          description: "Clinic location or branch name.",
        },
        patientName: {
          type: Type.STRING,
          description: "Full name of the patient.",
        },
        patientPhone: {
          type: Type.STRING,
          description: "Patient's contact phone number.",
        },
        serviceType: {
          type: Type.STRING,
          description: "Type of dental service (e.g., cleaning, whitening, orthodontics, implants).",
        },
        appointmentDate: {
          type: Type.STRING,
          description: "Appointment date (ISO format or natural language).",
        },
        appointmentTime: {
          type: Type.STRING,
          description: "Appointment time (e.g., '15:30', '3 PM', 'afternoon').",
        },
        status: {
          type: Type.STRING,
          description: "Optional appointment status (defaults to 'confirmed').",
        },
        notes: {
          type: Type.STRING,
          description: "Additional notes or special requests.",
        },
        otp: {
          type: Type.STRING,
          description: "Optional verification code if required by clinic policy.",
        },
      },
      required: [
        "doctorName",
        "clinicBranch",
        "patientName",
        "patientPhone",
        "serviceType",
        "appointmentDate",
        "appointmentTime",
      ],
    },
  },
  {
    name: "update_appointment",
    description:
      "Update an existing appointment. REQUIRED: appointmentId. Provide only the fields to update. Database is the only source of truth - use this tool to modify appointments.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        appointmentId: {
          type: Type.STRING,
          description: "The appointment ID to update (required).",
        },
        doctorName: { type: Type.STRING, description: "Updated doctor name." },
        clinicBranch: {
          type: Type.STRING,
          description: "Updated clinic branch.",
        },
        patientName: { type: Type.STRING, description: "Updated patient name." },
        patientPhone: {
          type: Type.STRING,
          description: "Updated patient phone.",
        },
        serviceType: {
          type: Type.STRING,
          description: "Updated service type.",
        },
        appointmentDate: {
          type: Type.STRING,
          description: "Updated appointment date.",
        },
        appointmentTime: {
          type: Type.STRING,
          description: "Updated appointment time.",
        },
        status: { type: Type.STRING, description: "Updated status." },
        notes: { type: Type.STRING, description: "Updated notes." },
      },
      required: ["appointmentId"],
    },
  },
  {
    name: "cancel_appointment",
    description:
      "Cancel an appointment. REQUIRED: appointmentId. Database is the only source of truth - use this tool to cancel appointments.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        appointmentId: {
          type: Type.STRING,
          description: "The appointment ID to cancel (required).",
        },
        reason: {
          type: Type.STRING,
          description: "Reason for cancellation.",
        },
        cancelledBy: {
          type: Type.STRING,
          description: "Who requested the cancellation.",
        },
      },
      required: ["appointmentId"],
    },
  },
  {
    name: "list_clinics",
    description:
      "List all available clinics. Database is the only source of truth - use this tool to get clinic information.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of clinics to return (default: 50).",
        },
      },
    },
  },
  {
    name: "list_doctors",
    description:
      "List doctors available at clinics. Database is the only source of truth - use this tool to get doctor information.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        clinicId: {
          type: Type.NUMBER,
          description: "Optional clinic ID to filter doctors.",
        },
        includeClinic: {
          type: Type.BOOLEAN,
          description: "Include clinic details with each doctor.",
        },
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of doctors to return (default: 50).",
        },
      },
    },
  },
  {
    name: "validate_voucher",
    description:
      "Validate a voucher code. REQUIRED: code. Database is the only source of truth - use this tool to check voucher validity.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        code: {
          type: Type.STRING,
          description: "Voucher code to validate (required).",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "find_user_by_phone",
    description:
      "Find a user by phone number. REQUIRED: phone. Database is the only source of truth - use this tool to look up users.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        phone: {
          type: Type.STRING,
          description: "Phone number to search for (required).",
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "find_user_by_name",
    description:
      "Search for users by name. REQUIRED: name. Database is the only source of truth - use this tool to search users.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: "Name or partial name to search for (required).",
        },
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of results (default: 25).",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_user_appointments",
    description:
      "List appointments for a patient. Provide either patientPhone or patientName. Database is the only source of truth - use this tool to get patient appointments.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        patientPhone: {
          type: Type.STRING,
          description: "Patient phone number to filter by.",
        },
        patientName: {
          type: Type.STRING,
          description: "Patient name to filter by.",
        },
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of appointments to return (default: 50).",
        },
      },
    },
  },
  {
    name: "search_appointments",
    description:
      "Search appointments by various criteria. Database is the only source of truth - use this tool to search appointments.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        doctorName: { type: Type.STRING, description: "Filter by doctor name." },
        clinicBranch: {
          type: Type.STRING,
          description: "Filter by clinic branch.",
        },
        appointmentDate: {
          type: Type.STRING,
          description: "Filter by appointment date.",
        },
        status: { type: Type.STRING, description: "Filter by status." },
        patientName: {
          type: Type.STRING,
          description: "Filter by patient name.",
        },
        patientPhone: {
          type: Type.STRING,
          description: "Filter by patient phone.",
        },
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of results (default: 50).",
        },
      },
    },
  },
  {
    name: "log_voice_call",
    description:
      "Log metadata for a voice call session. REQUIRED: agentId, conversationId, status. Use this to record call information.",
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

const DEFAULT_REQUIRED_FIELDS = ["name", "phone", "service"];

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
      const systemInstruction = `You are eDentist.AI — a bilingual (Arabic/English) voice concierge representing ${clinicName}.

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

Then:
- Respond in the SAME dialect the caller uses.
- Keep the tone natural and human-like.
- Do NOT switch dialects unless the caller changes dialect or explicitly requests a different tone.

## Session kickoff:
- If the caller greets in Arabic, respond with this stored clinic greeting: """${arabicGreeting}"""
- Otherwise respond with this English greeting: """${englishGreeting}"""
- Do not invent a different greeting unless the caller explicitly asks for something else.

## Core responsibilities:
- Capture and confirm the following before finalizing any booking: ${requiredFields.join(
        ", "
      )}
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

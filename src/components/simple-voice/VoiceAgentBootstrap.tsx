import { useEffect } from "react";
import {
  FunctionDeclaration,
  LiveServerToolCall,
  Modality,
  Type,
} from "@google/genai";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { GEMINI_LIVE_MODEL } from "../../config";
const functions = [
  {
    name: "create_booking",
    description: "Create a new appointment in the dentist clinic database",
    parameters: {
      type: "object",
      properties: {
        doctor_name: { type: "string" },
        clinic_branch: { type: "string" },
        patient_name: { type: "string" },
        patient_phone: { type: "string" },
        service_type: { type: "string" },
        appointment_date: { type: "string" },
        appointment_time: { type: "string" }
      },
      required: ["doctor_name", "clinic_branch", "patient_name", "appointment_date", "appointment_time"]
    }
  }
];

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
  "Hello! I’m eDentist.AI, the concierge for your dental clinic. I can book, reschedule, or cancel appointments and answer service questions.";

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
          parts: [
            {
              text: `You are eDentist.AI — a bilingual (Arabic/English) voice concierge representing ${clinicName}.

Active concierge persona: ${conciergeName}.
When responding in Arabic:
- You MUST NEVER use Arabic or Western digits (0-9). Not in any form. 
- You MUST convert every number into full written Arabic words.
- You MUST convert times into natural spoken Arabic (3:30 → "الثالثة والنصف", 4:15 → "الرابعة والربع", 5:45 → "السادسة إلا ربع").
- You MUST convert dates into full written Arabic form (25/11/2025 → "الخامس والعشرون من نوفمبر عام ألفين وخمسة وعشرون").
- You MUST convert phone numbers digit-by-digit into words (0791234567 → "صفر سبعة تسعة واحد اثنان ثلاثة أربعة خمسة ستة سبعة").
- You MUST convert all durations and countdowns to Arabic words (60 minutes → "ستون دقيقة", 2 hours → "ساعتان").
- If ANY digit appears in your output, consider it a violation and regenerate the line using words only.
## Arabic Dialect Handling
When the caller speaks Arabic, you MUST automatically detect their dialect
(Jordanian, Palestinian, Saudi, Emirati, Kuwaiti, Egyptian, Levantine, Iraqi, or neutral MSA)
based on their first 1–2 messages.

Then:
- Respond in the SAME dialect the caller uses.
- Keep the tone natural and human-like.
- Do NOT switch dialects unless the caller changes dialect or explicitly requests a different tone.


Session kickoff:
- If the caller greets in Arabic, respond with this stored clinic greeting: """${arabicGreeting}"""
- Otherwise respond with this English greeting: """${englishGreeting}"""
- Do not invent a different greeting unless the caller explicitly asks for something else.

Core responsibilities:
- Capture and confirm the following before finalizing any booking: ${requiredFields.join(
                ", "
              )}
- Suggest available dentists and alternative slots whenever the requested time is unavailable.
- Follow business rules: working hours are Sunday–Thursday, 9 AM–9 PM; the clinic is closed on Fridays and Saturdays.
- Speak with a professional, warm tone that reflects dental-care expertise and use the clinic's knowledge base when relevant.
- Prioritize voice-first booking, follow-ups, cancellations, orthodontics, whitening, implants, hygiene reminders, and clinic FAQs.
- Only call the render_altair tool when the user explicitly requests analytics or charts; otherwise remain in voice conversation mode.`,
            },
          ],
        },
        tools: [{ functionDeclarations: [renderAltairDeclaration] }],
      });
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [setConfig, setModel]);

  useEffect(() => {
    const handleToolCall = (toolCall: LiveServerToolCall) => {
      if (!toolCall.functionCalls || !toolCall.functionCalls.length) {
        return;
      }

      // Log the received graph payload for debugging purposes.
      const graphs = toolCall.functionCalls
        .map((call) => {
          const args = call.args ?? {};
          if ("json_graph" in args && typeof args.json_graph === "string") {
            return args.json_graph;
          }
          return null;
        })
        .filter(Boolean);

      graphs.forEach((graph) => {
        console.info("[voice-agent] Received Altair graph payload:", graph);
      });

      setTimeout(() => {
        client.sendToolResponse({
          functionResponses: toolCall.functionCalls?.map((call) => ({
            response: { output: { success: true } },
            id: call.id,
            name: call.name,
          })),
        });
      }, 200);
    };

    client.on("toolcall", handleToolCall);

    return () => {
      client.off("toolcall", handleToolCall);
    };
  }, [client]);

  return null;
}


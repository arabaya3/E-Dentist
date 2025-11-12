import { useEffect } from "react";
import {
  FunctionDeclaration,
  LiveServerToolCall,
  Modality,
  Type,
} from "@google/genai";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { GEMINI_LIVE_MODEL } from "../../config";

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

export default function VoiceAgentBootstrap() {
  const { client, setConfig, setModel } = useLiveAPIContext();

  useEffect(() => {
    setModel(GEMINI_LIVE_MODEL);

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
            text: `You are eDentist.AI — a bilingual (Arabic/English) voice concierge for dental clinics.

Core responsibilities:
- Capture the patient name, phone, requested service, preferred dentist, branch, date, and time before confirming appointments.
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


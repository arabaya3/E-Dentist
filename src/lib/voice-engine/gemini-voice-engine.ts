// import {
//   Content,
//   GenerateContentResponse,
//   GoogleGenAI,
//   Modality,
// } from "@google/genai";
// import {
//   GEMINI_LIVE_MODEL,
//   GEMINI_REQUESTED_MODEL,
//   GEMINI_LIVE_MODEL_SOURCE,
//   LIVE_CLIENT_OPTIONS,
// } from "../../config";
// import {
//   arrayBufferToBase64,
//   base64ToUint8Array,
//   chunkPcm16,
//   toArrayBuffer,
//   wavToPCM16,
//   AudioLike,
// } from "./audio-utils";

// export type SupportedLocale = "en" | "ar";

// export type VoiceProfile =
//   | "en-female"
//   | "en-male"
//   | "ar-female"
//   | "ar-male";

// export type TranscriptionRequest = {
//   audio: AudioLike;
//   mimeType?: string;
//   locale?: SupportedLocale;
//   prompt?: string;
// };

// export type TranscriptionResult = {
//   text: string;
//   locale: SupportedLocale;
//   latencyMs: number;
//   model: string;
// };

// export type SynthesisRequest = {
//   text: string;
//   locale?: SupportedLocale;
//   voice?: VoiceProfile;
//   speakingRate?: number;
//   pitch?: number;
// };

// export type SynthesisResult = {
//   audio: string;
//   mimeType: string;
//   voice: VoiceProfile;
//   latencyMs: number;
//   model: string;
// };

// type VoicePreset = {
//   label: string;
//   voiceName: string;
//   locale: SupportedLocale;
//   gender: "male" | "female";
//   defaults: {
//     speakingRate: number;
//     pitch: number;
//   };
// };

// const VOICE_PRESETS: Record<VoiceProfile, VoicePreset> = {
//   "en-female": {
//     label: "English / Female",
//     voiceName: "Aoede",
//     locale: "en",
//     gender: "female",
//     defaults: { speakingRate: 1.0, pitch: 0 },
//   },
//   "en-male": {
//     label: "English / Male",
//     voiceName: "Fenrir",
//     locale: "en",
//     gender: "male",
//     defaults: { speakingRate: 0.95, pitch: -2 },
//   },
//   "ar-female": {
//     label: "Arabic / Female",
//     voiceName: "Charis",
//     locale: "ar",
//     gender: "female",
//     defaults: { speakingRate: 0.9, pitch: 0 },
//   },
//   "ar-male": {
//     label: "Arabic / Male",
//     voiceName: "Puck",
//     locale: "ar",
//     gender: "male",
//     defaults: { speakingRate: 0.92, pitch: -1 },
//   },
// };

// const STT_SYSTEM_PROMPT: Record<SupportedLocale, string> = {
//   en: `Transcribe the call audio verbatim in English. 
// - Preserve dental terminology.
// - Output plain UTF-8 text without timestamps or markdown.
// - If the caller switches to Arabic, note "[AR]: <text>" inline.`,
//   ar: `Transcribe the call audio verbatim in Modern Standard Arabic. 
// - Respond only with the transcript (no instructions or commentary).
// - When callers insert English words, keep them in brackets.`,
// };

// const DEFAULT_STT_MODEL =
//   GEMINI_LIVE_MODEL_SOURCE === "fallback"
//     ? GEMINI_LIVE_MODEL || "models/gemini-2.0-flash-exp"
//     : GEMINI_REQUESTED_MODEL;
// const DEFAULT_TTS_MODEL = GEMINI_LIVE_MODEL || "models/gemini-2.0-flash-exp";

// const now =
//   typeof performance === "undefined" ? () => Date.now() : () => performance.now();

// function extractText(response: GenerateContentResponse): string {
//   const parts =
//     response.candidates?.[0]?.content?.parts?.map((part) => part.text || "") ??
//     [];
//   return parts.join("").trim();
// }

// function extractAudioPart(response: GenerateContentResponse) {
//   for (const candidate of response.candidates ?? []) {
//     for (const part of candidate.content?.parts ?? []) {
//       if (part.inlineData?.data) {
//         const mimeType =
//           part.inlineData.mimeType ||
//           (part.inlineData.data.startsWith("UklG") ? "audio/pcm" : "audio/wav");
//         return { data: part.inlineData.data, mimeType };
//       }
//     }
//   }
//   return null;
// }

// export class GeminiVoiceEngine {
//   private readonly client: GoogleGenAI;
//   private readonly sttModelName: string;
//   private readonly ttsModelName: string;

//   constructor(opts?: { sttModel?: string; ttsModel?: string }) {
//     this.client = new GoogleGenAI(LIVE_CLIENT_OPTIONS);
//     this.sttModelName = opts?.sttModel ?? DEFAULT_STT_MODEL;
//     this.ttsModelName = opts?.ttsModel ?? DEFAULT_TTS_MODEL;
//   }

//   async transcribeAudio(
//     request: TranscriptionRequest
//   ): Promise<TranscriptionResult> {
//     const startedAt = now();
//     const locale = request.locale ?? "en";
//     const arrayBuffer = await toArrayBuffer(request.audio);

//     let pcmBase64: string;
//     let sampleRate = 16000;

//     if (!request.mimeType || request.mimeType.includes("wav")) {
//       const converted = wavToPCM16(arrayBuffer);
//       pcmBase64 = converted.base64;
//       sampleRate = converted.sampleRate;
//     } else {
//       pcmBase64 = arrayBufferToBase64(arrayBuffer);
//       const rateMatch = request.mimeType.match(/rate=(\d+)/);
//       if (rateMatch) {
//         sampleRate = parseInt(rateMatch[1], 10);
//       }
//     }

//     let resolveText: (() => void) | null = null;
//     let rejectText: ((error: Error) => void) | null = null;
//     const waitForText = new Promise<void>((resolve, reject) => {
//       resolveText = resolve;
//       rejectText = reject;
//     });

//     const transcriptParts: string[] = [];

//     const session = await this.client.live.connect({
//       model: this.sttModelName,
//       config: {
//         responseModalities: [Modality.TEXT],
//         inputAudioTranscription: {
//           languageCode: locale === "ar" ? "ar-SA" : "en-US",
//         },
//         systemInstruction: {
//           role: "system",
//           parts: [
//             {
//               text: `${STT_SYSTEM_PROMPT[locale]} ${
//                 request.prompt ?? ""
//               }`.trim(),
//             },
//           ],
//         },
//       },
//       callbacks: {
//         onopen: () => {},
//         onmessage: (message) => {
//           const parts = message?.serverContent?.modelTurn?.parts ?? [];
//           for (const part of parts) {
//             if (part.text) {
//               transcriptParts.push(part.text);
//             }
//           }
//           if (message?.serverContent?.turnComplete && resolveText) {
//             resolveText();
//             resolveText = null;
//           }
//         },
//         onerror: (event: ErrorEvent) => {
//           if (rejectText) {
//             const err =
//               event.error instanceof Error
//                 ? event.error
//                 : new Error(event.message ?? "STT websocket error");
//             rejectText(err);
//             rejectText = null;
//           }
//         },
//         onclose: (event: CloseEvent) => {
//           if (event.code !== 1000 && rejectText) {
//             rejectText(
//               new Error(
//                 `STT socket closed (${event.code}): ${event.reason ?? ""}`
//               )
//             );
//             rejectText = null;
//           }
//         },
//       },
//     });

//     const chunks = chunkPcm16(pcmBase64, sampleRate, 320);
//     for (const chunk of chunks) {
//       session.sendRealtimeInput({
//         media: {
//           mimeType: `audio/pcm;rate=${sampleRate}`,
//           data: chunk,
//         },
//       });
//     }
//     session.sendRealtimeInput({ audioStreamEnd: true });

//     await waitForText;
//     session.close();

//     const text = transcriptParts.join(" ").replace(/\s+/g, " ").trim();
//     const latencyMs = Math.round(now() - startedAt);

//     return {
//       text,
//       locale,
//       latencyMs,
//       model: this.sttModelName,
//     };
//   }

//   async synthesizeSpeech(
//     request: SynthesisRequest
//   ): Promise<SynthesisResult> {
//     const startedAt = now();
//     const voiceId =
//       (request.voice as VoiceProfile) ??
//       (request.locale === "ar" ? "ar-male" : "en-female");
//     const targetVoice = VOICE_PRESETS[voiceId];

//     let resolveAudio: (() => void) | null = null;
//     let rejectAudio: ((error: Error) => void) | null = null;
//     const waitForAudio = new Promise<void>((resolve, reject) => {
//       resolveAudio = resolve;
//       rejectAudio = reject;
//     });

//     const audioChunks: Uint8Array[] = [];
//     let totalBytes = 0;

//     const session = await this.client.live.connect({
//       model: this.ttsModelName,
//       config: {
//         responseModalities: [Modality.AUDIO],
//         speechConfig: {
//           voiceConfig: {
//             prebuiltVoiceConfig: { voiceName: targetVoice.voiceName },
//           },
//         },
//         systemInstruction: {
//           role: "system",
//           parts: [
//             {
//               text: `You are a professional dental assistant voice. Locale: ${
//                 targetVoice.locale === "ar" ? "Arabic" : "English"
//               }. Gender: ${targetVoice.gender}. Keep replies concise (<12 words).`,
//             },
//           ],
//         },
//       },
//       callbacks: {
//         onopen: () => {},
//         onmessage: (message) => {
//           const parts = message?.serverContent?.modelTurn?.parts ?? [];
//           for (const part of parts) {
//             if (part.inlineData?.data) {
//               const chunk = base64ToUint8Array(part.inlineData.data);
//               audioChunks.push(chunk);
//               totalBytes += chunk.byteLength;
//             }
//           }
//           if (message?.serverContent?.turnComplete && resolveAudio) {
//             resolveAudio();
//             resolveAudio = null;
//           }
//         },
//         onerror: (event: ErrorEvent) => {
//           if (rejectAudio) {
//             const err =
//               event.error instanceof Error
//                 ? event.error
//                 : new Error(event.message ?? "TTS websocket error");
//             rejectAudio(err);
//             rejectAudio = null;
//           }
//         },
//         onclose: (event: CloseEvent) => {
//           if (event.code !== 1000 && rejectAudio) {
//             rejectAudio(
//               new Error(
//                 `TTS socket closed (${event.code}): ${event.reason ?? ""}`
//               )
//             );
//             rejectAudio = null;
//           }
//         },
//       },
//     });

//     session.sendClientContent({
//       turns: [
//         {
//           role: "user",
//           parts: [{ text: request.text }],
//         },
//       ],
//       turnComplete: true,
//     });

//     await waitForAudio;
//     session.close();

//     if (!audioChunks.length) {
//       throw new Error("No audio returned by Gemini.");
//     }

//     const merged = new Uint8Array(totalBytes);
//     let offset = 0;
//     for (const chunk of audioChunks) {
//       merged.set(chunk, offset);
//       offset += chunk.byteLength;
//     }

//     const latencyMs = Math.round(now() - startedAt);

//     return {
//       audio: arrayBufferToBase64(merged.buffer),
//       mimeType: "audio/pcm",
//       voice: voiceId,
//       latencyMs,
//       model: this.ttsModelName,
//     };
//   }
// }

// export const GEMINI_VOICE_ENGINE_FALLBACK =
//   GEMINI_LIVE_MODEL_SOURCE === "fallback"
//     ? GEMINI_LIVE_MODEL
//     : undefined;




import {
  Content,
  GenerateContentResponse,
  GoogleGenAI,
  Modality,
} from "@google/genai";
import {
  GEMINI_LIVE_MODEL,
  GEMINI_REQUESTED_MODEL,
  GEMINI_LIVE_MODEL_SOURCE,
  LIVE_CLIENT_OPTIONS,
} from "../../config";
import {
  arrayBufferToBase64,
  base64ToUint8Array,
  chunkPcm16,
  toArrayBuffer,
  wavToPCM16,
  AudioLike,
} from "./audio-utils";

export type SupportedLocale = "en" | "ar";

export type VoiceProfile =
  | "en-female"
  | "en-male"
  | "ar-female"
  | "ar-male";

export type TranscriptionRequest = {
  audio: AudioLike;
  mimeType?: string;
  locale?: SupportedLocale;
  prompt?: string;
};

export type TranscriptionResult = {
  text: string;
  locale: SupportedLocale;
  latencyMs: number;
  model: string;
};

export type SynthesisRequest = {
  text: string;
  locale?: SupportedLocale;
  voice?: VoiceProfile;
  speakingRate?: number;
  pitch?: number;
};

export type SynthesisResult = {
  audio: string;
  mimeType: string;
  voice: VoiceProfile;
  latencyMs: number;
  model: string;
};

type VoicePreset = {
  label: string;
  voiceName: string;
  locale: SupportedLocale;
  gender: "male" | "female";
  defaults: {
    speakingRate: number;
    pitch: number;
  };
};

const VOICE_PRESETS: Record<VoiceProfile, VoicePreset> = {
  "en-female": {
    label: "English / Female",
    voiceName: "Aoede",
    locale: "en",
    gender: "female",
    defaults: { speakingRate: 1.0, pitch: 0 },
  },
  "en-male": {
    label: "English / Male",
    voiceName: "Fenrir",
    locale: "en",
    gender: "male",
    defaults: { speakingRate: 0.95, pitch: -2 },
  },
  "ar-female": {
    label: "Arabic / Female",
    voiceName: "Charis",
    locale: "ar",
    gender: "female",
    defaults: { speakingRate: 0.9, pitch: 0 },
  },
  "ar-male": {
    label: "Arabic / Male",
    voiceName: "Puck",
    locale: "ar",
    gender: "male",
    defaults: { speakingRate: 0.92, pitch: -1 },
  },
};

const STT_SYSTEM_PROMPT: Record<SupportedLocale, string> = {
  en: `Transcribe the call audio verbatim in English.
- Preserve dental terminology.
- Output plain UTF-8 text without timestamps or markdown.
- If the caller switches to Arabic, note "[AR]: <text>" inline.`,

  ar: `Transcribe the call audio verbatim in Modern Standard Arabic.
- Respond only with the transcript (no instructions or commentary).
- When callers insert English words, keep them in brackets.`,
};

const DEFAULT_STT_MODEL =
  GEMINI_LIVE_MODEL_SOURCE === "fallback"
    ? GEMINI_LIVE_MODEL || "models/gemini-2.0-flash-exp"
    : GEMINI_REQUESTED_MODEL;

const DEFAULT_TTS_MODEL =
  GEMINI_LIVE_MODEL || "models/gemini-2.0-flash-exp";


// =============================================
//  🔥 دالة تحويل الأرقام الإنجليزية → أرقام عربية
// =============================================
function convertArabicTextDigits(text: string): string {
  if (!text) return text;

  const safe: Record<string, string> = {};
  let i = 0;

  // حفظ OTP و رقم الهاتف 4–15 digits بدون تحويل
  text = text.replace(/\b\d{4,15}\b/g, (match) => {
    const key = `__SAFE_${i++}__`;
    safe[key] = match;
    return key;
  });

  const map: Record<string, string> = {
    "0": "٠",
    "1": "١",
    "2": "٢",
    "3": "٣",
    "4": "٤",
    "5": "٥",
    "6": "٦",
    "7": "٧",
    "8": "٨",
    "9": "٩",
  };

  // تحويل كل رقم فردي
  text = text.replace(/\d/g, (d) => map[d]);

  // إعادة الأرقام الحساسة زي ما هي
  for (const key in safe) {
    text = text.replace(key, safe[key]);
  }

  return text;
}


// performance fallback
const now =
  typeof performance === "undefined" ? () => Date.now() : () => performance.now();

export class GeminiVoiceEngine {
  private readonly client: GoogleGenAI;
  private readonly sttModelName: string;
  private readonly ttsModelName: string;

  constructor(opts?: { sttModel?: string; ttsModel?: string }) {
    this.client = new GoogleGenAI(LIVE_CLIENT_OPTIONS);
    this.sttModelName = opts?.sttModel ?? DEFAULT_STT_MODEL;
    this.ttsModelName = opts?.ttsModel ?? DEFAULT_TTS_MODEL;
  }

  // ================================
  //          🎤 STT (Transcribe)
  // ================================
  async transcribeAudio(
    request: TranscriptionRequest
  ): Promise<TranscriptionResult> {
    const startedAt = now();
    const locale = request.locale ?? "en";
    const arrayBuffer = await toArrayBuffer(request.audio);

    let pcmBase64: string;
    let sampleRate = 16000;

    if (!request.mimeType || request.mimeType.includes("wav")) {
      const converted = wavToPCM16(arrayBuffer);
      pcmBase64 = converted.base64;
      sampleRate = converted.sampleRate;
    } else {
      pcmBase64 = arrayBufferToBase64(arrayBuffer);
      const rateMatch = request.mimeType.match(/rate=(\d+)/);
      if (rateMatch) {
        sampleRate = parseInt(rateMatch[1], 10);
      }
    }

    let resolveText: (() => void) | null = null;
    let rejectText: ((error: Error) => void) | null = null;

    const waitForText = new Promise<void>((resolve, reject) => {
      resolveText = resolve;
      rejectText = reject;
    });

    const transcriptParts: string[] = [];

    const session = await this.client.live.connect({
      model: this.sttModelName,
      config: {
        responseModalities: [Modality.TEXT],
        inputAudioTranscription: {
          languageCode: locale === "ar" ? "ar-SA" : "en-US",
        },
        systemInstruction: {
          role: "system",
          parts: [
            {
              text: `${STT_SYSTEM_PROMPT[locale]} ${
                request.prompt ?? ""
              }`.trim(),
            },
          ],
        },
      },
      callbacks: {
        onmessage: (m) => {
          const parts = m?.serverContent?.modelTurn?.parts ?? [];
          for (const p of parts) {
            if (p.text) transcriptParts.push(p.text);
          }
          if (m?.serverContent?.turnComplete && resolveText) {
            resolveText();
            resolveText = null;
          }
        },
      },
    });

    const chunks = chunkPcm16(pcmBase64, sampleRate, 320);
    for (const chunk of chunks) {
      session.sendRealtimeInput({
        media: {
          mimeType: `audio/pcm;rate=${sampleRate}`,
          data: chunk,
        },
      });
    }
    session.sendRealtimeInput({ audioStreamEnd: true });

    await waitForText;
    session.close();

    const text = transcriptParts.join(" ").replace(/\s+/g, " ").trim();
    const latencyMs = Math.round(now() - startedAt);

    return { text, locale, latencyMs, model: this.sttModelName };
  }

  // ================================
  //         🔊 TTS (Voice)
  // ================================
  async synthesizeSpeech(
    request: SynthesisRequest
  ): Promise<SynthesisResult> {
    const startedAt = now();
let finalText = request.text;
const hasArabicChars = /[\u0600-\u06FF]/.test(finalText);

if (request.locale === "ar" || hasArabicChars) {
  finalText = convertArabicTextDigits(finalText);
}


    console.log("📝 [TTS-IN] Original:", request.text);
    console.log("🔢 [TTS-IN] Arabic Digits:", finalText);

    const voiceId =
      (request.voice as VoiceProfile) ??
      (request.locale === "ar" ? "ar-male" : "en-female");

    const targetVoice = VOICE_PRESETS[voiceId];

    let resolveAudio: (() => void) | null = null;
    let rejectAudio: ((error: Error) => void) | null = null;

    const waitForAudio = new Promise<void>((resolve, reject) => {
      resolveAudio = resolve;
      rejectAudio = reject;
    });

    const audioChunks: Uint8Array[] = [];
    let totalBytes = 0;

    const session = await this.client.live.connect({
      model: this.ttsModelName,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: targetVoice.voiceName },
          },
        },
        systemInstruction: {
          role: "system",
          parts: [
            {
              text: `You are a professional dental assistant voice. Locale: ${
                targetVoice.locale === "ar" ? "Arabic" : "English"
              }. Gender: ${targetVoice.gender}. Keep replies concise (<12 words).`,
            },
          ],
        },
      },
      callbacks: {
        onmessage: (m) => {
          const parts = m?.serverContent?.modelTurn?.parts ?? [];
          for (const p of parts) {
            if (p.inlineData?.data) {
              const chunk = base64ToUint8Array(p.inlineData.data);
              audioChunks.push(chunk);
              totalBytes += chunk.byteLength;
            }
          }
          if (m?.serverContent?.turnComplete && resolveAudio) {
            resolveAudio();
            resolveAudio = null;
          }
        },
      },
    });

    session.sendClientContent({
      turns: [{ role: "user", parts: [{ text: finalText }] }],
      turnComplete: true,
    });

    await waitForAudio;
    session.close();

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const c of audioChunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }

    const latencyMs = Math.round(now() - startedAt);

    return {
      audio: arrayBufferToBase64(merged.buffer),
      mimeType: "audio/pcm",
      voice: voiceId,
      latencyMs,
      model: this.ttsModelName,
    };
  }
}

export const GEMINI_VOICE_ENGINE_FALLBACK =
  GEMINI_LIVE_MODEL_SOURCE === "fallback"
    ? GEMINI_LIVE_MODEL
    : undefined;


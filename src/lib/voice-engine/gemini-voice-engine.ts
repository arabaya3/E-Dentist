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
const DEFAULT_TTS_MODEL = GEMINI_LIVE_MODEL || "models/gemini-2.0-flash-exp";

const now =
  typeof performance === "undefined" ? () => Date.now() : () => performance.now();

function extractText(response: GenerateContentResponse): string {
  const parts =
    response.candidates?.[0]?.content?.parts?.map((part) => part.text || "") ?? [];
  return parts.join("").trim();
}

function extractAudioPart(response: GenerateContentResponse) {
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mimeType =
          part.inlineData.mimeType ||
          (part.inlineData.data.startsWith("UklG") ? "audio/pcm" : "audio/wav");
        return { data: part.inlineData.data, mimeType };
      }
    }
  }
  return null;
}

/* ================================
   تحويل الأرقام للكلمات بالعربي (للـ TTS فقط)
   ================================ */

function convertNumberToArabicWords(number: number): string {
  const units = [
    "",
    "واحد",
    "اثنان",
    "ثلاثة",
    "أربعة",
    "خمسة",
    "ستة",
    "سبعة",
    "ثمانية",
    "تسعة",
  ];

  const tens = [
    "",
    "عشرة",
    "عشرون",
    "ثلاثون",
    "أربعون",
    "خمسون",
    "ستون",
    "سبعون",
    "ثمانون",
    "تسعون",
  ];

  const scales = ["", "ألف", "مليون", "مليار", "تريليون"];

  if (number === 0) return "صفر";

  function convertBelowThousand(n: number): string {
    let result = "";
    let hundreds = Math.floor(n / 100);
    let remainder = n % 100;

    if (hundreds > 0) {
      if (hundreds === 1) result += "مائة";
      else if (hundreds === 2) result += "مائتان";
      else result += units[hundreds] + " مائة";

      if (remainder > 0) result += " و ";
    }

    if (remainder > 0) {
      if (remainder < 10) result += units[remainder];
      else if (remainder < 20) {
        if (remainder === 10) result += "عشرة";
        else if (remainder === 11) result += "أحد عشر";
        else if (remainder === 12) result += "اثنا عشر";
        else result += units[remainder - 10] + " عشر";
      } else {
        let t = Math.floor(remainder / 10);
        let u = remainder % 10;

        if (u > 0) result += units[u] + " و " + tens[t];
        else result += tens[t];
      }
    }
    return result;
  }

  let parts: string[] = [];
  let scaleIndex = 0;

  while (number > 0) {
    let chunk = number % 1000;

    if (chunk > 0) {
      let chunkWords = convertBelowThousand(chunk);
      let scaleWord = scales[scaleIndex];
      if (scaleWord) chunkWords += " " + scaleWord;
      parts.unshift(chunkWords);
    }

    number = Math.floor(number / 1000);
    scaleIndex++;
  }

  return parts.join(" و ");
}

//  HH:MM → كلام عربي
function timeToArabicWords(time: string): string {
  const [hhStr, mmStr] = time.split(":");
  const hh = parseInt(hhStr, 10);
  const mm = parseInt(mmStr, 10);

  const hours = [
    "الواحدة",
    "الثانية",
    "الثالثة",
    "الرابعة",
    "الخامسة",
    "السادسة",
    "السابعة",
    "الثامنة",
    "التاسعة",
    "العاشرة",
    "الحادية عشرة",
    "الثانية عشرة",
  ];

  const index = ((hh % 12) || 12) - 1;
  const hourWord = hours[index];

  if (mm === 0) return `${hourWord} تماماً`;
  if (mm === 15) return `${hourWord} والربع`;
  if (mm === 30) return `${hourWord} والنصف`;
  if (mm === 45) return `${hourWord} إلا الربع`;

  return `${hourWord} و ${convertNumberToArabicWords(mm)} دقيقة`;
}

// استبدال كل الأرقام داخل النص العربي لكلمات
function convertNumbersInsideArabicText(text: string): string {
  // أولاً: الأوقات  HH:MM
  let converted = text.replace(/(\d{1,2}:\d{2})/g, (m) => {
    try {
      return timeToArabicWords(m);
    } catch {
      return m;
    }
  });

  // ثانياً: أي رقم مستقل (10, 2025, 320 ... إلخ)
  converted = converted.replace(/\b\d+\b/g, (num) => {
    const n = parseInt(num, 10);
    if (Number.isNaN(n)) return num;
    return convertNumberToArabicWords(n);
  });

  return converted;
}

export class GeminiVoiceEngine {
  private readonly client: GoogleGenAI;
  private readonly sttModelName: string;
  private readonly ttsModelName: string;

  constructor(opts?: { sttModel?: string; ttsModel?: string }) {
    this.client = new GoogleGenAI(LIVE_CLIENT_OPTIONS);
    this.sttModelName = opts?.sttModel ?? DEFAULT_STT_MODEL;
    this.ttsModelName = opts?.ttsModel ?? DEFAULT_TTS_MODEL;
  }

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
        onopen: () => {},
        onmessage: (message) => {
          const parts = message?.serverContent?.modelTurn?.parts ?? [];
          for (const part of parts) {
            if (part.text) {
              transcriptParts.push(part.text);
            }
          }
          if (message?.serverContent?.turnComplete && resolveText) {
            resolveText();
            resolveText = null;
          }
        },
        onerror: (event: ErrorEvent) => {
          if (rejectText) {
            const err =
              event.error instanceof Error
                ? event.error
                : new Error(event.message ?? "STT websocket error");
            rejectText(err);
            rejectText = null;
          }
        },
        onclose: (event: CloseEvent) => {
          if (event.code !== 1000 && rejectText) {
            rejectText(
              new Error(
                `STT socket closed (${event.code}): ${event.reason ?? ""}`
              )
            );
            rejectText = null;
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

    return {
      text,
      locale,
      latencyMs,
      model: this.sttModelName,
    };
  }

  async synthesizeSpeech(
    request: SynthesisRequest
  ): Promise<SynthesisResult> {
    const startedAt = now();
    const voiceId =
      (request.voice as VoiceProfile) ??
      (request.locale === "ar" ? "ar-male" : "en-female");
    const targetVoice = VOICE_PRESETS[voiceId];

    // 👈 هنا التعديل المهم
    let textForTTS = request.text;
    if (targetVoice.locale === "ar") {
      textForTTS = convertNumbersInsideArabicText(textForTTS);
    }

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
        onopen: () => {},
        onmessage: (message) => {
          const parts = message?.serverContent?.modelTurn?.parts ?? [];
          for (const part of parts) {
            if (part.inlineData?.data) {
              const chunk = base64ToUint8Array(part.inlineData.data);
              audioChunks.push(chunk);
              totalBytes += chunk.byteLength;
            }
          }
          if (message?.serverContent?.turnComplete && resolveAudio) {
            resolveAudio();
            resolveAudio = null;
          }
        },
        onerror: (event: ErrorEvent) => {
          if (rejectAudio) {
            const err =
              event.error instanceof Error
                ? event.error
                : new Error(event.message ?? "TTS websocket error");
            rejectAudio(err);
            rejectAudio = null;
          }
        },
        onclose: (event: CloseEvent) => {
          if (event.code !== 1000 && rejectAudio) {
            rejectAudio(
              new Error(
                `TTS socket closed (${event.code}): ${event.reason ?? ""}`
              )
            );
            rejectAudio = null;
          }
        },
      },
    });

    session.sendClientContent({
      turns: [
        {
          role: "user",
          parts: [{ text: textForTTS }], // 👈 نبعث النص بعد تحويل الأرقام
        },
      ],
      turnComplete: true,
    });

    await waitForAudio;
    session.close();

    if (!audioChunks.length) {
      throw new Error("No audio returned by Gemini.");
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of audioChunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
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

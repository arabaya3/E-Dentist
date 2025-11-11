import "dotenv-flow/config";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  GEMINI_LIVE_MODEL,
  GEMINI_LIVE_MODEL_SOURCE,
  GEMINI_REQUESTED_MODEL,
  LIVE_CLIENT_OPTIONS,
} from "../src/config";
import { wavToPCM16 } from "../src/lib/voice-engine";

const SAMPLE_AUDIO_PATH = path.resolve(
  __dirname,
  "../tests/sample-input.wav"
);

if (!existsSync(SAMPLE_AUDIO_PATH)) {
  throw new Error(
    `Missing sample audio clip at ${SAMPLE_AUDIO_PATH}. Add a small WAV file to run the smoke test.`
  );
}

const SAMPLE_AUDIO_BUFFER = readFileSync(SAMPLE_AUDIO_PATH);
const SAMPLE_PCM = wavToPCM16(SAMPLE_AUDIO_BUFFER);
const SAMPLE_PCM_BUFFER = Buffer.from(SAMPLE_PCM.base64, "base64");

type AudioResult = {
  latencyMs: number;
  bytes: number;
};

const DEBUG = process.env.DEBUG_GEMINI === "true";

async function runSmokeTest(): Promise<AudioResult> {
  const client = new GoogleGenAI(LIVE_CLIENT_OPTIONS);

  let resolveAudio: ((result: AudioResult) => void) | null = null;
  let rejectAudio: ((error: Error) => void) | null = null;

  const waitForAudio = new Promise<AudioResult>((resolve, reject) => {
    resolveAudio = resolve;
    rejectAudio = reject;
  });

  let resolveSetup: (() => void) | null = null;
  let setupTimeout: NodeJS.Timeout | null = null;
  const waitForSetup = new Promise<void>((resolve) => {
    resolveSetup = resolve;
  });
  setupTimeout = setTimeout(() => {
    if (resolveSetup) {
      resolveSetup();
      resolveSetup = null;
    }
  }, 2000);

  let timeout: NodeJS.Timeout | null = null;
  let startTime = 0;

  const session = await client.live.connect({
    model: GEMINI_LIVE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
      systemInstruction: {
        parts: [
          {
            text: "Respond to every input with a concise Arabic audio greeting (<2 words).",
          },
        ],
      },
    },
    callbacks: {
      onopen: () => {
        console.log("Gemini live socket connected.");
      },
      onmessage: (message: LiveServerMessage) => {
        if (DEBUG) {
          console.log("[Gemini][server]", JSON.stringify(message));
        }
        if (message?.setupComplete) {
          resolveSetup?.();
          resolveSetup = null;
          if (setupTimeout) {
            clearTimeout(setupTimeout);
            setupTimeout = null;
          }
          return;
        }
        const parts = message?.serverContent?.modelTurn?.parts ?? [];
        const audioPart = parts.find((part) => {
          if (!part.inlineData?.data) {
            return false;
          }
          const mimeType = part.inlineData.mimeType ?? "";
          return mimeType.length === 0 || mimeType.startsWith("audio/");
        });

        if (audioPart?.inlineData?.data && startTime && resolveAudio) {
          if (timeout) {
            clearTimeout(timeout);
          }
          const latencyMs = performance.now() - startTime;
          const bytes = Buffer.from(audioPart.inlineData.data, "base64").length;
          resolveAudio({ latencyMs, bytes });
          resolveAudio = null;
        }
      },
      onerror: (event: ErrorEvent) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        if (rejectAudio) {
          const error =
            event.error instanceof Error
              ? event.error
              : new Error(event.message ?? "Gemini live socket error");
          rejectAudio(error);
          rejectAudio = null;
        }
      },
      onclose: (event: CloseEvent) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        if (event.code !== 1000 && rejectAudio) {
          rejectAudio(
            new Error(
              `Socket closed unexpectedly (${event.code}): ${event.reason}`
            )
          );
          rejectAudio = null;
        }
      },
    },
  });

  await waitForSetup;

  const chunkSize = 3200;
  let sentChunks = 0;
  for (
    let offset = 0;
    offset < SAMPLE_PCM_BUFFER.length;
    offset += chunkSize
  ) {
    const chunk = SAMPLE_PCM_BUFFER.subarray(offset, offset + chunkSize);
    session.sendRealtimeInput({
      media: {
        mimeType: `audio/pcm;rate=${SAMPLE_PCM.sampleRate}`,
        data: chunk.toString("base64"),
      },
    });
    sentChunks += 1;
  }
  if (DEBUG) {
    console.log(
      `[debug] streamed ${sentChunks} chunks (${SAMPLE_PCM_BUFFER.length} bytes)`
    );
  }
  session.sendRealtimeInput({ audioStreamEnd: true });
  startTime = performance.now();

  timeout = setTimeout(() => {
    if (rejectAudio) {
      rejectAudio(new Error("Timed out waiting for audio response."));
      rejectAudio = null;
    }
  }, 8000);

  try {
    return await waitForAudio;
  } finally {
    session.close();
  }
}

runSmokeTest()
  .then(({ latencyMs, bytes }) => {
    console.log(`[ok] Gemini audio round-trip complete: ${bytes} bytes received in ${latencyMs.toFixed(1)}ms`);
    console.log(`Live model in use: ${GEMINI_LIVE_MODEL} (${GEMINI_LIVE_MODEL_SOURCE})`);
    if (GEMINI_LIVE_MODEL_SOURCE === "fallback") {
      console.warn(`Requested model "${GEMINI_REQUESTED_MODEL}" is not yet supported for live streaming; using fallback for WebSocket workflows.`);
    }
    if (latencyMs > 500) {
      console.warn("Latency exceeded target (300-500ms). Check network conditions if this persists.");
    }
  })
  .catch((error) => {
    console.error("[fail] Gemini audio smoke test failed:");
    console.error(error);
    process.exitCode = 1;
  });

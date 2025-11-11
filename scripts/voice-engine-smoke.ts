import "dotenv-flow/config";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { GeminiVoiceEngine } from "../src/lib/voice-engine";

const engine = new GeminiVoiceEngine();

type SampleSpec = {
  file: string;
  locale: "en" | "ar";
  description: string;
};

const DATA_ROOT = path.resolve(__dirname, "../data/audio");

const samples: SampleSpec[] = [
  {
    file: "en_appointment.wav",
    locale: "en",
    description: "Hygiene confirmation",
  },
  {
    file: "ar_followup.wav",
    locale: "ar",
    description: "Arabic follow-up",
  },
];

async function runTranscriptionDemos() {
  console.log("== Speech-to-Text ==");
  for (const sample of samples) {
    const buffer = readFileSync(path.join(DATA_ROOT, sample.file));
    const started = performance.now();
    const result = await engine.transcribeAudio({
      audio: buffer,
      mimeType: "audio/wav",
      locale: sample.locale,
    });
    const elapsed = performance.now() - started;
    console.log(
      `[${sample.locale}] ${sample.description} :: ${result.text} (${elapsed.toFixed(
        0
      )}ms)`
    );
  }
}

async function runSynthesisDemos() {
  console.log("== Text-to-Speech ==");
  const outputs = [
    {
      text: "Hello, this is eDentist. Your aligner kit has shipped today.",
      locale: "en" as const,
      voice: "en-female" as const,
      filename: "out/en_status.wav",
    },
    {
      text: "نذكرك بموعد الحشو غداً الساعة الثامنة والنصف صباحاً.",
      locale: "ar" as const,
      voice: "ar-male" as const,
      filename: "out/ar_reminder.wav",
    },
  ];

  for (const job of outputs) {
    const result = await engine.synthesizeSpeech({
      text: job.text,
      locale: job.locale,
      voice: job.voice,
    });
    const target = path.join(DATA_ROOT, job.filename);
    writeFileSync(target, Buffer.from(result.audio, "base64"));
    console.log(
      `[${job.locale}] saved ${target} (${(result.latencyMs).toFixed(0)}ms)`
    );
  }
}

async function main() {
  await runTranscriptionDemos();
  await runSynthesisDemos();
}

main().catch((error) => {
  console.error("[fail] Voice engine smoke test failed:");
  console.error(error);
  process.exitCode = 1;
});

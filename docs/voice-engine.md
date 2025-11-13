# AI Voice Engine

## Overview
- `GeminiVoiceEngine` wraps the Google Gemini Audio APIs for STT (speech-to-text) and TTS (text-to-speech).
- Works in both browser and Node runtimes (React app + CLI smoke tests).
- Falls back to the live-compatible model (`models/gemini-2.0-flash-exp`) automatically when `gemini-2.5-audio` is not yet exposed over WebSocket.

## Environment
```
GEMINI_API_KEY=...
PROJECT_ID=...
MODEL=gemini-2.5-audio
API_URL=https://generativelanguage.googleapis.com/v1beta/models
```
> CRA build needs the same keys with the `REACT_APP_` prefix.

## Usage
```ts
import { GeminiVoiceEngine } from '../lib/voice-engine';

const engine = new GeminiVoiceEngine();

// Speech to text
const transcription = await engine.transcribeAudio({
  audio: fileOrBuffer,
  mimeType: 'audio/wav',
  locale: 'ar',
});

// Text to speech
const synthesis = await engine.synthesizeSpeech({
  text: 'Your cleaning starts at 09:00.',
  locale: 'en',
  voice: 'en-female',
});
```
- STT returns `{ text, locale, latencyMs, model }`.
- TTS returns `{ audio (base64), mimeType, voice, latencyMs, model }`.
- Voice presets:
  - `en-female` (Aoede)
  - `en-male` (Fenrir)
  - `ar-female` (Charis)
  - `ar-male` (Puck)

## Sample Data
- `data/audio/en_appointment.wav` – female English confirmation call.
- `data/audio/ar_followup.wav` – male Arabic follow-up.
- Output folder `data/audio/out/*` is created automatically by the smoke test.
- Scenario list lives in `data/scenarios/call-scenarios.md` with five high-priority call flows.

## Testing & Latency Goals
1. **Live streaming loop** – `npm run test:audio`
   - Streams PCM chunks through the Live API and expects an audio reply within 0.5s (warns otherwise).
2. **Voice engine module** – `npm run test:voice-engine`
   - Transcribes both Arabic & English fixtures and synthesizes two fresh replies.
   - Saves outputs under `data/audio/out/` for manual playback.

During local runs we consistently observed 0.62–0.86s round-trip latency (see terminal logs). Adjust the sample length or network to stay under one second.

## Integrating in React
- Import `GeminiVoiceEngine` anywhere inside the CRA app (same env keys already exist).
- Feed microphone buffers from `AudioRecorder` to `transcribeAudio` for near-real-time STT.
- Use `synthesizeSpeech` to pre-render agent utterances (write to `AudioStreamer`).

## Next Steps
1. Swap sample WAVs with anonymized production snippets when available.
2. Add diarization + entity extraction (function calling) inside the STT response.
3. Wire the engine to the on-screen Altair console for end-to-end UX.

/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GenAILiveClient } from "../lib/genai-live-client";
import { LiveClientOptions } from "../types";
import { AudioStreamer } from "../lib/audio-streamer";
import { audioContext } from "../lib/utils";
import VolMeterWorket from "../lib/worklets/vol-meter";
import { LiveConnectConfig } from "@google/genai";
import { GEMINI_LIVE_MODEL } from "../config";
import { arrayBufferToBase64 } from "../lib/voice-engine/audio-utils";

export type UseLiveAPIResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;
  model: string;
  setModel: (model: string) => void;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  volume: number;
};

export function useLiveAPI(options: LiveClientOptions): UseLiveAPIResults {
  const client = useMemo(() => new GenAILiveClient(options), [options]);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [model, setModel] = useState<string>(GEMINI_LIVE_MODEL);
  const [config, setConfig] = useState<LiveConnectConfig>({});
  const [connected, setConnected] = useState(false);
  const [volume, setVolume] = useState(0);

  // --------------------------------------------------------------
  // INIT OUTPUT AUDIO STREAMER
  // --------------------------------------------------------------
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: "audio-out" }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>("vumeter-out", VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => undefined);
      });
    }
  }, [audioStreamerRef]);

  // --------------------------------------------------------------
  // MAIN CLIENT EVENT HANDLERS (OPEN / CLOSE / AUDIO / ERROR)
  // --------------------------------------------------------------
  useEffect(() => {
    const onOpen = () => {
      setConnected(true);
    };

    const onClose = () => {
      setConnected(false);
    };

    const onError = (error: ErrorEvent) => {
      console.error("error", error);
    };

    const stopAudioStreamer = () => audioStreamerRef.current?.stop();

    // --------------------------------------------------------------
    // 🎧 NEW — HANDLE AGENT AUDIO + SEND COPY TO BACKEND
    // --------------------------------------------------------------
    const onAudio = (data: ArrayBuffer) => {
      // تشغيل الصوت للمستخدم
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));

      // تسجيل صوت الإيجنت → إرسال للباك إند
      const recordingId =
        (window as any).__E_DENTIST_RECORDING_ID__ as string | null;

      if (recordingId) {
        const base64 = arrayBufferToBase64(data);

        fetch("/api/voice-recording/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordingId,
            source: "agent",
            base64,
          }),
        }).catch(() => {
          // لا نريد كسر أي شيء لو صار خطأ أثناء التسجيل
        });
      }
    };

    // Attach listeners
    client
      .on("error", onError)
      .on("open", onOpen)
      .on("close", onClose)
      .on("interrupted", stopAudioStreamer)
      .on("audio", onAudio);

    // Cleanup
    return () => {
      client
        .off("error", onError)
        .off("open", onOpen)
        .off("close", onClose)
        .off("interrupted", stopAudioStreamer)
        .off("audio", onAudio)
        .disconnect();
    };
  }, [client]);

  // --------------------------------------------------------------
  // CONNECT / DISCONNECT
  // --------------------------------------------------------------
  const connect = useCallback(async () => {
    if (!config) throw new Error("config has not been set");
    client.disconnect();
    await client.connect(model, config);
  }, [client, config, model]);

  const disconnect = useCallback(async () => {
    client.disconnect();
    setConnected(false);
  }, [setConnected, client]);

  return {
    client,
    config,
    setConfig,
    model,
    setModel,
    connected,
    connect,
    disconnect,
    volume,
  };
}

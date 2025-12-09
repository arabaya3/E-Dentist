/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GenAILiveClient } from "../lib/genai-live-client";
import { LiveClientOptions } from "../types";
import { AudioStreamer } from "../lib/audio-streamer";
import { audioContext } from "../lib/utils";
import VolMeterWorket from "../lib/worklets/vol-meter";
import { LiveConnectConfig } from "@google/genai";
import { GEMINI_LIVE_MODEL } from "../config";


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

  /* ---------------------- ⭐ NEW ---------------------- */
  // نخزن صوت الـ Agent خام (PCM16)
  const agentPcmChunksRef = useRef<Uint8Array[]>([]);
  /* --------------------------------------------------- */

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

  useEffect(() => {
    const onOpen = () => {
      setConnected(true);

      /* ⭐ NEW: نبدأ تسجيل صوت الـ Agent */
      agentPcmChunksRef.current = [];
    };

    const onClose = () => {
      setConnected(false);

      /* ⭐ NEW: عند إغلاق الجلسة – ننتج ملف WAV للـ Agent */
      if (agentPcmChunksRef.current.length > 0) {
        const wavBlob = pcmChunksToWav(agentPcmChunksRef.current, 16000);

        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `agent-call-${Date.now()}.wav`;
        a.click();

        URL.revokeObjectURL(url);
      }
    };

    const onError = (error: ErrorEvent) => {
      console.error("error", error);
    };

    const stopAudioStreamer = () => audioStreamerRef.current?.stop();

    const onAudio = (data: ArrayBuffer) => {
      const pcm = new Uint8Array(data);

      /* ⭐ NEW: تسجيل صوت الـ Agent هنا */
      agentPcmChunksRef.current.push(pcm);

      /* تشغيل الصوت كالعادة */
      audioStreamerRef.current?.addPCM16(pcm);
    };

    client
      .on("error", onError)
      .on("open", onOpen)
      .on("close", onClose)
      .on("interrupted", stopAudioStreamer)
      .on("audio", onAudio);

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

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error("config has not been set");
    }
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

/* -----------------------------------------------------------
    🔥 NEW FUNCTION  
    تحويل PCM chunks → WAV Blob
----------------------------------------------------------- */
function pcmChunksToWav(chunks: Uint8Array[], sampleRate = 16000): Blob {
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const buffer = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  // WAV header
  const wavHeader = createWavHeader(buffer.length, sampleRate);

  const wavBuffer = new Uint8Array(wavHeader.length + buffer.length);
  wavBuffer.set(wavHeader, 0);
  wavBuffer.set(buffer, wavHeader.length);

  return new Blob([wavBuffer], { type: "audio/wav" });
}

function createWavHeader(dataSize: number, sampleRate: number) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  return new Uint8Array(header);
}

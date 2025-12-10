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
import { base64ToUint8Array } from "../lib/voice-engine/audio-utils";
import { pcm16ToWavBlob } from "../lib/voice-engine/audio-utils";


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
  recordUserAudio: (base64Audio: string) => void; // ⭐ NEW: لتسجيل صوت المستخدم
  uploadStatus: { type: 'success' | 'error' | null; message: string } | null; // ⭐ NEW: حالة الرفع
};

// نوع لتسجيل جزء من المحادثة مع توقيت
type ConversationChunk = {
  timestamp: number; // الوقت منذ بداية الجلسة بالميلي ثانية
  type: "user" | "agent";
  pcmData: Uint8Array;
};

export function useLiveAPI(options: LiveClientOptions): UseLiveAPIResults {
  const client = useMemo(() => new GenAILiveClient(options), [options]);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [model, setModel] = useState<string>(GEMINI_LIVE_MODEL);
  const [config, setConfig] = useState<LiveConnectConfig>({});
  const [connected, setConnected] = useState(false);
  const [volume, setVolume] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error' | null; message: string } | null>(null);

  /* ---------------------- ⭐ NEW: تسجيل المحادثة الكاملة ---------------------- */
  const conversationChunksRef = useRef<ConversationChunk[]>([]);
  const sessionStartTimeRef = useRef<number | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  /* --------------------------------------------------------------------------- */

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

      /* ⭐ NEW: نبدأ تسجيل المحادثة الكاملة */
      conversationChunksRef.current = [];
      sessionStartTimeRef.current = Date.now();
      isRecordingRef.current = true;
    };

    const onClose = async () => {
      setConnected(false);
      isRecordingRef.current = false;

      /* ⭐ NEW: عند إغلاق الجلسة – ندمج المحادثة و نرفعها إلى Google Cloud */
      if (conversationChunksRef.current.length > 0 && sessionStartTimeRef.current) {
        try {
          // إظهار رسالة "جاري الرفع..."
          setUploadStatus({ type: null, message: "جاري رفع تسجيل المحادثة..." });

          // دمج المحادثة في ملف واحد
          const mergedAudio = mergeConversationChunks(
            conversationChunksRef.current,
            16000
          );
          const wavBlob = pcm16ToWavBlob([mergedAudio], 16000);

          // رفع الملف إلى Google Cloud Storage
          const result = await uploadToCloudStorage(wavBlob, sessionStartTimeRef.current);
          
          // إظهار رسالة نجاح
          setUploadStatus({
            type: 'success',
            message: `تم رفع تسجيل المحادثة بنجاح! الملف: ${result.fileName || 'conversation.wav'}`,
          });

          // إخفاء الرسالة بعد 5 ثواني
          setTimeout(() => {
            setUploadStatus(null);
          }, 5000);
        } catch (error) {
          console.error("[voice-agent] Failed to save conversation:", error);
          
          // إظهار رسالة خطأ مع السبب
          const errorMessage = error instanceof Error 
            ? error.message 
            : "حدث خطأ غير معروف أثناء رفع التسجيل";
          
          setUploadStatus({
            type: 'error',
            message: `فشل رفع تسجيل المحادثة: ${errorMessage}`,
          });

          // إخفاء الرسالة بعد 8 ثواني (أطول للرسائل الخطأ)
          setTimeout(() => {
            setUploadStatus(null);
          }, 8000);
        }
      }
    };

    const onError = (error: ErrorEvent) => {
      console.error("error", error);
    };

    const stopAudioStreamer = () => audioStreamerRef.current?.stop();

    const onAudio = (data: ArrayBuffer) => {
      const pcm = new Uint8Array(data);

      /* ⭐ NEW: تسجيل صوت الـ Agent مع التوقيت */
      if (isRecordingRef.current && sessionStartTimeRef.current) {
        const timestamp = Date.now() - sessionStartTimeRef.current;
        conversationChunksRef.current.push({
          timestamp,
          type: "agent",
          pcmData: pcm,
        });
      }

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

  // ⭐ NEW: دالة لتسجيل صوت المستخدم
  const recordUserAudio = useCallback((base64Audio: string) => {
    if (isRecordingRef.current && sessionStartTimeRef.current) {
      const timestamp = Date.now() - sessionStartTimeRef.current;
      const pcmData = base64ToUint8Array(base64Audio);
      conversationChunksRef.current.push({
        timestamp,
        type: "user",
        pcmData,
      });
    }
  }, []);

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
    recordUserAudio,
    uploadStatus,
  };
}

/* -----------------------------------------------------------
    🔥 NEW FUNCTIONS  
    دمج المحادثة ورفعها إلى Google Cloud Storage
----------------------------------------------------------- */

/**
 * دمج أجزاء المحادثة في ملف صوتي واحد مع الحفاظ على الترتيب الزمني
 */
function mergeConversationChunks(
  chunks: ConversationChunk[],
  sampleRate: number
): Uint8Array {
  if (chunks.length === 0) {
    return new Uint8Array(0);
  }

  // ترتيب الأجزاء حسب التوقيت
  const sortedChunks = [...chunks].sort((a, b) => a.timestamp - b.timestamp);

  // حساب المدة الإجمالية بالميلي ثانية
  const lastChunk = sortedChunks[sortedChunks.length - 1];
  const lastChunkDuration = (lastChunk.pcmData.length / 2 / sampleRate) * 1000;
  const totalDurationMs = lastChunk.timestamp + lastChunkDuration;

  // حساب الحجم الإجمالي بالبايت
  const totalSamples = Math.ceil((totalDurationMs / 1000) * sampleRate);
  const totalBytes = totalSamples * 2; // 16-bit = 2 bytes per sample

  const merged = new Uint8Array(totalBytes);
  let currentOffset = 0;

  for (let i = 0; i < sortedChunks.length; i++) {
    const chunk = sortedChunks[i];
    const chunkStartByte = Math.floor((chunk.timestamp / 1000) * sampleRate * 2);

    // التأكد من عدم التداخل
    if (chunkStartByte >= currentOffset) {
      currentOffset = chunkStartByte;
    }

    // نسخ البيانات
    const endOffset = currentOffset + chunk.pcmData.length;
    if (endOffset <= merged.length) {
      merged.set(chunk.pcmData, currentOffset);
      currentOffset = endOffset;
    }
  }

  return merged;
}

/**
 * رفع الملف إلى Google Cloud Storage
 */
async function uploadToCloudStorage(blob: Blob, sessionStartTime: number): Promise<{ fileName: string; url?: string }> {
  const API_BASE = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/$/, "");
  const uploadUrl = `${API_BASE}/api/voice/upload-recording`;

  const formData = new FormData();
  const filename = `conversation-${sessionStartTime}.wav`;
  formData.append("audio", blob, filename);
  formData.append("sessionStartTime", sessionStartTime.toString());

  try {
    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `فشل الرفع (رمز الخطأ: ${response.status})`;
      
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
        
        // إضافة تفاصيل إضافية إذا كانت متوفرة
        if (errorData.details) {
          errorMessage += ` - ${errorData.details}`;
        }
      } catch (parseError) {
        // إذا فشل parsing JSON، استخدم رسالة افتراضية
        const text = await response.text().catch(() => "");
        if (text) {
          errorMessage += ` - ${text}`;
        }
      }
      
      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log("[voice-agent] Conversation uploaded successfully:", result);
    
    return {
      fileName: result.fileName || filename,
      url: result.url,
    };
  } catch (error) {
    console.error("[voice-agent] Failed to upload conversation:", error);
    
    // تحسين رسالة الخطأ
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error("فشل الاتصال بالخادم. تحقق من اتصال الإنترنت.");
    }
    
    throw error;
  }
}

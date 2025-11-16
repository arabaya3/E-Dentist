import { useEffect, useRef } from "react";
import { useLiveAPIContext } from "../contexts/LiveAPIContext";
import { ClientContentLog, StreamingLog } from "../types";
import { sanitizeSensitiveText } from "../lib/security";

type AnalyticsEvent =
  | {
      type: "session_started";
      sessionId: string;
      timestamp: number;
    }
  | {
      type: "session_closed";
      sessionId: string;
      timestamp: number;
      success?: boolean;
      reason?: string;
    }
  | {
      type: "turn";
      sessionId: string;
      role: "user" | "assistant";
      text: string;
      timestamp: number;
      turnId?: string;
    };

const ANALYTICS_ENDPOINT = "/api/analytics/events";

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const flushEvent = async (payload: AnalyticsEvent) => {
  const body = JSON.stringify(payload);
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    const blob = new Blob([body], { type: "application/json" });
    const sent = navigator.sendBeacon(ANALYTICS_ENDPOINT, blob);
    if (sent) {
      return;
    }
  }
  try {
    await fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      keepalive: true,
    });
  } catch (error) {
    console.warn("[analytics] Failed to send event", error);
  }
};

const extractUserText = (message: StreamingLog["message"]) => {
  if (!message || typeof message !== "object") {
    return null;
  }
  if (!("turns" in message)) {
    return null;
  }
  const { turns } = message as ClientContentLog;
  if (!Array.isArray(turns)) {
    return null;
  }
  const text = turns
    .map((part) =>
      "text" in part && typeof part.text === "string" ? part.text : ""
    )
    .filter(Boolean)
    .map((value) => sanitizeSensitiveText(value))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length ? text : null;
};

const extractAssistantText = (message: StreamingLog["message"]) => {
  if (!message || typeof message !== "object") {
    return null;
  }
  if (!("serverContent" in message)) {
    return null;
  }
  const serverContent = (message as any).serverContent;
  if (!serverContent || typeof serverContent !== "object") {
    return null;
  }
  if (!("modelTurn" in serverContent)) {
    return null;
  }
  const modelTurn = serverContent.modelTurn;
  if (!modelTurn || !Array.isArray(modelTurn.parts)) {
    return null;
  }
  const text = modelTurn.parts
    .map((part: any) =>
      part && typeof part === "object" && typeof part.text === "string"
        ? sanitizeSensitiveText(part.text)
        : ""
    )
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length ? text : null;
};

export function useAnalyticsBridge() {
  const { client } = useLiveAPIContext();
  const sessionIdRef = useRef<string | null>(null);
  const processedLogKeysRef = useRef<string[]>([]);

  const resolveClientSessionId = () => {
    const session = client.session as { id?: string; name?: string } | null;
    return session?.id ?? session?.name ?? null;
  };

  const rememberLogKey = (key: string) => {
    const existing = processedLogKeysRef.current;
    if (existing.includes(key)) {
      return false;
    }
    existing.push(key);
    if (existing.length > 500) {
      existing.splice(0, existing.length - 500);
    }
    return true;
  };

  const ensureSession = async () => {
    if (!sessionIdRef.current) {
      const derivedId = resolveClientSessionId() ?? createId();
      sessionIdRef.current = derivedId;
      await flushEvent({
        type: "session_started",
        sessionId: derivedId,
        timestamp: Date.now(),
      });
    }
    return sessionIdRef.current!;
  };

  useEffect(() => {
    const onOpen = async () => {
      const derivedId = resolveClientSessionId() ?? createId();
      sessionIdRef.current = derivedId;
      processedLogKeysRef.current = [];
      await flushEvent({
        type: "session_started",
        sessionId: derivedId,
        timestamp: Date.now(),
      });
    };

    const onClose = async () => {
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        await flushEvent({
          type: "session_closed",
          sessionId,
          timestamp: Date.now(),
        });
      }
      sessionIdRef.current = null;
      processedLogKeysRef.current = [];
    };

    client.on("open", onOpen);
    client.on("close", onClose);

    return () => {
      client.off("open", onOpen);
      client.off("close", onClose);
    };
  }, [client]);

  useEffect(() => {
    const onLog = async (log: StreamingLog) => {
      const keyRoot = `${log.type}|${log.date?.getTime?.() || Date.now()}`;

      if (log.type === "client.send") {
        const text = extractUserText(log.message);
        if (!text) {
          return;
        }
        const key = `${keyRoot}|${text}`;
        if (!rememberLogKey(key)) {
          return;
        }
        const sessionId = await ensureSession();
        await flushEvent({
          type: "turn",
          sessionId,
          role: "user",
          text,
          timestamp: log.date instanceof Date ? log.date.getTime() : Date.now(),
          turnId: createId(),
        });
      }

      if (log.type === "server.content") {
        const text = extractAssistantText(log.message);
        if (!text) {
          return;
        }
        const key = `${keyRoot}|${text}`;
        if (!rememberLogKey(key)) {
          return;
        }
        const sessionId = await ensureSession();
        await flushEvent({
          type: "turn",
          sessionId,
          role: "assistant",
          text,
          timestamp: log.date instanceof Date ? log.date.getTime() : Date.now(),
          turnId: createId(),
        });
      }
    };

    client.on("log", onLog);

    return () => {
      client.off("log", onLog);
    };
  }, [client]);
}


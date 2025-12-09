import { useEffect, useMemo, useState } from "react";
import "./SimpleVoiceConsole.scss";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { AudioRecorder } from "../../lib/audio-recorder";
import AudioPulse from "../audio-pulse/AudioPulse";

const MIC_MIME_TYPE = "audio/pcm;rate=16000";

export default function SimpleVoiceConsole() {
  const { client, connected, connect, disconnect, volume } = useLiveAPIContext();
  const [muted, setMuted] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isStartingMic, setIsStartingMic] = useState(false);
  const [audioRecorder] = useState(() => new AudioRecorder());

  // NEW → Recording State
  const [recordingId, setRecordingId] = useState<string | null>(null);

  // store recording ID globally (so use-live-api.ts can access it)
  useEffect(() => {
    (window as any).__E_DENTIST_RECORDING_ID__ = recordingId;
  }, [recordingId]);

  // NEW → Start Backend Recording Session
  const startBackendRecording = async () => {
    try {
      const res = await fetch("/api/voice-recording/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: {} }),
      });

      if (!res.ok) {
        console.warn("[voice-agent] Failed to start backend recording");
        return;
      }

      const data = await res.json();
      setRecordingId(data.recordingId);
    } catch (err) {
      console.warn("[voice-agent] Error starting backend recording", err);
    }
  };

  // NEW → Stop Backend Recording + save WAV files
  const stopBackendRecording = async () => {
    if (!recordingId) return;

    try {
      await fetch("/api/voice-recording/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId }),
      });
    } catch (err) {
      console.warn("[voice-agent] Error stopping backend recording", err);
    } finally {
      setRecordingId(null);
    }
  };

  // ============================================================
  //  CLIENT ERROR HANDLER
  // ============================================================
  useEffect(() => {
    const handleClientError = (evt: ErrorEvent) => {
      setError(
        evt.message || "We hit an issue connecting to the voice service."
      );
      setIsConnecting(false);
    };

    client.on("error", handleClientError);

    return () => {
      client.off("error", handleClientError);
    };
  }, [client]);

  // ============================================================
  //  MICROPHONE STREAM HANDLER (SEND AUDIO + RECORDING)
  // ============================================================
  useEffect(() => {
    const handleData = (base64: string) => {
      if (!connected || muted) return;

      // send audio to voice agent (Gemini)
      client.sendRealtimeInput([
        {
          mimeType: MIC_MIME_TYPE,
          data: base64,
        },
      ]);

      // NEW → also send audio to backend recorder
      if (recordingId) {
        fetch("/api/voice-recording/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordingId,
            source: "user",
            base64,
          }),
        }).catch(() => {});
      }
    };

    const handleVolume = (next: number) => setMicVolume(next);

    audioRecorder.on("data", handleData);
    audioRecorder.on("volume", handleVolume);

    if (connected && !muted) {
      setIsStartingMic(true);
      audioRecorder
        .start()
        .then(() => setIsStartingMic(false))
        .catch((err: unknown) => {
          const message =
            err instanceof Error
              ? err.message
              : "Unable to access the microphone. Please check permissions.";
          setError(message);
          setMuted(true);
          setIsStartingMic(false);
        });
    } else {
      audioRecorder.stop();
      setIsStartingMic(false);
    }

    return () => {
      audioRecorder.off("data", handleData);
      audioRecorder.off("volume", handleVolume);
      audioRecorder.stop();
    };
  }, [audioRecorder, client, connected, muted, recordingId]);

  // ============================================================
  //  CONNECTION STATUS
  // ============================================================
  useEffect(() => {
    if (connected) {
      setIsConnecting(false);
    } else {
      setMicVolume(0);
    }
  }, [connected]);

  // ============================================================
  //  UI TEXT
  // ============================================================
  const statusText = useMemo(() => {
    if (error) {
      return "Something went wrong. Please try again.";
    }
    if (connected && !muted) {
      return "The assistant is listening and ready to respond.";
    }
    if (connected && muted) {
      return "The assistant is connected, microphone is muted.";
    }
    if (isConnecting) {
      return "Connecting to the voice assistant...";
    }
    return "Press start to begin a voice conversation.";
  }, [connected, error, isConnecting, muted]);

  const connectLabel = connected ? "End session" : "Start session";

  // ============================================================
  //  CONNECT / DISCONNECT + START / STOP RECORDING
  // ============================================================
  const handleConnectionToggle = async () => {
    setError(null);

    if (connected) {
      await disconnect();
      await stopBackendRecording();   // ← NEW
      setMuted(false);
      return;
    }

    try {
      setIsConnecting(true);
      await connect();
      await startBackendRecording();  // ← NEW
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to start the connection. Please try again.";
      setError(message);
      setIsConnecting(false);
    }
  };

  const handleMuteToggle = () => {
    setMuted((prev) => !prev);
  };

  const muteLabel = muted ? "Unmute microphone" : "Mute microphone";

  // ============================================================
  //  UI
  // ============================================================
  return (
    <div className="voice-console" dir="ltr">
      <header className="voice-console__header">
        <h1>eDentist.AI</h1>
        <p>Voice assistant dedicated to dental clinics</p>
      </header>

      <section className="voice-console__status" aria-live="polite">
        <span
          className={`status-indicator${connected ? " status-indicator--online" : ""}`}
          aria-hidden="true"
        />
        <span>{statusText}</span>
      </section>

      <section className="voice-console__meters">
        <div className="voice-console__meter">
          <span className="voice-console__meter-label">Microphone</span>
          <AudioPulse active={connected && !muted && !isStartingMic} volume={micVolume} />
        </div>
        <div className="voice-console__meter">
          <span className="voice-console__meter-label">Assistant response</span>
          <AudioPulse active={connected} volume={volume} />
        </div>
      </section>

      {error ? (
        <div className="voice-console__error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="voice-console__actions">
        <button
          type="button"
          onClick={handleConnectionToggle}
          disabled={isConnecting || isStartingMic}
          className="voice-console__button voice-console__button--primary"
        >
          {isConnecting ? "Starting..." : connectLabel}
        </button>
        <button
          type="button"
          onClick={handleMuteToggle}
          disabled={!connected || isStartingMic}
          className="voice-console__button"
        >
          {isStartingMic ? "Enabling microphone..." : muteLabel}
        </button>
      </section>

      <p className="voice-console__hint">
        Speak in Arabic or English and you will hear the assistant reply instantly.
      </p>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import "./ai-dashboard.scss";
import { getAuthToken } from "../security";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";

type DashboardTotals = {
  totalCalls: number;
  successRate: number;
  accuracy?: number;
  averageResponseMs: number;
  hallucinationRate: number;
};

type DashboardMetrics = {
  accuracy?: number;
  latencyMs?: number;
  hallucinationRate?: number;
};

type DashboardReport = {
  totals: DashboardTotals;
  metrics?: DashboardMetrics;
  activeSessions?: ActiveSession[];
  recentSessions?: SessionSummary[];
};

type ActiveSession = {
  sessionId: string;
  startedAt: number;
  lastUpdate: number;
  currentIntent?: string;
  userTurns?: number;
  assistantTurns?: number;
  hallucinations?: number;
  dominantSentiment?: string;
  lastMessage?: {
    role: string;
    text: string;
    timestamp: number;
  } | null;
};

type SessionSummary = {
  sessionId: string;
  status: string;
  success: boolean | null;
  dominantSentiment: string;
  averageResponseMs: number;
  lastUpdate: number;
};

type MetricCard = {
  id: string;
  label: string;
  value: string;
  helper?: string;
};

const VOICE_OPTIONS = [
  {
    id: "ar_friendly_female",
    label: "Friendly Arabic Female Voice",
    voiceName: "Farah",
    locale: "ar",
  },
  {
    id: "en_professional_male",
    label: "Professional English Male",
    voiceName: "Daniel",
    locale: "en",
  },
];

const PLAYGROUND_SCRIPTS = [
  "Welcome to eDentist Clinic. How can I help you today?",
  "Would you like to confirm your appointment or schedule a new one?",
  "Reminder: you have a dental cleaning tomorrow at 6 PM.",
  "Thank you for calling eDentist. Have a great day!",
];

const TOKEN_EVENT = "ed-auth-token-changed";

export default function AIDashboard() {
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authVersion, setAuthVersion] = useState(0);

  const [voiceName, setVoiceName] = useState<string>(
    VOICE_OPTIONS[0].voiceName
  );
  const [voicePreviewScript, setVoicePreviewScript] = useState<string>(
    PLAYGROUND_SCRIPTS[0]
  );
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const { config, setConfig, connect, disconnect, connected, volume } =
    useLiveAPIContext();

  useEffect(() => {
    const configuredVoice =
      config?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName;
    if (configuredVoice) {
      setVoiceName(configuredVoice);
    }
  }, [config]);

  const fetchReport = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setError("The dashboard requires a valid JWT token.");
      setReport(null);
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/analytics/report", {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload: DashboardReport = await response.json();
      setReport(payload);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to refresh the operations dashboard right now."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
    const interval = window.setInterval(fetchReport, 6000);
    return () => {
      window.clearInterval(interval);
    };
  }, [authVersion, fetchReport]);

  useEffect(() => {
    const handler = () => setAuthVersion((prev) => prev + 1);
    window.addEventListener(TOKEN_EVENT, handler);
    return () => window.removeEventListener(TOKEN_EVENT, handler);
  }, []);

  const metrics = useMemo<MetricCard[]>(() => {
    if (!report || !report.totals) {
      return [];
    }
    const totals = report.totals;
    const metricSource = report.metrics ?? {};
    const accuracyValue =
      metricSource.accuracy ?? totals.accuracy ?? totals.successRate;
    return [
      {
        id: "accuracy",
        label: "Model Accuracy",
        value: `${accuracyValue.toFixed(1)}%`,
        helper: `Out of ${totals.totalCalls} calls`,
      },
      {
        id: "latency",
        label: "Avg Latency",
        value: `${Math.round(
          metricSource.latencyMs ?? totals.averageResponseMs
        )} ms`,
        helper: "User-to-response latency",
      },
      {
        id: "hallucination",
        label: "Hallucination Rate",
        value: `${(
          metricSource.hallucinationRate ?? totals.hallucinationRate
        ).toFixed(1)}%`,
        helper: "Share of potentially incorrect responses",
      },
    ];
  }, [report]);

  const activeSessions = report?.activeSessions ?? [];
  const recentSessions = report?.recentSessions ?? [];

  const volumePercent = Math.min(
    100,
    Math.max(0, Math.round((volume ?? 0) * 100))
  );

  const handleVoiceChange = (value: string) => {
    setVoiceName(value);
    const selected = VOICE_OPTIONS.find((option) => option.voiceName === value);
    const voiceConfig = selected
      ? {
          prebuiltVoiceConfig: {
            voiceName: selected.voiceName,
            languageCode:
              selected.locale === "ar" ? "ar-XA" : "en-US",
            speakingRate: 0.95,
          },
        }
      : {
          prebuiltVoiceConfig: {
            voiceName: value,
            speakingRate: 0.95,
          },
        };
    const nextConfig = {
      ...config,
      speechConfig: {
        ...(config?.speechConfig ?? {}),
        voiceConfig,
      },
    };
    setConfig(nextConfig);
    setVoiceMessage(`Voice switched to ${value}.`);
  };

  const handleConnect = async () => {
    setVoiceBusy(true);
    setVoiceMessage(null);
    try {
      await connect();
      setVoiceMessage("Connected to the voice engine.");
    } catch (error) {
      setVoiceMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect to the voice engine."
      );
    } finally {
      setVoiceBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setVoiceBusy(true);
    setVoiceMessage(null);
    try {
      await disconnect();
      setVoiceMessage("Voice engine disconnected.");
    } catch (error) {
      setVoiceMessage(
        error instanceof Error
          ? error.message
          : "Unable to stop the voice engine."
      );
    } finally {
      setVoiceBusy(false);
    }
  };

  if (isLoading) {
    return (
      <section className="ai-dashboard loading">
        <span>Loading operations dashboard...</span>
      </section>
    );
  }

  if (error) {
    return (
      <section className="ai-dashboard error">
        <span>⚠️ {error}</span>
      </section>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <section className="ai-dashboard">
      <header className="ai-dashboard__header">
        <h2>AI Operations Dashboard</h2>
        <span className={connected ? "status connected" : "status"}>
          {connected ? "Connected to voice engine" : "Disconnected"}
        </span>
      </header>

      <div className="ai-dashboard__metrics">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.id}>
            <h3>{metric.label}</h3>
            <p>{metric.value}</p>
            {metric.helper && <span>{metric.helper}</span>}
          </article>
        ))}
      </div>

      <div className="ai-dashboard__grid">
        <section className="panel active-sessions">
          <div className="panel__header">
            <h3>Active sessions</h3>
            <span>{activeSessions.length} session(s)</span>
          </div>
          {activeSessions.length === 0 ? (
            <p className="empty-state">No active sessions at the moment.</p>
          ) : (
            <ul>
              {activeSessions.map((session) => (
                <li key={session.sessionId}>
                  <header>
                    <strong>Session {session.sessionId.slice(0, 6)}...</strong>
                    <span className="intent">
                      {session.currentIntent ?? "UNKNOWN"}
                    </span>
                  </header>
                  <div className="details">
                    <span>
                      Started:{" "}
                      {new Date(session.startedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>
                      Last update:{" "}
                      {new Date(session.lastUpdate).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  {session.lastMessage?.text && (
                    <p className="last-message">
                      <strong>
                        {session.lastMessage.role === "assistant"
                          ? "Assistant"
                          : "User"}
                        :
                      </strong>{" "}
                      {session.lastMessage.text}
                    </p>
                  )}
                  <footer>
                    <span>🎯 {session.dominantSentiment ?? "Not set"}</span>
                    <span>🤖 {session.assistantTurns ?? 0} replies</span>
                    <span>❗ {session.hallucinations ?? 0} flags</span>
                  </footer>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel voice-control">
          <h3>Voice model management</h3>
          <label htmlFor="voice-select">Current voice</label>
          <select
            id="voice-select"
            value={voiceName}
            onChange={(event) => handleVoiceChange(event.target.value)}
          >
            {VOICE_OPTIONS.map((voice) => (
              <option key={voice.id} value={voice.voiceName}>
                {voice.label}
              </option>
            ))}
          </select>

          <div className="voice-actions">
            <button
              type="button"
              onClick={handleConnect}
              disabled={voiceBusy || connected}
            >
              {voiceBusy && !connected ? "Connecting..." : "Connect"}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={voiceBusy || !connected}
            >
              {voiceBusy && connected ? "Stopping..." : "Disconnect"}
            </button>
          </div>

          <div className="volume-indicator">
            <span>Volume indicator</span>
            <div className="bar">
              <div className="fill" style={{ width: `${volumePercent}%` }} />
            </div>
            <span className="value">{volumePercent}%</span>
          </div>

          <div className="voice-playground">
            <label htmlFor="voice-preview">Voice Playground</label>
            <select
              id="voice-preview"
              value={voicePreviewScript}
              onChange={(event) => setVoicePreviewScript(event.target.value)}
            >
              {PLAYGROUND_SCRIPTS.map((script, index) => (
                <option key={index} value={script}>
                  {script.slice(0, 48)}...
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setVoiceMessage(`Playing sample: "${voicePreviewScript}"`);
              }}
            >
              Play sample
            </button>
            <p className="voice-hint">
              Speaking rate is fixed at 0.95 to keep responses natural.
            </p>
          </div>

          {voiceMessage && <p className="voice-message">{voiceMessage}</p>}
        </section>

        <section className="panel recent-conversations">
          <h3>Recent sessions</h3>
          {recentSessions.length === 0 ? (
            <p className="empty-state">No sessions recorded.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Status</th>
                  <th>Sentiment</th>
                  <th>Response</th>
                  <th>Last update</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.slice(0, 6).map((session) => (
                  <tr key={session.sessionId}>
                    <td>{session.sessionId.slice(0, 8)}...</td>
                    <td>{session.status}</td>
                    <td>{session.dominantSentiment}</td>
                    <td>{Math.round(session.averageResponseMs)} ms</td>
                    <td>
                      {new Date(session.lastUpdate).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </section>
  );
}


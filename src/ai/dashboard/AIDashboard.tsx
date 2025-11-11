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
    label: "صوت عربي أنثوي (ودود)",
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
  "مرحباً بكم في عيادة eDentist، كيف يمكنني مساعدتك اليوم؟",
  "هل ترغب بتأكيد موعدك أو حجز موعد جديد؟",
  "تذكير: لديك موعد تنظيف الأسنان غداً الساعة 6 مساءً.",
  "شكراً لزيارتك، نتمنى لك يوماً سعيداً!",
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
      setError("يتطلب الوصول إلى لوحة المراقبة توفير رمز JWT صالح.");
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
          : "تعذر تحديث لوحة التحكم التقنية حالياً."
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
        helper: `من أصل ${totals.totalCalls} مكالمة`,
      },
      {
        id: "latency",
        label: "Avg Latency",
        value: `${Math.round(
          metricSource.latencyMs ?? totals.averageResponseMs
        )} ms`,
        helper: "زمن الاستجابة من المستخدم إلى الرد",
      },
      {
        id: "hallucination",
        label: "Hallucination Rate",
        value: `${(
          metricSource.hallucinationRate ?? totals.hallucinationRate
        ).toFixed(1)}%`,
        helper: "نسبة الردود المحتمل أنها خاطئة",
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
    setVoiceMessage(`تم تعيين الصوت إلى ${value}.`);
  };

  const handleConnect = async () => {
    setVoiceBusy(true);
    setVoiceMessage(null);
    try {
      await connect();
      setVoiceMessage("تم الاتصال بمحرك الصوت.");
    } catch (error) {
      setVoiceMessage(
        error instanceof Error
          ? error.message
          : "تعذر الاتصال بمحرك الصوت."
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
      setVoiceMessage("تم إنهاء الاتصال الصوتي.");
    } catch (error) {
      setVoiceMessage(
        error instanceof Error
          ? error.message
          : "تعذر إيقاف الاتصال الصوتي."
      );
    } finally {
      setVoiceBusy(false);
    }
  };

  if (isLoading) {
    return (
      <section className="ai-dashboard loading">
        <span>جارٍ تحميل لوحة التحكم التقنية...</span>
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
        <h2>لوحة فريق الذكاء الاصطناعي</h2>
        <span className={connected ? "status connected" : "status"}>
          {connected ? "متصل بمحرك الصوت" : "غير متصل"}
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
            <h3>الجلسات النشطة</h3>
            <span>{activeSessions.length} جلسة</span>
          </div>
          {activeSessions.length === 0 ? (
            <p className="empty-state">لا توجد جلسات نشطة حالياً.</p>
          ) : (
            <ul>
              {activeSessions.map((session) => (
                <li key={session.sessionId}>
                  <header>
                    <strong>جلسة {session.sessionId.slice(0, 6)}...</strong>
                    <span className="intent">
                      {session.currentIntent ?? "UNKNOWN"}
                    </span>
                  </header>
                  <div className="details">
                    <span>
                      بدء:{" "}
                      {new Date(session.startedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>
                      آخر تحديث:{" "}
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
                          ? "المساعد"
                          : "المستخدم"}
                        :
                      </strong>{" "}
                      {session.lastMessage.text}
                    </p>
                  )}
                  <footer>
                    <span>🎯 {session.dominantSentiment ?? "غير محدد"}</span>
                    <span>🤖 {session.assistantTurns ?? 0} ردود</span>
                    <span>❗ {session.hallucinations ?? 0} ملاحظات</span>
                  </footer>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel voice-control">
          <h3>إدارة النماذج الصوتية</h3>
          <label htmlFor="voice-select">الصوت الحالي</label>
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
              {voiceBusy && !connected ? "جارٍ الاتصال..." : "اتصال"}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={voiceBusy || !connected}
            >
              {voiceBusy && connected ? "جارٍ الإيقاف..." : "إيقاف"}
            </button>
          </div>

          <div className="volume-indicator">
            <span>مؤشر الصوت</span>
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
                setVoiceMessage(`تشغيل عينة: "${voicePreviewScript}"`);
              }}
            >
              تشغيل العينة
            </button>
            <p className="voice-hint">
              معدل النطق مضبوط على 0.95 لتقديم تجربة قريبة من الأسلوب الطبيعي.
            </p>
          </div>

          {voiceMessage && <p className="voice-message">{voiceMessage}</p>}
        </section>

        <section className="panel recent-conversations">
          <h3>آخر الجلسات</h3>
          {recentSessions.length === 0 ? (
            <p className="empty-state">لا توجد جلسات مسجلة.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>الجلسة</th>
                  <th>الحالة</th>
                  <th>المشاعر</th>
                  <th>الاستجابة</th>
                  <th>آخر تحديث</th>
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


import { useEffect, useMemo, useRef, useState } from "react";
import vegaEmbed, { type VisualizationSpec } from "vega-embed";
import "./analytics-dashboard.scss";
import {
  listConfiguredProviders,
  pushPerformanceReport,
  type PMSProvider,
  type ProviderSummary,
} from "../integrations";
import {
  getAuthToken,
  setAuthToken,
  requestAuthToken,
} from "../security";

type SentimentLabel = "satisfied" | "concerned" | "angry";

type SentimentDistributionItem = {
  label: SentimentLabel;
  count: number;
  percentage: number;
};

type SentimentSnapshot = {
  turnId: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  sentiment?: SentimentLabel;
  confidence?: number;
};

type SessionSummary = {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  status: "active" | "completed";
  success: boolean | null;
  successReason: string | null;
  totalTurns: number;
  assistantTurns: number;
  hallucinations: number;
  averageResponseMs: number;
  averageSentimentScore: number;
  dominantSentiment: SentimentLabel;
  lastUpdate: number;
  userSentimentTrend: SentimentSnapshot[];
};

type TimelineEntry = {
  turnId: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

type PerformanceReport = {
  generatedAt: number;
  totals: {
    totalCalls: number;
    activeCalls: number;
    completedCalls: number;
    successfulCalls: number;
    failedCalls: number;
    successRate: number;
    averageResponseMs: number;
    averageSentimentScore: number;
    hallucinationRate: number;
  };
  sentimentDistribution: SentimentDistributionItem[];
  recentSessions: SessionSummary[];
  latestTimeline: {
    sessionId: string;
    timeline: TimelineEntry[];
  } | null;
};

const formatMs = (value: number) => {
  if (!value) {
    return "0 s";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  if (value < 60_000) {
    return `${(value / 1000).toFixed(1)} s`;
  }
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes} min ${seconds}s`;
};

const sentimentTranslations: Record<SentimentLabel, string> = {
  satisfied: "رضا",
  concerned: "قلق",
  angry: "غضب",
};

const statusLabel = (session: SessionSummary) => {
  if (session.status === "active") {
    return "قيد التنفيذ";
  }
  if (session.success === true) {
    return "ناجحة";
  }
  if (session.success === false) {
    return "غير مكتملة";
  }
  return "منتهية";
};

const TOKEN_EVENT = "ed-auth-token-changed";

export default function AnalyticsDashboard() {
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<PMSProvider | "">("");
  const [exportState, setExportState] = useState<
    "idle" | "pending" | "done" | "failed"
  >("idle");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState<string>(getAuthToken() ?? "");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopeInput, setScopeInput] = useState(
    "analytics:read,pms:read,pms:write"
  );
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authState, setAuthState] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [authVersion, setAuthVersion] = useState(0);

  const fetchReport = async () => {
    const token = getAuthToken();
    if (!token) {
      setError("يتطلب الوصول إلى التحليلات تسجيل الدخول الآمن (JWT).");
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
      const payload: PerformanceReport = await response.json();
      setReport(payload);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "تعذر تحديث لوحة التحليلات في الوقت الحالي"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    const interval = window.setInterval(fetchReport, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [authVersion]);

  useEffect(() => {
    const handler = () => setAuthVersion((prev) => prev + 1);
    window.addEventListener(TOKEN_EVENT, handler);
    return () => window.removeEventListener(TOKEN_EVENT, handler);
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setProvidersError("يُرجى المصادقة قبل استعراض موفّري التكامل.");
      return;
    }
    listConfiguredProviders()
      .then((data) => {
        setProviders(data);
        const firstConfigured = data.find((provider) => provider.configured);
        if (firstConfigured) {
          setSelectedProvider((prev) => (prev ? prev : firstConfigured.id));
        }
      })
      .catch((err) => {
        setProvidersError(
          err instanceof Error
            ? err.message
            : "تعذر تحميل قائمة أنظمة الـ PMS/CRM المتاحة"
        );
      });
  }, [authVersion]);

  const handleExport = async () => {
    if (!report || !selectedProvider) {
      return;
    }
    setExportState("pending");
    setExportMessage(null);
    try {
      const response = await pushPerformanceReport(selectedProvider, {
        report,
      });
      if (response.status !== "success") {
        throw new Error(response.message || "فشل تصدير البيانات");
      }
      setExportState("done");
      setExportMessage("تم إرسال التقرير بنجاح.");
    } catch (err) {
      setExportState("failed");
      setExportMessage(
        err instanceof Error
          ? err.message
          : "تعذر إرسال التقرير. يرجى المحاولة لاحقاً."
      );
    }
  };

  const handleTokenSave = () => {
    if (!tokenInput.trim()) {
      setAuthMessage("أدخل رمز JWT صالحاً.");
      setAuthState("error");
      return;
    }
    setAuthToken(tokenInput.trim());
    setAuthState("success");
    setAuthMessage("تم حفظ الرمز. سيتم تحديث البيانات الآن.");
    setAuthVersion((prev) => prev + 1);
  };

  const handleTokenRequest = async () => {
    setAuthState("pending");
    setAuthMessage(null);
    try {
      await requestAuthToken({
        clientId,
        clientSecret,
        scope: scopeInput
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      const token = getAuthToken();
      setTokenInput(token ?? "");
      setAuthState("success");
      setAuthMessage("تم إصدار وتخزين الرمز بنجاح.");
      setAuthVersion((prev) => prev + 1);
    } catch (error) {
      setAuthState("error");
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "تعذر إصدار الرمز، تحقّق من البيانات."
      );
    }
  };

  const sentimentChartSpec = useMemo<VisualizationSpec | null>(() => {
    if (!report) {
      return null;
    }
    const values = report.sentimentDistribution.map((item) => ({
      label: sentimentTranslations[item.label],
      count: item.count,
    }));
    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      data: { values },
      mark: {
        type: "bar",
        cornerRadiusTopLeft: 4,
        cornerRadiusTopRight: 4,
      } as any,
      encoding: {
        x: {
          field: "label",
          type: "nominal",
          title: "الحالة الشعورية",
        },
        y: {
          field: "count",
          type: "quantitative",
          title: "عدد العبارات",
        },
        color: {
          field: "label",
          type: "nominal",
          scale: {
            domain: ["رضا", "قلق", "غضب"],
            range: ["#0d9c53", "#f4b740", "#ff4600"],
          },
          legend: null,
        },
      },
      config: {
        background: "transparent",
        axis: {
          labelColor: "#e1e2e3",
          titleColor: "#c3c6c7",
        },
        view: { stroke: "transparent" },
      },
    };
    return spec;
  }, [report]);

  useEffect(() => {
    if (chartRef.current && sentimentChartSpec) {
      vegaEmbed(chartRef.current, sentimentChartSpec, {
        actions: false,
        renderer: "svg",
      }).catch((err) => {
        console.warn("[analytics] Failed to render chart", err);
      });
    }
  }, [sentimentChartSpec]);

  if (isLoading) {
    return (
      <section className="analytics-dashboard loading">
        <span>جارٍ تحميل التحليلات...</span>
      </section>
    );
  }

  if (error) {
    return (
      <section className="analytics-dashboard error">
        <span>⚠️ {error}</span>
      </section>
    );
  }

  if (!report) {
    return null;
    }

  const totals = report.totals;

  return (
    <section className="analytics-dashboard">
      <header className="analytics-dashboard__header">
        <div>
          <h2>لوحة تحليلات eDentist.AI</h2>
          <span className="analytics-dashboard__subtitle">
            آخر تحديث:{" "}
            {new Date(report.generatedAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
      </header>

      <section className="panel security-panel">
        <h3>الوصول الآمن</h3>
        <div className="token-actions">
          <div className="token-manual">
            <label htmlFor="tokenInput">رمز JWT</label>
            <textarea
              id="tokenInput"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="انسخ رمز المصادقة هنا..."
            />
            <button type="button" onClick={handleTokenSave}>
              حفظ الرمز
            </button>
          </div>
          <div className="token-request">
            <label htmlFor="clientId">Client ID</label>
            <input
              id="clientId"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="مثال: ed-admin"
              autoComplete="off"
            />
            <label htmlFor="clientSecret">Client Secret</label>
            <input
              id="clientSecret"
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder="••••••••"
              autoComplete="off"
            />
            <label htmlFor="scopes">Scopes</label>
            <input
              id="scopes"
              value={scopeInput}
              onChange={(event) => setScopeInput(event.target.value)}
              placeholder="analytics:read,pms:read,pms:write"
            />
            <button
              type="button"
              onClick={handleTokenRequest}
              disabled={authState === "pending"}
            >
              {authState === "pending" ? "جارٍ الإصدار..." : "إصدار رمز جديد"}
            </button>
          </div>
        </div>
        {authMessage && (
          <span
            className={`auth-message ${authState === "error" ? "error" : "success"}`}
          >
            {authMessage}
          </span>
        )}
      </section>

      <div className="analytics-dashboard__summary-grid">
        <article className="summary-card">
          <h3>إجمالي المكالمات</h3>
          <p className="summary-card__primary">
            {totals.totalCalls}
            <small> ({totals.activeCalls} نشطة)</small>
          </p>
          <span className="summary-card__meta">
            {totals.completedCalls} مكالمة منتهية
          </span>
        </article>
        <article className="summary-card">
          <h3>نسبة النجاح</h3>
          <p className="summary-card__primary">{totals.successRate}%</p>
          <span className="summary-card__meta">
            {totals.successfulCalls} مكالمات ناجحة · {totals.failedCalls} لم تكتمل
          </span>
        </article>
        <article className="summary-card">
          <h3>متوسط الاستجابة</h3>
          <p className="summary-card__primary">
            {formatMs(totals.averageResponseMs)}
          </p>
          <span className="summary-card__meta">
            زمن من المستخدم إلى الرد
          </span>
        </article>
        <article className="summary-card warning">
          <h3>نسبة الهلوسة المحتملة</h3>
          <p className="summary-card__primary">
            {totals.hallucinationRate}%
          </p>
          <span className="summary-card__meta">
            محسوبة على {totals.totalCalls} محادثة
          </span>
        </article>
      </div>

      <div className="analytics-dashboard__content">
        <section className="panel sentiment-panel">
          <h3>تحليل المشاعر الفوري</h3>
          <div className="chart" ref={chartRef} />
          <div className="legend">
            {report.sentimentDistribution.map((item) => (
              <span key={item.label}>
                <strong>{sentimentTranslations[item.label]}:</strong>{" "}
                {item.count} ({item.percentage}%)
              </span>
            ))}
          </div>
        </section>

        <section className="panel sessions-panel">
          <h3>المكالمات الأخيرة</h3>
          <div className="sessions-list">
            {report.recentSessions.length === 0 && (
              <p className="empty-state">لا توجد مكالمات مسجلة بعد.</p>
            )}
            {report.recentSessions.map((session) => (
              <article className="session-card" key={session.sessionId}>
                <header>
                  <h4>جلسة {session.sessionId.slice(0, 8)}...</h4>
                  <span className={`status status--${session.status}`}>
                    {statusLabel(session)}
                  </span>
                </header>
                <ul>
                  <li>
                    <strong>الاستجابة:</strong>{" "}
                    {formatMs(session.averageResponseMs)}
                  </li>
                  <li>
                    <strong>المشاعر الغالبة:</strong>{" "}
                    {sentimentTranslations[session.dominantSentiment]}
                  </li>
                  <li>
                    <strong>الهلوسات:</strong> {session.hallucinations}
                  </li>
                </ul>
                <footer>
                  <span>
                    آخر تحديث{" "}
                    {new Date(session.lastUpdate).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {session.successReason && (
                    <span className="session-card__reason">
                      {session.successReason}
                    </span>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className="panel timeline-panel">
          <h3>آخر جلسة</h3>
          {!report.latestTimeline && (
            <p className="empty-state">لم تبدأ أي جلسة حتى الآن.</p>
          )}
          {report.latestTimeline && (
            <ol className="timeline">
              {report.latestTimeline.timeline.map((turn) => (
                <li key={turn.turnId} className={`timeline__item ${turn.role}`}>
                  <span className="timeline__timestamp">
                    {new Date(turn.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span className="timeline__role">
                    {turn.role === "user" ? "المستخدم" : "المساعد"}
                  </span>
                  <p className="timeline__text">{turn.text}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel export-panel">
          <h3>إرسال التقارير إلى نظام خارجي</h3>
          {providersError && (
            <p className="empty-state">{providersError}</p>
          )}
          {!providersError && (
            <>
              <div className="export-controls">
                <select
                  value={selectedProvider}
                  onChange={(event) =>
                    setSelectedProvider(event.target.value as PMSProvider | "")
                  }
                >
                  <option value="">اختر موفر التكامل</option>
                  {providers.map((provider) => (
                    <option
                      key={provider.id}
                      value={provider.id}
                      disabled={!provider.configured}
                    >
                      {provider.label}
                      {!provider.configured ? " (غير مهيأ)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={
                    exportState === "pending" || !selectedProvider || !report
                  }
                  onClick={handleExport}
                >
                  {exportState === "pending" ? "جاري الإرسال..." : "أرسل الآن"}
                </button>
              </div>
              {exportMessage && (
                <span
                  className={`export-message ${
                    exportState === "failed" ? "error" : "success"
                  }`}
                >
                  {exportMessage}
                </span>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}


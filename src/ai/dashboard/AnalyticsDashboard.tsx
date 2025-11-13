import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import vegaEmbed, { type VisualizationSpec } from "vega-embed";
import "./analytics-dashboard.scss";
import {
  listConfiguredProviders,
  pushPerformanceReport,
  type PMSProvider,
  type ProviderSummary,
} from "../integrations";

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

type ServiceEndpointMetric = {
  name: string;
  count: number;
  successCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
  successRate: number;
  availability: number;
  averageLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
};

type ServiceMetricsSnapshot = {
  windowMs: number;
  since: number;
  totalRequests: number;
  totalSuccess: number;
  totalClientError: number;
  totalServerError: number;
  windowRequestCount: number;
  successCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
  successRate: number;
  availability: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  lastFailureAt: number | null;
  perEndpoint: ServiceEndpointMetric[];
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
  serviceMetrics?: ServiceMetricsSnapshot;
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

const formatWindow = (value: number) => {
  if (value < 60_000) {
    return `${Math.round(value / 1000)}s`;
  }
  const minutes = Math.round(value / 60_000);
  return `${minutes} min`;
};

const formatRelativeTime = (value: number | null) => {
  if (!value) {
    return "No failures recorded";
  }
  const diff = Date.now() - value;
  if (diff < 60_000) {
    return "Just now";
  }
  if (diff < 3_600_000) {
    const minutes = Math.floor(diff / 60_000);
    return `${minutes} min ago`;
  }
  const hours = Math.floor(diff / 3_600_000);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
};

const sentimentTranslations: Record<SentimentLabel, string> = {
  satisfied: "Satisfied",
  concerned: "Concerned",
  angry: "Angry",
};

const statusLabel = (session: SessionSummary) => {
  if (session.status === "active") {
    return "In progress";
  }
  if (session.success === true) {
    return "Successful";
  }
  if (session.success === false) {
    return "Incomplete";
  }
  return "Completed";
};

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
  const fetchReport = useCallback(async () => {
    try {
      const response = await fetch("/api/analytics/report", {
        method: "GET",
        headers: {
          Accept: "application/json",
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
          : "Unable to refresh the analytics dashboard right now."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
    const interval = window.setInterval(fetchReport, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [fetchReport]);

  useEffect(() => {
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
            : "Unable to load the available PMS/CRM systems."
        );
      });
  }, []);

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
        throw new Error(response.message || "Failed to export data");
      }
      setExportState("done");
      setExportMessage("Report sent successfully.");
    } catch (err) {
      setExportState("failed");
      setExportMessage(
        err instanceof Error
          ? err.message
          : "Unable to send the report. Please try again later."
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
          title: "Sentiment state",
        },
        y: {
          field: "count",
          type: "quantitative",
          title: "Utterance count",
        },
        color: {
          field: "label",
          type: "nominal",
          scale: {
            domain: ["Satisfied", "Concerned", "Angry"],
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
        <span>Loading analytics...</span>
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
  const serviceMetrics = report.serviceMetrics;

  return (
    <section className="analytics-dashboard">
      <header className="analytics-dashboard__header">
        <div>
          <h2>eDentist.AI Analytics Dashboard</h2>
          <span className="analytics-dashboard__subtitle">
            Last updated:{" "}
            {new Date(report.generatedAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
      </header>

      <section className="panel security-panel">
        <h3>Service access</h3>
        <p>
          Analytics and PMS integration endpoints are now exposed without JWT
          authentication. Restrict access via your network controls or API
          gateway as needed.
        </p>
      </section>

      <div className="analytics-dashboard__summary-grid">
        <article className="summary-card">
          <h3>Total calls</h3>
          <p className="summary-card__primary">
            {totals.totalCalls}
            <small> ({totals.activeCalls} active)</small>
          </p>
          <span className="summary-card__meta">
            {totals.completedCalls} completed calls
          </span>
        </article>
        <article className="summary-card">
          <h3>Success rate</h3>
          <p className="summary-card__primary">{totals.successRate}%</p>
          <span className="summary-card__meta">
            {totals.successfulCalls} successful · {totals.failedCalls} incomplete
          </span>
        </article>
        <article className="summary-card">
          <h3>Average response</h3>
          <p className="summary-card__primary">
            {formatMs(totals.averageResponseMs)}
          </p>
          <span className="summary-card__meta">
            User-to-response latency
          </span>
        </article>
        <article className="summary-card warning">
          <h3>Potential hallucination rate</h3>
          <p className="summary-card__primary">
            {totals.hallucinationRate}%
          </p>
          <span className="summary-card__meta">
            Calculated over {totals.totalCalls} conversations
          </span>
        </article>
      </div>

      <div className="analytics-dashboard__content">
        {serviceMetrics ? (
          <section className="panel service-metrics">
            <h3>Service health (last {formatWindow(serviceMetrics.windowMs)})</h3>
            <div className="service-metrics__summary">
              <div>
                <strong>Requests:</strong>{" "}
                {serviceMetrics.windowRequestCount} (total {serviceMetrics.totalRequests})
              </div>
              <div>
                <strong>Success rate:</strong>{" "}
                {serviceMetrics.successRate}%
              </div>
              <div>
                <strong>Availability:</strong>{" "}
                {serviceMetrics.availability}%
              </div>
              <div>
                <strong>Avg latency:</strong>{" "}
                {formatMs(serviceMetrics.averageLatencyMs)}
              </div>
              <div>
                <strong>P95 latency:</strong>{" "}
                {formatMs(serviceMetrics.p95LatencyMs)}
              </div>
              <div>
                <strong>Last server error:</strong>{" "}
                {formatRelativeTime(serviceMetrics.lastFailureAt)}
              </div>
            </div>
            <div className="service-metrics__table-wrapper">
              <table className="service-metrics__table">
                <thead>
                  <tr>
                    <th>Endpoint</th>
                    <th>Requests</th>
                    <th>Success %</th>
                    <th>Availability %</th>
                    <th>Avg latency</th>
                    <th>Max latency</th>
                    <th>Min latency</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceMetrics.perEndpoint.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-state">
                        No service telemetry collected yet.
                      </td>
                    </tr>
                  ) : (
                    serviceMetrics.perEndpoint.slice(0, 8).map((endpoint) => (
                      <tr key={endpoint.name}>
                        <td>{endpoint.name}</td>
                        <td>{endpoint.count}</td>
                        <td>{endpoint.successRate}</td>
                        <td>{endpoint.availability}</td>
                        <td>{formatMs(endpoint.averageLatencyMs)}</td>
                        <td>{formatMs(endpoint.maxLatencyMs)}</td>
                        <td>{formatMs(endpoint.minLatencyMs)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        <section className="panel sentiment-panel">
          <h3>Real-time sentiment analysis</h3>
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
          <h3>Recent calls</h3>
          <div className="sessions-list">
            {report.recentSessions.length === 0 && (
              <p className="empty-state">No calls recorded yet.</p>
            )}
            {report.recentSessions.map((session) => (
              <article className="session-card" key={session.sessionId}>
                <header>
                  <h4>Session {session.sessionId.slice(0, 8)}...</h4>
                  <span className={`status status--${session.status}`}>
                    {statusLabel(session)}
                  </span>
                </header>
                <ul>
                  <li>
                    <strong>Response time:</strong>{" "}
                    {formatMs(session.averageResponseMs)}
                  </li>
                  <li>
                    <strong>Dominant sentiment:</strong>{" "}
                    {sentimentTranslations[session.dominantSentiment]}
                  </li>
                  <li>
                    <strong>Hallucinations:</strong> {session.hallucinations}
                  </li>
                </ul>
                <footer>
                  <span>
                    Last updated{" "}
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
          <h3>Latest session</h3>
          {!report.latestTimeline && (
            <p className="empty-state">No session has started yet.</p>
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
                    {turn.role === "user" ? "User" : "Assistant"}
                  </span>
                  <p className="timeline__text">{turn.text}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel export-panel">
          <h3>Send reports to an external system</h3>
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
                  <option value="">Select an integration provider</option>
                  {providers.map((provider) => (
                    <option
                      key={provider.id}
                      value={provider.id}
                      disabled={!provider.configured}
                    >
                      {provider.label}
                      {!provider.configured ? " (not configured)" : ""}
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
                  {exportState === "pending" ? "Sending..." : "Send now"}
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


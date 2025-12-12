type MetricSample = {
  name: string;
  timestamp: number;
  durationMs: number;
  statusCode: number;
};

const MAX_SAMPLES = 2000;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

type EndpointMetric = {
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

export type ServiceMetricsSnapshot = {
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
  perEndpoint: EndpointMetric[];
};

const clampIndex = (value: number, length: number) => {
  if (length === 0) {
    return 0;
  }
  return Math.max(0, Math.min(length - 1, value));
};

class SystemMetrics {
  private samples: MetricSample[] = [];
  private totals = {
    count: 0,
    success: 0,
    clientError: 0,
    serverError: 0,
    durationMs: 0,
  };
  private uptimeStartedAt = Date.now();
  private lastFailureAt: number | null = null;

  record(name: string, durationMs: number, statusCode?: number) {
    const resolvedStatus = typeof statusCode === "number" ? statusCode : 200;
    const sample: MetricSample = {
      name,
      durationMs: Math.max(0, durationMs),
      statusCode: resolvedStatus,
      timestamp: Date.now(),
    };

    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }

    this.totals.count += 1;
    this.totals.durationMs += sample.durationMs;
    if (sample.statusCode < 400) {
      this.totals.success += 1;
    } else if (sample.statusCode >= 500) {
      this.totals.serverError += 1;
      this.lastFailureAt = sample.timestamp;
    } else {
      this.totals.clientError += 1;
    }
  }

  getSnapshot(windowMs: number = DEFAULT_WINDOW_MS): ServiceMetricsSnapshot {
    const cutoff = Date.now() - windowMs;
    const windowSamples = this.samples.filter(
      (sample) => sample.timestamp >= cutoff
    );

    const windowCount = windowSamples.length;
    const successCount = windowSamples.filter(
      (sample) => sample.statusCode < 400
    ).length;
    const serverErrorCount = windowSamples.filter(
      (sample) => sample.statusCode >= 500
    ).length;
    const clientErrorCount = windowSamples.filter(
      (sample) => sample.statusCode >= 400 && sample.statusCode < 500
    ).length;

    let totalDuration = 0;
    let maxLatency = 0;
    let minLatency = Number.POSITIVE_INFINITY;
    const durations: number[] = [];

    const perEndpointMap = new Map<string, EndpointMetric & { durationSum: number }>();

    for (const sample of windowSamples) {
      totalDuration += sample.durationMs;
      maxLatency = Math.max(maxLatency, sample.durationMs);
      minLatency = Math.min(minLatency, sample.durationMs);
      durations.push(sample.durationMs);

      const endpoint =
        perEndpointMap.get(sample.name) ??
        perEndpointMap
          .set(sample.name, {
            name: sample.name,
            count: 0,
            successCount: 0,
            clientErrorCount: 0,
            serverErrorCount: 0,
            successRate: 0,
            availability: 0,
            averageLatencyMs: 0,
            maxLatencyMs: 0,
            minLatencyMs: Number.POSITIVE_INFINITY,
            durationSum: 0,
          })
          .get(sample.name)!;

      endpoint.count += 1;
      endpoint.durationSum += sample.durationMs;
      endpoint.maxLatencyMs = Math.max(endpoint.maxLatencyMs, sample.durationMs);
      endpoint.minLatencyMs = Math.min(endpoint.minLatencyMs, sample.durationMs);

      if (sample.statusCode < 400) {
        endpoint.successCount += 1;
      } else if (sample.statusCode >= 500) {
        endpoint.serverErrorCount += 1;
      } else {
        endpoint.clientErrorCount += 1;
      }
    }

    durations.sort((a, b) => a - b);
    const p95Index = clampIndex(Math.floor(durations.length * 0.95) - 1, durations.length);
    const p95LatencyMs = durations.length ? Math.round(durations[p95Index]) : 0;

    const averageLatencyMs =
      windowCount === 0 ? 0 : Math.round(totalDuration / windowCount);

    const successRate =
      windowCount === 0
        ? 0
        : Number(((successCount / windowCount) * 100).toFixed(1));

    const availability =
      windowCount === 0
        ? 100
        : Number(
            (
              ((windowCount - serverErrorCount) / windowCount) *
              100
            ).toFixed(1)
          );

    const perEndpoint = Array.from(perEndpointMap.values()).map(
      ({ durationSum, minLatencyMs, ...rest }) => ({
        ...rest,
        minLatencyMs:
          rest.count === 0 || !Number.isFinite(minLatencyMs)
            ? 0
            : Math.round(minLatencyMs),
        averageLatencyMs:
          rest.count === 0 ? 0 : Math.round(durationSum / rest.count),
        successRate:
          rest.count === 0
            ? 0
            : Number(((rest.successCount / rest.count) * 100).toFixed(1)),
        availability:
          rest.count === 0
            ? 100
            : Number(
                (
                  ((rest.count - rest.serverErrorCount) / rest.count) *
                  100
                ).toFixed(1)
              ),
      })
    );

    perEndpoint.sort((a, b) => b.count - a.count);

    return {
      windowMs,
      since: this.uptimeStartedAt,
      totalRequests: this.totals.count,
      totalSuccess: this.totals.success,
      totalClientError: this.totals.clientError,
      totalServerError: this.totals.serverError,
      windowRequestCount: windowCount,
      successCount,
      clientErrorCount,
      serverErrorCount,
      successRate,
      availability,
      averageLatencyMs,
      p95LatencyMs,
      maxLatencyMs: Math.round(maxLatency),
      minLatencyMs:
        windowCount === 0 || !Number.isFinite(minLatency)
          ? 0
          : Math.round(minLatency),
      lastFailureAt: this.lastFailureAt,
      perEndpoint,
    };
  }
}

export const systemMetrics = new SystemMetrics();


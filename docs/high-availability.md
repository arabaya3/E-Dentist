# High Availability Architecture – eDentist.AI Voice Agent

## Objectives

- **99.5%+ availability** for voice interactions and API endpoints.
- Automatic failover for regional, zone, or component level failures.
- Predictable recovery time: **RTO ≤ 5 minutes**, **RPO ≤ 1 minute**.
- Observability across voice traffic, analytics, PMS integrations, and supporting services.

## Logical Architecture

```
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                         Public Connectivity Layer                          │
 │                                                                            │
 │   ┌───────────────┐    ┌──────────────────┐    ┌───────────────────┐       │
 │   │  Web Clients  │    │  SIP/Telephony   │    │  Mobile Frontends │       │
 │   └──────┬────────┘    └────────┬─────────┘    └─────────┬────────┘       │
 │          │ HTTPS/WSS               │ SIP/TLS                  │ HTTPS/WSS │
 │ ┌────────▼────────────────────────▼──────────────────────────▼──────────┐ │
 │ │             Global Load Balancer + Anycast DNS (GCLB / CloudFront)    │ │
 │ └────────▲──────────────────────────────────────────────────────────────┘ │
 │          │                                                                │
 └──────────┼────────────────────────────────────────────────────────────────┘
            │
            │
 ┌──────────▼────────────────────────┐          ┌──────────▼────────────────────────┐
 │        Active Region (Primary)     │          │        Active Region (Secondary)  │
 │              (e.g., europe-west)   │          │              (e.g., me-central)   │
 │                                    │          │                                    │
 │  ┌─────────────────────────────┐   │          │  ┌─────────────────────────────┐   │
 │  │  Ingress (Envoy / Istio GW) │<──┼──────────┼─►│  Ingress (Envoy / Istio GW) │   │
 │  └───────────┬─────────────────┘   │          │  └───────────┬─────────────────┘   │
 │              │                      │          │              │                      │
 │  ┌───────────▼─────────────┐        │          │  ┌───────────▼─────────────┐        │
 │  │ Voice Agent Pods (GKE)  │◄────┐  │     ┌────┼─►│ Voice Agent Pods (GKE)  │        │
 │  └───────────┬─────────────┘     │  │     │    │  └───────────┬─────────────┘        │
 │              │     Autoscaling   │  │     │    │              │     Autoscaling      │
 │              │                   │  │     │    │              │                      │
 │  ┌───────────▼─────────────┐     │  │     │    │  ┌───────────▼─────────────┐        │
 │  │  Realtime Subsystem     │─────┼──┘     │    └──│  Realtime Subsystem     │        │
 │  │ (Gemini Live Gateway)   │     │        │       │ (Gemini Live Gateway)   │        │
 │  └───────────┬─────────────┘     │        │       └───────────┬─────────────┘        │
 │              │                   │        │                   │                      │
 │  ┌───────────▼─────────────┐     │        │       ┌───────────▼─────────────┐        │
 │  │ Analytics & API Pods    │─────┼────────┴──────►│ Analytics & API Pods    │        │
 │  └───────────┬─────────────┘     │                └───────────┬─────────────┘        │
 │              │                   │                            │                      │
 │  ┌───────────▼─────────────┐     │                ┌───────────▼─────────────┐        │
 │  │  Redis / PubSub (HA)    │◄────┴─────Sync──────►│  Redis / PubSub (HA)    │        │
 │  └───────────┬─────────────┘                      └───────────┬─────────────┘        │
 │              │                                               │                      │
 │  ┌───────────▼─────────────┐                      ┌───────────▼─────────────┐        │
 │  │PMS Bridges (Cloud Run)  │◄──────Dr−to−Dr──────►│PMS Bridges (Cloud Run)  │        │
 │  └───────────┬─────────────┘                      └───────────┬─────────────┘        │
 │              │                                               │                      │
 │  ┌───────────▼─────────────┐                      ┌───────────▼─────────────┐        │
 │  │ CloudSQL / AlloyDB (HA) │◄────→→→→→→→→→→──────►│ CloudSQL (Read Replica) │        │
 │  └───────────┬─────────────┘                      └───────────┬─────────────┘        │
 │              │                                               │                      │
 │  ┌───────────▼─────────────┐                      ┌───────────▼─────────────┐        │
 │  │ Object Storage (GCS)    │◄────Replicated──────►│ Object Storage (GCS)    │        │
 │  └─────────────────────────┘                      └─────────────────────────┘        │
 └─────────────────────────────────────────────────────────────────────────────────────┘
```

### Components

- **Active-active regions** with identical Kubernetes clusters (GKE) hosting:
  - Voice agent pods (App + WebSocket + conversation manager).
  - Analytics/API pods (REST endpoints, dashboards, auth).
- **Managed data stores** with cross-region redundancy:
  - CloudSQL/AlloyDB primary + read replica; failover configured through automatic promotion.
  - Redis/MemoryStore (or Pub/Sub) for transient session state, configured for regional high availability.
  - GCS buckets with dual-region (primary + failover region).
- **PMS connectors** packaged as serverless services (Cloud Run) with multi-region deployments and global routing.
- **Telemetry** collected via Cloud Monitoring / Prometheus:
  - Service metrics exported from `systemMetrics.ts` through scraping endpoint (planned).
  - Logs structured for BigQuery / Log Analytics.
- **CI/CD** pushes container images to Artifact Registry; Cloud Deploy (or Argo CD) orchestrates blue/green or canary rollout per region.

## Resiliency Measures

| Failure Scenario                      | Mitigation                                                                                                                       |
|--------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| Zone outage                          | GKE node pools span ≥2 zones per region. PodDisruptionBudgets ensure at least 50% capacity remains.                               |
| Regional outage                      | Global load balancer shifts traffic to healthy region (health checks validated every 10s).                                       |
| Database primary failure             | CloudSQL automatic failover → promote read replica. Application retries using connection pool with backoff.                      |
| Redis/Cache failure                  | Multi-zone MemoryStore with automatic failover; fallback to stateless generation for ephemeral data.                             |
| PMS connector failure                | Retries with exponential backoff; degrade gracefully with queued jobs (Pub/Sub) and alert via PagerDuty.                         |
| Gemini API degradation               | Circuit breaker wraps streaming client; fallback to “please hold” message; optionally drain traffic to telephony backup queue.   |
| Deployment failure                   | Blue/green per region; traffic switched only after smoke tests succeed.                                                          |
| Telephony disconnect                 | PSTN vendor configured with SIP trunk failover; webhook routing to secondary ingress automatically.                              |

## Capacity Planning & Autoscaling

- **Pod autoscaling**: HPA targets CPU ≤60% and custom metrics (active sessions). Min replicas per region = 3 for Voice Agents, 2 for Analytics.
- **Scale-to-zero** avoided on primary services to prevent cold starts; Cloud Run connectors maintain min instances = 1 per region.
- **Load tests** executed before peak events to validate 2x expected peak traffic with <500 ms P95 latency.

## Monitoring & Alerting

- **Metrics**: latency, success rate, availability, and endpoint counts exported via `/metrics` (planned Prometheus scrape) + Cloud Monitoring dashboards.
- **Alerts**:
  - Voice API availability < 98% (5-min window) → High severity.
  - Latency P95 > 2s for 3 consecutive minutes → Medium.
  - Database failover or storage replication lag > 60s → High.
  - Error spikes > 5% for PMS connectors → Medium.
- **Incident management**: PagerDuty escalation (Engineer On-Call → SRE Lead → VP Eng). Slack channel `#edentist-incident` for real-time updates.

## Disaster Recovery

- **Backups**: CloudSQL automated backups (hourly) + point-in-time recovery. GCS objects versioned. Configuration & secrets mirrored in Secret Manager across regions.
- **RPO**: ≤ 1 minute through synchronous replication (CloudSQL HA + Redis persistence); logs streamed to centralized storage.
- **RTO**: ≤ 5 minutes via Terraform/Deployment Manager scripts to rebuild region. Pre-warmed images ensure quick start.
- **Periodic DR drills**: quarterly failover simulation; verify load balancer routing & data consistency.

## Operational Playbooks (Summary)

- **Traffic spike**: verify autoscaling events (HPA), scale node pools if needed, monitor system metrics dashboard.
- **Regional failover**: confirm health check failure, traffic shift to secondary, run smoke tests, notify stakeholders, open incident ticket.
- **Database failover**: monitor CloudSQL event logs, ensure app connectivity, confirm replication catch-up, update dashboards.
- **PMS outage**: queue requests, notify practice managers, switch to manual booking mode, document backlog for replay when service returns.

Refer to the detailed incident runbook in `docs/runbooks/voice-agent-failover.md` for troubleshooting steps.


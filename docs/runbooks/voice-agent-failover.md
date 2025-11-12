# Runbook – Voice Agent Availability & Failover

## Purpose

Provide a clear, repeatable procedure to diagnose and remediate incidents that impact the availability or performance of the eDentist.AI voice agent.

## Scope

- Web voice console (HTTPS/WSS) and telephony ingress.
- Realtime Gemini Live streaming, API/TLS endpoints, PMS integrations.
- Applies to production regions (primary + secondary) and staging when serving beta customers.

## Preconditions

- PagerDuty, Slack (`#edentist-incident`), and Jira access.
- kubectl/kubectx configured for both regions (`prod-eu`, `prod-me`).
- gcloud CLI authenticated with incident-response permissions.
- Access to Cloud Monitoring dashboards and logs.

## Incident Classification

| Severity | Description | Target Response |
|----------|-------------|------------------|
| SEV-1 | All customers unable to initiate/continue voice sessions or >50% request failure | Immediate response (<5 min) |
| SEV-2 | Partial degradation (latency > 2s P95, PMS sync failures >20%, single region down) | Response <15 min |
| SEV-3 | Non-customer-facing issues (analytics API errors, elevated warning logs) | Response <1 hr |

## Detection

Triggers include any of:
- PagerDuty alert: “VoiceAgent Availability < 98%” or “Latency P95 > 2s”.
- Cloud Monitoring dashboard shows region health check failures.
- Support tickets or Slack reports from customers.
- Use of `/api/analytics/report` reveals availability metrics < 99%.

## High-Level Flow

1. **Acknowledge** alert in PagerDuty → announce in Slack.
2. **Identify scope** (single region? global? specific endpoint?).
3. **Stabilize service** (shift traffic, enable rate limiting, bypass failing dependency).
4. **Remediate** root cause (scale nodes, restart pods, promote replica, etc.).
5. **Communicate** updates every 15 min.
6. **Post-incident**: document timeline, follow-up actions, attach metrics snapshots.

## Diagnostic Checklist

1. **Check service metrics**  
   - Open `Analytics → Service health` dashboard or run `curl -H "Authorization: Bearer $TOKEN" https://<lb>/api/analytics/report`.  
   - Note `availability`, `successRate`, P95 latency, and endpoint breakdown.
2. **Verify load balancer health**  
   - `gcloud compute backend-services get-health voice-lb --global`  
   - Confirm which region(s) are unhealthy.
3. **Inspect pods**  
   - `kubectx prod-eu && kubectl get pods -n voice-agent`  
   - Look for CrashLoopBackOff or Pending pods.
   - `kubectl logs` for failing pods.
4. **Gemini Live status**  
   - Check vendor status page; local logs should contain `Gemini` error codes.
   - If vendor outage, enable “manual mode” (play holding prompt).
5. **Data stores**  
   - CloudSQL: `gcloud sql instances describe voice-db` – check `FAILOVER` state or replication lag.  
   - Redis/MemoryStore: `gcloud redis instances describe voice-cache`.
6. **PMS integrations**  
   - Check `/api/integrations/pms/providers` error logs.  
   - If PMS specific, isolate connector by disabling failing provider via feature flag.

## Remediation Actions

### Region Failure
1. Confirm primary region unhealthy.  
2. Increase traffic weight to healthy region via load balancer:
   - `gcloud compute backend-services update voice-lb --global --balancing-mode RATE --max-rate-per-endpoint=<value>`.
   - Alternatively, set forced failover flag in Terraform/Deployment pipeline.
3. Validate: run smoke tests (`npm run smoke:voice`, `scripts/voice-engine-smoke.ts`).  
4. Notify customers if failover > 5 minutes or capacity reduced.

### Pod/Cluster Issues
- Restart deployments:  
  `kubectl rollout restart deployment voice-agent -n voice-agent`  
  `kubectl rollout status deployment voice-agent -n voice-agent`
- Scale node pool:  
  `gcloud container clusters resize voice-cluster --node-pool default --num-nodes=<N> --region=<region>`
- If config regression: roll back to last stable release (`kubectl rollout undo` or Argo/Cloud Deploy revert).

### Database Failover
- Promote replica: `gcloud sql instances failover voice-db`.  
- Update connection string (if manual).  
- Validate application connectivity and run health script.  
- Monitor replication catch-up post-failback.

### Redis/Cache Outage
- Trigger failover: `gcloud redis instances failover voice-cache`.  
- If unavailable, fallback to stateless mode by setting env `CACHE_DISABLED=true` (documented in ConfigMap).
- Purge stale sessions after cache restoration.

### Gemini Provider Outage
- Deploy IVR fallback: function `scripts/voice-engine-smoke.ts --hold-mode`.  
- Notify operations; monitor vendor status & reopen once stable.

### PMS Outage
- Switch to queue-only mode: set feature flag `PMS_SYNC_MODE=queued`.  
- Capture pending jobs in Pub/Sub topic for replay.  
- Communicate manual booking instructions to practice managers.

## Communication Template

```
Status: [Investigating | Mitigating | Monitoring | Resolved]
Start: <UTC timestamp>
Scope: [Regions affected, % users impacted]
Findings: <Summary of root cause / suspected>
Actions: <What has been done>
Next Update: <ETA>
Contact: <On-call Engineer> / Slack @mentions
```

## Post-Incident

1. Fill out incident report template in Confluence / Notion (link).  
2. Add key metrics snapshots (from analytics report) and timeline.  
3. Create Jira tickets for follow-up tasks (preventive work, automation).  
4. Update runbook if gaps identified.

## Testing & Drills

- Quarterly failover rehearsal (regional shutdown + DB failover).  
- Monthly automation test: simulate pod crash, ensure HPA backfills capacity.  
- Document results in runbook appendix with date & outcome.

## Appendices

- **Credentials**: stored in Secret Manager (`projects/<proj>/secrets/incident-access`).  
- **Automation Scripts**: `scripts/incident/shift-traffic.sh`, `scripts/incident/failover-db.sh`.  
- **Monitoring Dashboards**: Cloud Monitoring links → `HA Voice Overview`, `PMS Integrations`, `Database Health`.

Keep this document in sync with architecture updates (`docs/high-availability.md`). Whenever topology changes, update both diagrams and remediation steps.


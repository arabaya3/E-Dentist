# Compliance Evidence – HIPAA & SOC 2

| Control Domain | Requirement | Implementation | Evidence / Location |
|----------------|-------------|----------------|----------------------|
| **Access Controls** | Unique identities, scoped permissions | JWT service (`/api/auth/token`) issuances restricted via client credentials + scopes. | Code: `src/setupProxy.js`, `server/auth.ts`; Audit log entries per token issuance (`server/audit-logger.ts`). |
| **Encryption in Transit** | TLS 1.2+ for all PHI data flows | CRA dev server enforces HTTPS; production behind GCLB / reverse proxy with TLS. | Docs: `docs/security.md` (تشفير البيانات). |
| **Encryption at Rest** | AES-256 or equivalent for stored PHI | `server/security.ts` encrypts analytics snapshots + audit logs using AES-256-GCM; guidance provided for CloudSQL/GCS encryption. | Files: `server/data/*.enc`, configuration steps in `docs/security.md`. |
| **Audit Logging** | Immutable, tamper-evident audit trail | `server/audit-logger.ts` appends encrypted NDJSON entries per sensitive operation (auth, analytics, PMS). | Log path `server/data/audit-log.ndjson`; review via `exportDecryptedAuditEvents`. |
| **Monitoring & Alerting** | Track availability & anomalies | `server/systemMetrics.ts` + Analytics dashboard “Service health” section; alerts defined in HA doc. | Dashboard: `src/ai/dashboard/AnalyticsDashboard.tsx`; doc `docs/high-availability.md`. |
| **Incident Response** | Documented procedure, escalation | Runbook with detection, mitigation, communication, post-mortem steps. | `docs/runbooks/voice-agent-failover.md`. |
| **Business Continuity** | DR plan, RTO/RPO targets | Active-active regional design, database failover, backup strategy. | Architecture detail `docs/high-availability.md`. |
| **Data Minimization** | Sanitize PHI in logs and responses | `sanitizeSensitiveText` scrubber applied to analytics, audit metadata. | Implementation `server/security.ts`, analytics ingestion `server/analytics-engine.js`. |
| **Testing & Validation** | Continuous verification | Jest security tests (`npm test -- security-sanitizer.test.ts`), service smoke tests (`scripts/voice-engine-smoke.ts`). | Test outputs stored in CI logs; instructions in README. |

## Audit Log Review Procedure
1. Export encrypted entries: `node -e "require('./server/audit-logger.ts').exportDecryptedAuditEvents().then(console.log)"` (ensure AES key present).
2. Store exports in secure evidence repository (e.g., GCS bucket with Object Lock).
3. Review monthly for anomalous access patterns; record findings in compliance tracker.

## Incident Response Evidence
- PagerDuty alerts → Slack channel `#edentist-incident` (auto-archived).
- Post-incident reports filed in Confluence; cross-link to Jira follow-up tasks.

## Change Management
- All code changes require PR reviews + automated tests (`npm test`).
- Deployment logs retained via Cloud Deploy / Argo; link release IDs to change tickets.

## Next Steps
- Integrate audit log export with SIEM (e.g., Chronicle / Splunk).
- Automate HIPAA workforce training acknowledgment tracking (out of scope for repo).
- Schedule quarterly compliance review referencing this evidence sheet.


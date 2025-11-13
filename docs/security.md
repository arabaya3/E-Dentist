# eDentist.AI Security Hardening

This document summarizes the controls implemented to align the AI assistant with baseline HIPAA and SOC 2 expectations.

## Data Encryption

- **In transit**: Clients enforce HTTPS redirects. Deploy behind a load balancer or gateway that supports TLS 1.2 or higher.
- **At rest (application layer)**: `server/security.ts` encrypts sensitive snapshots—such as analytics state—using `AES-256-GCM` with one of the following secrets:

```bash
EDENTIST_AES_KEY=<64-hex>
# or
EDENTIST_AES_PASSPHRASE="strong passphrase value"
```

Encrypted files are stored at `server/data/analytics-state.enc` with `600` permissions.
- **Databases and backups**: Prefer CloudSQL/AlloyDB with Transparent Data Encryption and encrypted automated backups. For self-managed PostgreSQL, enable disk encryption (dm-crypt) or move to a managed service with built-in encryption. Host GCS backups in a bucket configured with uniform bucket-level access and Bucket Lock.

## Identity and Session Management

- The JWT gateway has been removed; `/api/analytics/*` and `/api/integrations/pms/*` no longer require bearer tokens.
- Restrict access through an API gateway, VPN, or IP allowlists at the network edge. Add basic authentication on the reverse proxy if additional safeguarding is needed.

## Log Scrubbing

- All text processed in the UI or forwarded to the analytics engine passes through `sanitizeSensitiveText`, masking email addresses, phone numbers, payment data, and common injection patterns.
- Sensitive values are blocked from session state and outbound log payloads.

## Audit Logging

- `server/audit-logger.ts` records sensitive analytics and PMS operations as encrypted `audit-log.ndjson` entries in `server/data` with `600` permissions.
- Each record is stored as an `AES-256-GCM` payload with minimal metadata (action, status, actor, IP address, identifiers).
- Export entries for audits via `exportDecryptedAuditEvents` or by decrypting the file with the same secret.

## Incident Response Plan

- `docs/runbooks/voice-agent-failover.md` documents severity classification, diagnostics, failover, and communication templates.
- The team performs quarterly simulations of regional or database failures and logs the outcomes in the compliance evidence tracker.

## Security Testing

A Jest test in `src/__tests__/security-sanitizer.test.ts` verifies that the scrubbing routine continues to operate correctly.

```bash
npm test -- security-sanitizer.test.ts
```

## Environment Variables

```bash
# AES-256
EDENTIST_AES_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
# passphrase alternative
EDENTIST_AES_PASSPHRASE="edDentist secret passphrase"
```

- The legacy variables `EDENTIST_JWT_SECRET` and related credentials are no longer used and can be removed from environment files.

> **Note:** Store all secrets in a dedicated Vault or Secret Manager instead of the repository.

## Compliance References

- `docs/high-availability.md` outlines the distributed architecture and disaster recovery workflow.
- `docs/runbooks/voice-agent-failover.md` details SEV1 and SEV2 response procedures.
- `docs/compliance-evidence.md` aggregates policies, tests, and other HIPAA/SOC 2 artifacts for auditors.


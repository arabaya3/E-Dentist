## AI Service Handover

- **Scope**: Dental voice agent + analytics + PMS bridge exposed over the CRA dev proxy (`src/setupProxy.js`). One service bundle ships the AI logic, persistence, and integration stubs.

### Quick Start
- `cp .env.example .env.local` (create if missing) with:
  - `GEMINI_API_KEY`, `GEMINI_TEXT_MODEL` (optional), `PROJECT_ID`
  - `DATABASE_URL` for Postgres (Prisma)
  - Legacy `EDENTIST_*` auth variables are no longer required.
- Install & bootstrap: `npm install`, `npx prisma migrate deploy`, `npm run seed` (optional), `npm start`
- Local base URL: `https://localhost:3000` (React dev server + proxy). In production run the same proxy logic inside your API gateway or wrap it in a small Express server.

### Service Surface
- All endpoints are exposed without JWT authentication; rely on your API gateway or VPC rules for access control.
- Voice Agent config: `GET /api/agent/config` → `{status, config}` from `dbBookingIntegration.getActiveAgentProfile`.
- Analytics ingest: `POST /api/analytics/events` → accepts `session_started | session_closed | turn` events; responds `202 Accepted`.
- Analytics report: `GET /api/analytics/report` → aggregated metrics used by `src/ai/dashboard`.
- PMS catalogue: `GET /api/integrations/pms/providers` → available provider ids.
- PMS booking: `POST /api/integrations/pms/:provider/book` → create booking via provider adapter.
- PMS update: `PATCH /api/integrations/pms/:provider/booking/:bookingId` → update existing booking.
- PMS cancel: `DELETE /api/integrations/pms/:provider/booking/:bookingId` → cancel booking.
- PMS performance: `POST /api/integrations/pms/:provider/performance` → forward daily KPIs (auto-populates report if omitted).

Error format: `{status: "error", message, details?}`. Standard HTTP statuses (`400`, `404`, `422`, `500`) surfaced from the integration layer.

### AI Runtime Notes
- Conversation orchestration lives in `src/services/conversation_manager.ts`, using Gemini (`@google/genai`) with dynamic intents, entity capture, and clinic content templates stored in Postgres via Prisma.
- Database helpers & config live under `server/dbBookingIntegration.ts`; PMS adapters in `server/pmsIntegration.ts`.
- System metrics + audit hooks (`server/systemMetrics.ts`, `server/audit-logger.ts`) log latency and critical actions across analytics/PMS flows. Keep `service-account.json` and encrypted analytics state secure.

### Delivery Checklist
- Hand over this document and the Postman collection (`docs/AI-service.postman_collection.json`).
- Provide `.env.local` sample (strip secrets).
- Walk Mahmoud through one happy-path flow (analytics ingest → PMS booking) and share the dashboard view.
- Keep support channel open (Slack/email) for rollout; monitor `server/logs` or your APM for PMS/analytics failures in the first 48 h.


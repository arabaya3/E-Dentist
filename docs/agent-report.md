# eDentist.AI Agent Report

## 1. Overview
- **Purpose:** An intelligent text-and-voice assistant that manages dental appointments, answers FAQs, and executes actions against PMS/CRM integrations.
- **Core stack:** React + TypeScript for the console, Google Gemini (Text & Live) for AI, Prisma + PostgreSQL for data, and PMS integrations implemented in Node/Express (`setupProxy` + `server/*`).
- **Current scope:** Handles booking, cancelation, rescheduling, general inquiries, post-visit follow-ups, and care reminders. Voice flows run through Gemini Live; text flows are orchestrated by `ConversationManager`.

## 2. Agent components
| Layer | Key files | Description |
|-------|-----------|-------------|
| UI | `src/components/simple-voice/VoiceAgentBootstrap.tsx`, `src/services/conversation_manager.ts`, `src/contexts/LiveAPIContext` | Boots the voice/text session, streams state updates, and forwards prompts to the model. |
| Supporting services | `src/services/conversation_manager.ts`, `src/utils/language.ts` | Intent detection, entity extraction, template rendering, PMS/database calls. |
| Server layer | `src/setupProxy.js`, `server/dbBookingIntegration.ts`, `server/pmsIntegration.ts` | Unified API for analytics ingestion, booking sync, and agent configuration. |
| Data | `prisma/schema.prisma`, `prisma/seed.ts`, `clinic_content`, `AgentPageConfig` | Schema definitions, default seed data, and per-clinic response templates. |

## 3. Conversation flow (`ConversationManager`)
1. **Ingest message:** `ingestUserMessage` records role and text in the session state.
2. **Intent & entity analysis:** Calls Gemini with `capture_clinic_entities` to retrieve intent + entities and normalize service/doctor names.
3. **State update:** Merges extracted entities with prior context.
4. **Generate reply:** `generateAssistantReply` detects language, applies greeting rules, then:
   - Chooses the appropriate template (`booking.confirmed`, `follow_up.general`, etc.).
   - Fetches text via `fetchClinicContent`.
   - Injects variables (`{{doctor_name}}`, `{{appointment_time}}`, ...).
   - If required, invokes `createBookingViaDB`, `updateBookingViaDB`, etc., to perform PMS operations.
5. **Log response:** Pushes the assistant reply into session history for the next turn’s context.

## 4. Voice flow (`VoiceAgentBootstrap`)
- Loads the active agent profile from `/api/agent/config`, which references `AgentPageConfig` (localized greeting, required fields, clinic details).
- Builds the Gemini Live `systemInstruction`, including working hours, booking requirements, and the `render_altair` tool for analytics visuals.
- Reuses the same database content for greetings and agent metadata.

## 5. Database interactions
- **Bookings:** `createBookingViaDB`, `updateBookingViaDB`, and `cancelBookingViaDB` translate requests into `appointment` records and link them to the appropriate doctor/clinic via `agentPageConfig` or `user`.
- **Doctor availability:** `getAvailableDoctors` aggregates active doctors from `agentPageConfig` or clinic users.
- **Clinic templates:** The restored `clinic_content` table supplies customizable responses. Default greetings remain in `AgentPageConfig` as a final fallback.

## 6. Issue resolved
- **Impact:** The agent reverted to generic responses because `fetchClinicContent` read only from `AgentPageConfig` after the `clinic_content` table was dropped in earlier migrations.
- **Fix:**
  1. Reintroduced the `ClinicContent` model in `prisma/schema.prisma` with keyword tags and timestamps.
  2. Added migration `20251112153000_create_clinic_content` to create the table and indexes.
  3. Updated `fetchClinicContent` to query the table with locale fallback, returning to `AgentPageConfig` only when necessary.
  4. Refreshed `prisma/seed.ts` with Arabic/English samples (`booking.confirmed`, `booking.missing_fields`, `follow_up.general`, ...).
  5. Documented the initialization steps in the README under “Clinic content templates”.
- **Outcome:** Responses now prioritize clinic-specific content before falling back to generic copy, preserving branding and tone.

## 7. Template management workflow
1. Run migrations and seeds:
   ```bash
   npx prisma migrate deploy
   npx prisma db seed
   ```
2. Add or edit rows in `clinic_content` (via Prisma Studio or `psql`) using the fields:
   - `slug`: matches keys emitted by `ConversationManager` (e.g., `booking.confirmed`).
   - `locale`: `ar` or `en`.
   - `content`: text supporting double-braced variables (`{{doctor_name}}`).
   - `tags`: optional metadata for future use (can be empty `[]`).
3. Redeployment is unnecessary—templates are fetched live from the database.

## 8. Recommendations & next steps
1. **Run the conversation demo:** `npm run demo:conversation` to ensure updated text appears after database changes.
2. **Add more templates:** Cover cases such as `booking.failure_*` and `service.orthodontics` for full intent coverage.
3. **Content admin UI:** Build a simple interface on top of `/api/agent/config` to manage `clinic_content` without manual DB edits.
4. **Quality monitoring:** Trigger alerts when a template is missing for any slug to avoid future fallbacks.

> Last updated: reflects system state after the fixes on 12 November 2025 (restoring database-backed templates).


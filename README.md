# eDentist.AI – Dental Clinic Assistant

A bilingual (Arabic/English) voice and text console that helps patients book, modify, or cancel appointments and browse clinic services. The stack combines the Gemini Live API, Prisma, PostgreSQL, and optional PMS/CRM integrations.

> **تنبيه:** بُني المشروع على فرع `V4_Ayed`. تأكد من استنساخه أو سحب هذا الفرع قبل التشغيل.

---

## Prerequisites

| Component | Recommended Version |
|-----------|---------------------|
| Node.js   | ≥ 18.x |
| npm       | Bundled with Node.js |
| PostgreSQL | ≥ 14 |
| Google Gemini API account | Active key |
| PMS/CRM integration (optional) | GoHighLevel, Salesforce, or HubSpot credentials |

Install `git`, and set up `psql` if you prefer working with the CLI.

---

## 1. Clone the repository

```bash
git clone https://github.com/Moh-abufurha/E-Dentist.git
cd E-Dentist
git checkout V4_Ayed
```

---

## 2. Configure environment variables

Create a `.env` file in the project root (do not commit it). Use the following template as a starting point:

```bash
# Gemini API keys (duplicated for React because requests originate from the browser)
GEMINI_API_KEY=your_server_side_key
REACT_APP_GEMINI_API_KEY=your_browser_key

PROJECT_ID=your-google-cloud-project
REACT_APP_PROJECT_ID=your-google-cloud-project

GEMINI_MODEL=gemini-2.5-audio
REACT_APP_GEMINI_MODEL=gemini-2.5-audio
LIVE_MODEL=models/gemini-2.0-flash-exp
REACT_APP_LIVE_MODEL=models/gemini-2.0-flash-exp

API_URL=https://generativelanguage.googleapis.com/v1beta/models
REACT_APP_API_URL=https://generativelanguage.googleapis.com/v1beta/models

# Database connection string (update to match your setup)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/edentist?schema=public"
```

> See `docs/pms-integration.md`, `docs/voice-engine.md`, and `docs/security.md` for provider keys and data-protection guidance.

---

## 3. Install dependencies

```bash
npm install
```

> On platforms that require local HTTPS certificates (e.g., Windows), plan to run `npm run start-https` to launch CRA with HTTPS.

---

## 4. Prepare the PostgreSQL database

1. **Create an empty database** (one-time):
   ```bash
   createdb edentist
   ```
   or use PgAdmin / any GUI.

2. **Apply Prisma migrations**:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   # or, for a fresh development environment:
   # npx prisma migrate dev --name init
   ```

3. **Seed initial data** (doctors + message templates). Open `psql`:
   ```bash
   psql postgresql://postgres:postgres@localhost:5432/edentist
   ```

   Run or adapt the following inserts:
   ```sql
   INSERT INTO doctors (name, specialty, branch, work_start, work_end, available_days)
   VALUES
     ('Dr. Ayed Al-Harbi', 'Orthodontics', 'Riyadh - Olaya', '09:00', '17:00', ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday']),
     ('Dr. Lina Samir', 'Teeth Whitening', 'Riyadh - Malqa', '12:00', '20:00', ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday']);

   INSERT INTO clinic_content (slug, locale, content, tags)
   VALUES
     ('booking.confirmed', 'ar', 'تم حجز موعدك مع الدكتور {{doctor_name}} في فرع {{clinic_branch}} يوم {{appointment_date}} الساعة {{appointment_time}}.', ARRAY['booking']),
     ('booking.confirmed', 'en', 'Your appointment with Dr. {{doctor_name}} at {{clinic_branch}} is booked for {{appointment_date}} at {{appointment_time}}.', ARRAY['booking']),
     ('booking.rescheduled', 'ar', 'تم تعديل موعدك ليكون يوم {{appointment_date}} الساعة {{appointment_time}}.', ARRAY['booking']),
     ('booking.rescheduled', 'en', 'Your appointment has been rescheduled to {{appointment_date}} at {{appointment_time}}.', ARRAY['booking']),
     ('booking.missing_fields', 'ar', 'لإتمام الحجز أحتاج إلى: {{missing_fields}}.', ARRAY['booking']),
     ('booking.missing_fields', 'en', 'To complete the booking I still need: {{missing_fields}}.', ARRAY['booking']),
     ('booking.cancelled', 'ar', 'تم إلغاء الموعد بنجاح. نأمل نراك قريباً!', ARRAY['booking']),
     ('booking.cancelled', 'en', 'Your appointment has been cancelled successfully. We hope to see you soon!', ARRAY['booking']),
     ('inquiry.general', 'ar', 'يسرّنا الرد على استفساراتك حول خدمات العيادة مثل التنظيف، التقويم، الزراعة أو التبييض. كيف يمكنني المساعدة؟', ARRAY['inquiry']),
     ('inquiry.general', 'en', 'I’m happy to help with questions about cleaning, orthodontics, implants, or whitening. How can I assist you today?', ARRAY['inquiry']);
   ```

   Extend the dataset with additional doctors or templates whenever needed.

4. **Inspect tables**:
   ```bash
   npx prisma studio
   ```
   Open the browser URL that Prisma Studio prints to verify your data.

---

## 5. Run the stack locally

1. **Start the development UI (CRA + HTTPS)**:
   ```bash
   npm run start-https
   ```
   - The console opens at `https://localhost:3000`.
   - Accept the self-signed certificate once.

2. **Use the voice/text console**:
   - The side panel lets you send text messages.
   - Enable microphone or screen capture through the `ControlTray`.

3. **Optional smoke tests**:
   ```bash
   npm run test:audio         # Send a WAV sample and receive synthesized audio
   npm run test:voice-engine  # Exercise bilingual speech transforms
   npm run demo:conversation  # Run a scripted conversation in Node.js
   ```

> All commands assume Gemini keys are configured correctly in `.env`.

---

## 6. Optional PMS/CRM integrations

- Enable provider-specific variables in `.env` as documented in `docs/pms-integration.md`.
- While CRA is running, the proxy exposes endpoints under `/api/integrations/pms/...`.
- The analytics dashboard can push performance reports directly to third-party systems.

---

## 7. Key directories

| Path | Description |
|------|-------------|
| `src/services/conversation_manager.ts` | Conversation logic and booking workflow |
| `server/dbBookingIntegration.ts` | Direct Prisma operations for booking records |
| `docs/voice-engine.md` | Speech-to-text / text-to-speech configuration |
| `scripts/*` | Utility and smoke-test scripts |
| `prisma/migrations` | Database schema definitions |

---

## 8. Deploy or share the project

1. Configure environment variables on the target host (Docker or your CI/CD platform).
2. Build the frontend with `npm run build`.
3. Run the Node backend (if splitting the code) or host the CRA build with your preferred provider.
4. Provision the production database and execute `npx prisma migrate deploy` before serving the UI.

---

## 9. Additional references

- **Security & compliance**: `docs/security.md`
- **Voice pipeline**: `docs/voice-engine.md`
- **External integrations**: `docs/pms-integration.md`
- **High availability**: `docs/high-availability.md`
- **Incident response**: `docs/runbooks/voice-agent-failover.md`
- **Compliance evidence**: `docs/compliance-evidence.md`
- **Security tests**: `npm test` executes Jest suites, including `src/__tests__/security-sanitizer.test.ts`

For questions or contributions, open an issue in the repository. Happy building! 🎧🦷

---

## Clinic content templates

- The `clinic_content` table and the `20251112153000_create_clinic_content` migration hold the localized responses that `ConversationManager` renders.
- Apply the latest migrations and optional seed data with Prisma:
  ```bash
  npx prisma migrate deploy
  npx prisma db seed
  ```
- Manage the records with `psql` or Prisma Studio. Each row is keyed by `slug` (for example, `booking.confirmed`) and `locale` (`ar` or `en`). Templates accept placeholders such as `{{doctor_name}}`, `{{appointment_date}}`, and `{{missing_fields}}`.


# ENDPOINTS & ENV CONFIG

**Primary Base (Backend 2 / MCP):**
- `EDENTIST_API_BASE_URL` (default: `https://edentist-be-stage-576483531725.europe-west1.run.app/api/v1`)

**OTP / Auth Base:**
- `AGENT_API_BASE_URL` _or_ `OTP_API_BASE_URL` _or_ `AUTH_STAGE_URL` (used by `/agent/auth/send-otp`, `/agent/auth/verify-otp`)

**Gemini API:**
- `GEMINI_API_KEY`, `REACT_APP_GEMINI_API_KEY`
- Base: `https://generativelanguage.googleapis.com/v1beta/models`

**Database:**
- `DATABASE_URL` (MySQL) e.g. `mysql://user:pass@localhost:3306/edentist`

---

## Backend 2 Endpoints (used by MCP tools)
- `GET /agnet/clinic` — list clinics
- `GET /agnet/clinic/doctors?clinicId=` — list doctors by clinic
- `GET /agnet/clinic/solt?clinicId=&start=&end=` — free slots
- `GET /agnet/clinic/appointment/{userId}` — list user appointments
- `POST /agnet/clinic/appointment` — create appointment (requires valid `userId` existing in backend)
- `DELETE /agnet/clinic/appointment?appointmentId=&userId=` — cancel appointment
- Non-implemented tools (kept as error-only): `update_appointment`, `validate_voucher`, `find_user_by_name`, `search_appointments`.

---

## Quick Setup Checklist
1) Create `.env` at repo root with:
```
EDENTIST_API_BASE_URL=https://edentist-be-stage-576483531725.europe-west1.run.app/api/v1
AGENT_API_BASE_URL=<otp/auth base>
GEMINI_API_KEY=<key>
REACT_APP_GEMINI_API_KEY=<key>
DATABASE_URL=mysql://user:pass@localhost:3306/edentist
```
2) Install deps: `npm install`
3) Prisma (from `mcp-server/`): `npm install && npx prisma generate && npm run build`
4) Start MCP: `node dist/index.js`
5) Start backend: `npm run start:backend`
6) Start frontend: `npm start`

---

## Notes
- Appointment creation needs a real `userId` present in backend-two and an available slot; otherwise returns `user not found` or `SLOT_UNAVAILABLE`.

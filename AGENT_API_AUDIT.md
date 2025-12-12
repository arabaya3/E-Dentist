# eDentist Agent API Audit (Backend 2)

**Last checked:** 2025-12-12 — Environment: stage (`https://edentist-be-stage-576483531725.europe-west1.run.app/api/v1`).  
**Scope:** MCP tools ↔ backend-two endpoints. No auth observed in tested endpoints (all returned 200 without tokens). CORS header present (`Access-Control-Allow-Origin: *`).

> Safety: لم ننفّذ أي طلبات كتابة (create/cancel) لتفادي حجز حقيقي. أمثلة النجاح للعمليات غير المجربة مذكورة بصيغة Placeholder ويجب استبدالها بنتائج حقيقية بعد الاختبار.

---

## A) Endpoint Catalog (method, URL, params, body, responses)

### 1) List clinics
- **Method/URL:** `GET /agnet/clinic`
- **Query:** `country?` `city?` `address?`
- **Auth:** None seen
- **Success 200 (observed):**
```
[{"id":1,"name":"eDentist.AI","country":"amman","city":"amman","address":"amman"}]
```
- **curl:** `curl -i "$BASE/agnet/clinic"`

### 2) List doctors for a clinic
- **Method/URL:** `GET /agnet/clinic/doctors`
- **Query:** `clinicId` (required), `limit?`
- **Auth:** None seen
- **Success 200 (observed clinicId=1):**
```
[{"id":"KQv9iMHQ5hxCsqrK02Kb","name":"شهد إستقبال الزقزوق's Personal Calendar","isActive":true},{"id":"svp7QO0xCiUVEendnjzh","name":"Schedule an Appointment with Dr Khaled","isActive":true}]
```
- **curl:** `curl -i "$BASE/agnet/clinic/doctors?clinicId=1"`

### 3) Free slots
- **Method/URL:** `GET /agnet/clinic/solt`
- **Query:** `clinicId` (required), `doctorId?`, `start` (ISO), `end` (ISO)
- **Auth:** None seen
- **Success 200 (observed sample):** `[]`
- **curl:** `curl -i "$BASE/agnet/clinic/solt?clinicId=1&start=2025-12-12T09:00:00Z&end=2025-12-12T12:00:00Z"`

### 4) List appointments for user
- **Method/URL:** `GET /agnet/clinic/appointment/{userId}`
- **Query:** `doctorId?` `startFrom?` `startTo?`
- **Auth:** None seen
- **Success 200 (observed userId=1):** `[]`
- **curl:** `curl -i "$BASE/agnet/clinic/appointment/1"`

### 5) Create appointment (tested)
- **Method/URL:** `POST /agnet/clinic/appointment`
- **Body:** `{ clinicId:number, doctorId:string, start:string(ISO), end:string(ISO), userId:number, patientName?:string, patientPhone?:string, patientEmail?:string, notes?:string }`
- **Auth:** None required in staging
- **Test result (2025-12-12, staging, clinicId=1, doctorId=svp7QO0xCiUVEendnjzh, userId=1320, 2025-12-08T07:00Z→07:30Z):** 500 with body  
`{"statusCode":500,"message":"SLOT_UNAVAILABLE","path":"/api/v1/agnet/clinic/appointment","method":"POST"}`  
=> الحجز يتطلب Slot متاح؛ استعلامات free_slots الحالية أعادت `[]` لذا لا توجد أوقات متاحة في هذا المدى.
- **For success:** اختر وقت يظهر في `free_slots`. إذا استمرت `[]`، فعلى الباكند توفير Slots أو قبول الحجز دون تحقق.
- **curl template:**  
`curl -X POST -H "Content-Type: application/json" -d '{"clinicId":1,"doctorId":"<id>","start":"<ISO>","end":"<ISO>","userId":<realId>,"patientName":"Test","patientPhone":"+9627..."}' "$BASE/agnet/clinic/appointment"`

### 6) Cancel appointment **(not executed)**
- **Method/URL:** `DELETE /agnet/clinic/appointment?appointmentId={id}&userId={userId}`
- **Auth:** Unknown
- **Success 200 (placeholder):** `{"success":true,"message":"deleted"}` (replace with real response after test)
- **curl:** `curl -X DELETE "$BASE/agnet/clinic/appointment?appointmentId=123&userId=99"`

### 7) Find user by phone (disabled)
- **Status:** Endpoint not available on stage; MCP tool now throws immediately to prevent hallucination.
- **Action:** When backend exposes the correct route, re-enable the tool and update the URL.

### 8) Not implemented tools (MCP returns error without calling API)
- `update_appointment`, `validate_voucher`, `find_user_by_name`, `search_appointments` → all throw “not implemented” from MCP server.

---

## B) Tool Schemas (ready to copy)

`BASE = https://edentist-be-stage-576483531725.europe-west1.run.app/api/v1`

**create_appointment**
```json
{
  "name": "create_appointment",
  "description": "Create a dental appointment in backend-two.",
  "parameters": {
    "type": "object",
    "properties": {
      "clinicId": { "type": "integer", "minimum": 1 },
      "doctorId": { "type": "string" },
      "start": { "type": "string", "description": "ISO datetime" },
      "end": { "type": "string", "description": "ISO datetime" },
      "userId": { "type": "integer", "minimum": 1 },
      "patientName": { "type": "string" },
      "patientPhone": { "type": "string" },
      "patientEmail": { "type": "string", "format": "email" },
      "notes": { "type": "string" }
    },
    "required": ["clinicId","doctorId","start","end","userId"]
  },
  "http": {
    "method": "POST",
    "url": "${BASE}/agnet/clinic/appointment",
    "headers": { "Content-Type": "application/json" }
  },
  "responseSchema": { "type": "object" }
}
```

**cancel_appointment**
```json
{
  "name": "cancel_appointment",
  "description": "Cancel an appointment by id and userId.",
  "parameters": {
    "type": "object",
    "properties": {
      "appointmentId": { "oneOf": [{ "type": "integer" }, { "type": "string", "pattern": "^\\d+$" }] },
      "userId": { "oneOf": [{ "type": "integer" }, { "type": "string", "pattern": "^\\d+$" }] },
      "reason": { "type": "string" },
      "cancelledBy": { "type": "string" }
    },
    "required": ["appointmentId","userId"]
  },
  "http": {
    "method": "DELETE",
    "url": "${BASE}/agnet/clinic/appointment",
    "headers": { "Accept": "application/json" }
  },
  "responseSchema": { "type": "object" }
}
```

**list_clinics**
```json
{
  "name": "list_clinics",
  "description": "List clinics (country/city/address filters optional).",
  "parameters": {
    "type": "object",
    "properties": {
      "country": { "type": "string" },
      "city": { "type": "string" },
      "address": { "type": "string" },
      "limit": { "type": "integer", "minimum": 1, "maximum": 100 }
    }
  },
  "http": { "method": "GET", "url": "${BASE}/agnet/clinic" },
  "responseSchema": { "type": "array", "items": { "type": "object" } }
}
```

**list_doctors**
```json
{
  "name": "list_doctors",
  "description": "List doctors for a clinic.",
  "parameters": {
    "type": "object",
    "properties": {
      "clinicId": { "type": "integer", "minimum": 1 },
      "limit": { "type": "integer", "minimum": 1, "maximum": 100 }
    },
    "required": ["clinicId"]
  },
  "http": { "method": "GET", "url": "${BASE}/agnet/clinic/doctors" },
  "responseSchema": { "type": "array", "items": { "type": "object" } }
}
```

**free_slots**
```json
{
  "name": "free_slots",
  "description": "Get available slots for a clinic (optional doctor).",
  "parameters": {
    "type": "object",
    "properties": {
      "clinicId": { "type": "integer", "minimum": 1 },
      "doctorId": { "type": "string" },
      "start": { "type": "string", "description": "ISO datetime" },
      "end": { "type": "string", "description": "ISO datetime" }
    },
    "required": ["clinicId","start","end"]
  },
  "http": { "method": "GET", "url": "${BASE}/agnet/clinic/solt" },
  "responseSchema": { "type": "object" }
}
```

**list_user_appointments**
```json
{
  "name": "list_user_appointments",
  "description": "List appointments for a user.",
  "parameters": {
    "type": "object",
    "properties": {
      "userId": { "oneOf": [{ "type": "integer" }, { "type": "string", "pattern": "^\\d+$" }] },
      "doctorId": { "type": "string" },
      "startFrom": { "type": "string" },
      "startTo": { "type": "string" },
      "limit": { "type": "integer", "minimum": 1, "maximum": 100 }
    },
    "required": ["userId"]
  },
  "http": { "method": "GET", "url": "${BASE}/agnet/clinic/appointment/{userId}" },
  "responseSchema": { "type": "array", "items": { "type": "object" } }
}
```

**Non-implemented tools** (`update_appointment`, `validate_voucher`, `find_user_by_name`, `search_appointments`, `log_voice_call`) already throw explicit errors; leave descriptions as-is to prevent hallucinated actions.

---

## C) Test Scenarios (manual via curl/Postman)
1) **List clinics happy path**  
`curl -i "$BASE/agnet/clinic"` → expect 200 + array with clinic objects.
2) **List doctors happy path**  
`curl -i "$BASE/agnet/clinic/doctors?clinicId=1"` → expect 200 + doctors array (ids used later).
3) **Free slots range**  
`curl -i "$BASE/agnet/clinic/solt?clinicId=1&start=2025-12-12T09:00:00Z&end=2025-12-12T12:00:00Z"` → expect 200 (empty array acceptable).
4) **List appointments for user**  
`curl -i "$BASE/agnet/clinic/appointment/1"` → expect 200 + array (may be empty).
5) **(After staging data ready) Create appointment smoke test**  
POST body with known doctorId/clinicId/userId; expect 200/201 and returned booking id. Run only on test data to avoid real bookings.
6) **Cancel appointment smoke test**  
DELETE with appointmentId created in #6; expect 200 success.

Agent behavior expectations: on 4xx/5xx tool should surface error text; agent must paraphrase and stop (no fabricated data).

---

## D) Findings & Recommendations
- **Write operations unverified**: `create_appointment` and `cancel_appointment` not exercised to avoid real bookings. Run controlled tests and capture real response schema to replace placeholders.
- **Typoed path `/solt`**: Endpoint works despite typo; keep as-is unless backend fixes spelling (then update MCP + tools).
- **Env alignment**: MCP uses `EDENTIST_API_BASE_URL` in `mcp-server/src/index.ts`. Frontend uses `REACT_APP_API_BASE_URL` to reach `/api/mcp/tools/...` on your backend. Ensure this env points to the backend that can reach the stage API.
- **CORS**: Backend-two sets `Access-Control-Allow-Origin: *`, so browser calls via your backend proxy should be fine; keep proxy to avoid direct browser → stage calls.
- **Timeout/retry**: No retries in MCP helpers. Consider wrapping fetch with timeout + single retry for transient 5xx.

---

## E) Prompt Guard (system instruction)
ضع هذا السطر في الـ system prompt:  
**"استخدم فقط الـ Tools المعرفة. لا تنشئ أو تختلق بيانات. إن لم يوجد Tool مناسب، اكتب: 'لا توجد أداة متاحة لهذه المهمة — لا يمكن الاستجابة'."**

---

## F) Quick Reference (curl templates)
- List clinics: `curl -i "$BASE/agnet/clinic"`
- List doctors: `curl -i "$BASE/agnet/clinic/doctors?clinicId=1"`
- Free slots: `curl -i "$BASE/agnet/clinic/solt?clinicId=1&start=<ISO>&end=<ISO>"`
- List appointments: `curl -i "$BASE/agnet/clinic/appointment/<userId>"`
- Create appointment (test only): `curl -X POST -H "Content-Type: application/json" -d '<body>' "$BASE/agnet/clinic/appointment"`
- Cancel appointment: `curl -X DELETE "$BASE/agnet/clinic/appointment?appointmentId=<id>&userId=<uid>"`

---

## G) Agent Handling Rules
- Always call tools for data; never synthesize appointment/doctor/user info.
- If tool returns error/empty: report that outcome, ask for alternative input, or offer to retry.
- Do not call `create_appointment` or `cancel_appointment` without `clinicId`, `doctorId`, `start`, `end`, `userId`.
- Treat non-implemented tools as errors and avoid fallback storytelling.


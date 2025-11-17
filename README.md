
# 📘 **E-Dentis_realtime — Realtime Voice AI Agent for Dental Clinics**

**E-Dentis_realtime** is a production-ready **realtime voice AI agent** built for dental clinics.
Powered by **Gemini Live API**, it enables instant, natural, bilingual (Arabic/English) voice conversations for booking appointments, answering clinic FAQs, and assisting patients in real time.

This project includes a complete **voice engine**, **LLM agent layer**, **realtime audio streaming**, **tool-calling**, **PMS integration**, **analytics dashboards**, and **a developer console**.

A fully modular, scalable, and customizable system suitable for real-world clinic operations.

---

# 🚀 Features

### 🎤 **Realtime Voice Assistant**

* Live PCM streaming (16 kHz)
* Ultra-low-latency LLM responses
* High-quality AI speech output
* Full Arabic + English support
* Intelligent language detection

### 📅 **Smart Appointment Handling**

* Create / modify / cancel appointments
* Required fields validation (name, phone, service)
* Dentist suggestions & alternatives
* Fully integrated PMS/CRM module (mock or real)

### 🧠 **Intelligent Agent Layer**

* Dynamic system instructions
* Tool-calling integration (Altair, PMS tools)
* Conversation state manager
* Sanitization & safety filters

### 🎛 **Simple Voice Console**

A minimal UI for controlling voice sessions:

* Start/End session
* Mute microphone
* Live audio meters
* Connection status & errors
* Bilingual hint messages

### 📊 **Advanced Analytics Dashboard**

* Session metrics
* Latency, hallucination rate, success rate
* Realtime logs
* Sentiment tracking
* Tool usage breakdown
* Altair charts powered by LLM

### 🧰 **Developer Console + Logging**

* SidePanel console
* Full streaming logs
* Tool calls & responses
* LLM tokens, messages, and events
* Debuggable in realtime

### 🔒 **Security**

* Input sanitization
* Safe function calling
* Auth hooks
* Config isolation
* Logging safeguards

---

# 🏗 Architecture Overview

```
E-Dentis_realtime/
│
├── src/
│   ├── components/
│   │   ├── simple-voice/
│   │   │   ├── VoiceAgentBootstrap.tsx     → AI bootstrap + system prompt config
│   │   │   ├── SimpleVoiceConsole.tsx      → Primary voice interaction UI
│   │   │   ├── ControlTray.tsx             → Audio/video/screen controller
│   │   │   ├── AudioPulse.tsx              → Audio peak visualization
│   │   │   └── SimpleVoiceConsole.scss     → UI styling
│   │   │
│   │   ├── dashboard/
│   │   │   ├── AIDashboard.tsx             → Operational analytics dashboard
│   │   │   ├── AnalyticsDashboard.tsx      → System performance metrics
│   │   │   ├── AnalyticsOrchestrator.tsx   → LLM-driven analytics bridge
│   │   │   └── Altair.tsx                  → Altair/Vega chart renderer
│   │   │
│   │   ├── logger/
│   │   │   ├── Logger.tsx                  → Log viewer for LLM events
│   │   │   ├── mock-logs.ts
│   │   │   └── logger.scss
│   │   │
│   │   ├── settings/
│   │   │   ├── SettingsDialog.tsx          → Voice & system configuration UI
│   │   │   ├── VoiceSelector.tsx           → Choose prebuilt LLM voice
│   │   │   ├── ResponseModalitySelector.tsx→ Choose audio/text response mode
│   │   │   └── SCSS styles
│   │   │
│   │   └── side-panel/
│   │       └── SidePanel.tsx               → Developer console (LLM logs)
│   │
│   ├── contexts/
│   │   └── LiveAPIContext.tsx              → Central provider for Gemini Live API
│   │
│   ├── hooks/
│   │   ├── use-live-api.ts                 → WebSocket + realtime streaming logic
│   │   ├── use-webcam.ts
│   │   ├── use-screen-capture.ts
│   │   ├── use-media-stream-mux.ts
│   │   └── useAnalyticsBridge.ts
│   │
│   ├── lib/
│   │   ├── audio-recorder.ts               → Raw PCM mic recorder
│   │   ├── audio-streamer.ts               → Audio streaming engine
│   │   ├── audio-utils.ts                  → PCM encoding helpers
│   │   ├── gemini-voice-engine.ts          → Voice engine (LLM + TTS)
│   │   ├── genai-live-client.ts            → Custom LiveAPI client wrapper
│   │   ├── audioworklet-registry.ts        → AudioWorklet loaders
│   │   ├── utils.ts                        → Utility collection
│   │   ├── vol-meter.ts                    → Audio volume analyzer
│   │   └── store-logger.ts                 → Zustand logger store
│   │
│   ├── ai/
│   │   ├── language.ts                     → Language detection (AR/EN)
│   │   ├── pmsIntegration.ts               → Clinic PMS integration logic
│   │   ├── auth.ts                         → Agent authentication logic
│   │   └── security.ts                     → Sanitization & validation
│   │
│   ├── services/
│   │   └── conversation_manager.ts         → Conversation flow manager
│   │
│   ├── App.tsx / index.tsx                 → App root
│   └── SCSS & CSS files
│
├── server/
│   ├── db.ts                               → Prisma connector
│   ├── dbBookingIntegration.ts             → DB-based booking management
│   ├── pmsIntegration.ts                   → PMS tool functions
│   ├── analytics-engine.js                 → Backend analytics pipeline
│   ├── security.ts                         → Security rules
│   └── auth.ts
│
├── prisma/
│   ├── schema.prisma                       → DB schema (doctors, bookings, content)
│   ├── migration_lock.toml
│   └── seed.ts
│
├── public/                                 → Static assets
├── package.json
├── tsconfig.json
└── README.md
```

## 🔐 Google Service Account Setup (Required)

To use **Google Cloud Services** (Gemini API, Realtime, etc.), you must create and add your **own** credentials file.

⚠️ **Important:**
`app-setting.json` is **NOT included** in the repo because it contains private keys.
Every developer must generate their own Google Service Account key.

---

### ✅ 1. Create a Google Service Account

1. Go to Google Cloud Console:
   [https://console.cloud.google.com/iam-admin/serviceaccounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click **“Create Service Account”**
3. Choose a name (example: `e-dentist-agent`)
4. Assign role → **Editor**
5. Save

---

### ✅ 2. Generate the Service Account Key

1. Open the service account you created
2. Go to the **Keys** tab
3. Click: **Add Key → Create New Key → JSON**
4. Download the JSON file
5. Rename it to:

```
app-setting.json
```
Move it to the **project root**:

```
/E-Dentis_realtime/app-setting.json
```

---

### ✅Update `.env`

Make sure your `.env` file contains:

```ini
GOOGLE_APPLICATION_CREDENTIALS=./app-setting.json
```

---

### ✅ Ensure It’s Ignored by Git

Your `.gitignore` must include:

```markdown
app-setting.json
*.key
*.pem
```

# ⚙️ Installation

### 1. Install dependencies

```bash
npm install
```

### 2. Prepare the database

```bash
npx prisma migrate deploy
npx prisma db seed
```

### 3. Configure environment variables

Create a **.env** file:

```
GEMINI_API_KEY=your_google_key
DATABASE_URL=postgresql://user:password@host:port/db
PMS_PROVIDER_KEY=mock
JWT_SECRET=your_jwt_secret
ANALYTICS_MODE=enabled
```

### 4. Start the development server

```bash
npm run dev
```

### 5. Open the app

```
http://localhost:3000
```

---

# 🧪 Usage Examples

### 🎤 Start a voice session

* Click **Start session**
* Begin speaking in Arabic or English
* The assistant answers instantly using Gemini Live

### 💬 Ask for bookings

> “I want to book a cleaning on Sunday at 2 PM.”

### 🔄 Modify or cancel an appointment

> “Reschedule my appointment to 4 PM.”

### 📈 Request analytics

> “Show me a graph of appointments by day.”

The agent will call the **render_altair** tool.

---

# 🛠 Tech Stack

* **React + TypeScript**
* **Gemini Live API (Streaming LLM)**
* **WebRTC / MediaStream API**
* **PCM 16 kHz audio pipeline**
* **Prisma ORM**
* **PostgreSQL**
* **Node.js backend**
* **Zustand**
* **Altair / Vega charts**
* **SCSS modules**

---

# 🧭 Roadmap

* [ ] Mobile-friendly UI
* [ ] Video-call support
* [ ] WhatsApp voice integration
* [ ] Real PMS integration (Dentrix, CareStack…)
* [ ] Export conversation transcripts (PDF)
* [ ] Multi-agent support
* [ ] Admin dashboard improvements
* [ ] Fine-tuned dental FAQ model

---

# 🐞 Troubleshooting

### ❌ Microphone not working

→ Check browser permissions
→ Use HTTPS
→ Restart the browser

### ❌ No response from the assistant

→ Invalid GEMINI_API_KEY
→ Gemini Live API disabled on your Google project

### ❌ Appointment not saving

→ Check Prisma migrations
→ Confirm `DATABASE_URL`
→ Ensure backend server is running

### ❌ Audio lag

→ Check network speed
→ Ensure 16 kHz PCM
→ Disable VPNs



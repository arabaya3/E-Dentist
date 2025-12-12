# 🦷 E-Dentist Realtime — Voice AI Agent for Jordanian Dental Clinics

**E-Dentist Realtime** is a production-ready real-time voice AI agent built for dental clinics in Jordan. Powered by **Gemini Live API** and **Model Context Protocol (MCP)**, it enables instant, natural, bilingual (Arabic/English) voice conversations for booking appointments, managing clinic operations, and assisting patients in real time.

This project includes a complete **voice engine**, **MCP-backed database operations**, **real-time audio streaming**, **tool-calling**, **analytics dashboards**, and **a developer console**.

---

## 🏗 Architecture

The system follows a clean, production-ready architecture:

```
Frontend (React)
    ↓
Gemini Live Agent
    ↓
MCP Tool Calls (via /api/mcp/tools/*)
    ↓
MCP Server (Node stdio)
    ↓
Prisma ORM
    ↓
MySQL Database
```

### Key Components

- **Frontend**: React + TypeScript application with Gemini Live integration
- **Voice Agent**: `VoiceAgentBootstrap.tsx` - Handles all tool calls and routes them to the backend
- **MCP Bridge**: Backend REST endpoint (`/api/mcp/tools/:toolName`) that forwards tool calls to the MCP server
- **MCP Server**: Standalone Node.js server (`mcp-server/`) that exposes database operations as MCP tools
- **Database**: MySQL with Prisma ORM for type-safe database access

---

## ✨ Features

### 🎤 Real-time Voice Assistant

- Live PCM streaming (16 kHz)
- Ultra-low-latency LLM responses
- High-quality AI speech output
- Full Arabic + English support
- Intelligent language detection

### 📅 Smart Appointment Management

- Create, update, and cancel appointments via MCP tools
- Required fields validation (name, phone, service)
- Doctor and clinic lookups
- Real-time database operations

### 🧠 MCP-Powered Database Operations

All database operations are exposed as MCP tools:

- **Appointment Management**: `create_appointment`, `update_appointment`, `cancel_appointment`
- **Clinic & Doctor Lookups**: `list_clinics`, `list_doctors`
- **User Management**: `find_user_by_name`, `list_user_appointments`
- **Search & Validation**: `search_appointments` (not implemented), `validate_voucher` (not implemented)
- **Analytics**: `log_voice_call`

### 🎛 Simple Voice Console

A minimal UI for controlling voice sessions:

- Start/End session
- Mute microphone
- Live audio meters
- Connection status & errors
- Bilingual hint messages

### 📊 Advanced Analytics Dashboard

- Session metrics
- Latency tracking
- Tool usage breakdown
- Real-time logs
- Sentiment tracking

### 🔒 Security

- Input sanitization
- Safe function calling
- JWT authentication for analytics
- Config isolation
- Logging safeguards

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- MySQL 8.0+
- Gemini API key from Google AI Studio

### Installation & Run (concise)

1) Install deps (root):
```bash
npm install
```

2) `.env` (root):
```ini
EDENTIST_API_BASE_URL=https://edentist-be-stage-576483531725.europe-west1.run.app/api/v1
AGENT_API_BASE_URL=https://your-auth-api-url.com
GEMINI_API_KEY=<key>
REACT_APP_GEMINI_API_KEY=<key>
DATABASE_URL=mysql://user:password@localhost:3306/edentist
PORT=5000
NODE_ENV=development
EDENTIST_AUTH_CLIENT_ID=your_client_id
EDENTIST_AUTH_CLIENT_SECRET=your_client_secret
EDENTIST_JWT_SECRET=your_jwt_secret_here
EDENTIST_AES_PASSPHRASE=your_aes_passphrase
EDENTIST_AES_KEY=your_aes_key
```

3) Prisma & MCP build (from `mcp-server/`):
```bash
npm install
npx prisma generate
npm run build
```

4) Run MCP (from `mcp-server/`):
```bash
node dist/index.js
```

5) Run backend (from `server/`):
```bash
npm start
```

6) Run frontend (root):
```bash
npm start
```

ثم افتح `http://localhost:3000`.

---

## 📋 MCP Tools (current)
- `create_appointment` — يتطلب userId حقيقي ووقت متاح من `free_slots` (وإلا 400/500).
- `cancel_appointment`
- `list_clinics`
- `list_doctors`
- `free_slots`
- `list_user_appointments`
- `log_voice_call` (تسجيل فقط)
- غير منفذة (ترمي أخطاء مقصودة): `update_appointment`, `validate_voucher`, `find_user_by_name`, `search_appointments`

---

## 📁 Project Structure

```
E-Dentist_realtime/
│
├── public/                 # Static assets
│   ├── favicon.ico
│   ├── index.html
│   └── robots.txt
│
├── src/                    # React frontend
│   ├── components/
│   │   └── simple-voice/
│   │       ├── VoiceAgentBootstrap.tsx  # Main voice agent with MCP tool integration
│   │       ├── SimpleVoiceConsole.tsx
│   │       └── ...
│   ├── contexts/
│   │   └── LiveAPIContext.tsx
│   ├── hooks/
│   │   └── useAnalyticsBridge.ts
│   ├── lib/
│   │   └── genai-live-client.ts
│   ├── ai/
│   │   └── dashboard/     # Analytics dashboard components
│   ├── setupProxy.js       # Backend proxy with MCP bridge endpoint
│   └── App.tsx
│
├── server/                 # Node.js backend
│   ├── mcpClient.ts        # MCP client for backend-to-MCP communication
│   ├── db.ts              # Shared Prisma client
│   ├── dbBookingIntegration.ts.js  # Agent profile helper
│   ├── prisma/
│   │   ├── schema.prisma   # Prisma schema
│   │   ├── seed.ts         # Database seed with Jordanian clinic data
│   │   └── migrations/
│   ├── index.js           # Express server
│   └── ...
│
├── mcp-server/            # MCP Server (standalone)
│   ├── src/
│   │   └── index.ts        # MCP server with all tool definitions
│   ├── dist/              # Compiled MCP server
│   └── tsconfig.json
│
├── mcp.json               # Cursor MCP configuration
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔧 Development

### Available Scripts

- `npm start` - Start React development server
- `npm run start:backend` - Start Node.js backend server
- `npm run build` - Build React app for production
- `npm run build:mcp` - Build MCP server TypeScript
- `npm run start:mcp` - Run MCP server directly (for testing)
- `npm test` - Run tests
- `npx prisma migrate dev` - Create and apply new migration
- `npx prisma db seed` - Seed database with sample data
- `npx prisma studio` - Open Prisma Studio to view database

### MCP Server Development

The MCP server is a standalone Node.js application that runs via stdio transport. It's automatically spawned by the backend when tool calls are made.

To test the MCP server directly:

```bash
npm run build:mcp
npm run start:mcp
```

### Database Schema

The database schema is defined in `server/prisma/schema.prisma`. Key models include:

- `User` - Clinic staff and patients
- `Clinic` - Dental clinic information
- `Appointment` - Appointment records with raw details stored as JSON
- `Voucher` - Discount vouchers
- `Transaction` - Payment transactions
- `Report` - Patient reports
- `VoiceCall` - Voice call logs
- `AgentPageConfig` - Agent configuration

### Seed Data

The seed file (`server/prisma/seed.ts`) generates realistic Jordanian dental clinic data:

- 5 clinics with Arabic names
- 5 doctors with specializations
- 5 patients with Jordanian phone numbers (079/078/077 format)
- Appointments, vouchers, transactions, and reports
- All data follows Jordanian naming conventions and phone number formats

---

## 🧪 Usage Examples

### Start a Voice Session

1. Click **"Start session"** in the UI
2. Grant microphone permissions
3. Begin speaking in Arabic or English
4. The assistant responds instantly using Gemini Live

### Book an Appointment
1) `list_clinics` → `list_doctors`  
2) تحقق من `free_slots` لاختيار وقت متاح فعلياً  
3) نفّذ `create_appointment` فقط بعد اكتمال (clinicId, doctorId, start, end, userId, patientName/Phone)  
4) إذا عاد خطأ 400/500: أعد الرسالة وتوقف؛ لا تفترض بيانات  

### Cancel Appointment
1) `list_user_appointments` لإيجاد الحجز  
2) `cancel_appointment` بالـ appointmentId و userId  
3) أعد التأكيد للمستخدم  

---

## 🛠 Tech Stack

- **Frontend**: React 18 + TypeScript
- **Voice AI**: Gemini Live API (Streaming LLM)
- **Database Protocol**: Model Context Protocol (MCP)
- **Database**: MySQL 8.0+ with Prisma ORM
- **Backend**: Node.js + Express
- **Audio**: WebRTC / MediaStream API, PCM 16 kHz
- **State Management**: Zustand
- **Charts**: Altair / Vega-Lite
- **Styling**: SCSS modules

---

## 🔐 Security Notes

- All database operations go through MCP tools (no direct frontend DB access)
- Analytics endpoints require JWT authentication
- Analytics are disabled in development mode to prevent 401 errors
- Input sanitization on all user inputs
- Safe function calling with Zod validation

---

## 🐞 Troubleshooting

### MCP Server Not Found

**Error:** `MCP server not found at ...`

**Solution:**
```bash
npm run build:mcp
```

### Database Connection Issues

**Error:** `Can't reach database server`

**Solution:**
1. Verify `DATABASE_URL` in `.env`
2. Ensure MySQL is running
3. Check network connectivity

### Analytics 401 Errors

**Error:** `POST /api/analytics/events 401 (Unauthorized)`

**Solution:** This is expected in development. Analytics are automatically disabled when `NODE_ENV !== "production"`. To enable in development, set `REACT_APP_ENABLE_ANALYTICS=true` in `.env`.

### Tool Calls Not Working

**Error:** Tool calls from Gemini are not reaching the database

**Solution:**
1. Verify MCP server is built: `npm run build:mcp`
2. Check backend logs for MCP connection errors
3. Verify `/api/mcp/tools/:toolName` endpoint is accessible
4. Check browser console for tool call errors

### Microphone Not Working

**Solution:**
- Check browser permissions
- Use HTTPS (required for microphone access)
- Restart the browser
- Check browser console for errors

---

## 📝 License

See [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions are welcome! Please ensure:

1. All database operations use MCP tools (no direct Prisma in frontend)
2. TypeScript types are correct
3. Console.log statements are removed (keep only error/warn logs)
4. README is updated for any architectural changes

---

## 📞 Support

For issues or questions, please open an issue on the GitHub repository.

---

**Built with ❤️ for Jordanian dental clinics**

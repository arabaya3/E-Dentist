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
- **User Management**: `find_user_by_phone`, `find_user_by_name`, `list_user_appointments`
- **Search & Validation**: `search_appointments`, `validate_voucher`
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

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/arabaya3/E-Dentist.git
cd E-Dentist_realtime
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the project root:

```ini
# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
REACT_APP_GEMINI_API_KEY=your_gemini_api_key_here

# Database Configuration
DATABASE_URL=mysql://user:password@localhost:3306/edentist

# Authentication & Security
EDENTIST_AUTH_CLIENT_ID=your_client_id
EDENTIST_AUTH_CLIENT_SECRET=your_client_secret
EDENTIST_JWT_SECRET=your_jwt_secret_here
EDENTIST_AES_PASSPHRASE=your_aes_passphrase
EDENTIST_AES_KEY=your_aes_key

# Analytics (Optional - disabled in development)
REACT_APP_ENABLE_ANALYTICS=false

# Server Configuration
PORT=5000
NODE_ENV=development
```

4. **Set up the database**

```bash
# Run migrations
npx prisma migrate deploy

# Seed the database with realistic Jordanian clinic data
npx prisma db seed
```

5. **Build the MCP server**

```bash
npm run build:mcp
```

6. **Start the development servers**

```bash
# Terminal 1: Start the backend server
npm run start:backend

# Terminal 2: Start the React frontend
npm start
```

7. **Open the application**

Navigate to `http://localhost:3000` in your browser.

---

## 📋 MCP Tools Reference

All database operations are exposed as MCP tools. The Gemini Live agent automatically calls these tools when needed.

### Appointment Tools

#### `create_appointment`

Creates a new appointment in the database.

**Parameters:**
- `doctorName` (string, required): Name of the doctor
- `clinicBranch` (string, required): Clinic location or branch
- `patientName` (string, required): Patient full name
- `patientPhone` (string, required): Patient contact number
- `serviceType` (string, required): Requested service (e.g., "Cleaning", "Whitening", "Composite Filling")
- `appointmentDate` (string, required): Date of the appointment (YYYY-MM-DD)
- `appointmentTime` (string, required): Time of the appointment (HH:MM)
- `status` (string, optional): Initial status (e.g., "confirmed", "pending")
- `notes` (string, optional): Additional notes
- `otp` (string, optional): Verification code if required

**Example:**
```json
{
  "doctorName": "Dr. Ahmad Al-Rousan",
  "clinicBranch": "Amman Dental Care – Abdoun",
  "patientName": "محمد أحمد",
  "patientPhone": "0791234567",
  "serviceType": "Cleaning",
  "appointmentDate": "2024-12-15",
  "appointmentTime": "10:00",
  "status": "confirmed"
}
```

#### `update_appointment`

Updates an existing appointment.

**Parameters:**
- `id` (number, required): Appointment ID
- `doctorName` (string, optional): Updated doctor name
- `clinicBranch` (string, optional): Updated clinic branch
- `patientName` (string, optional): Updated patient name
- `patientPhone` (string, optional): Updated patient phone
- `serviceType` (string, optional): Updated service type
- `appointmentDate` (string, optional): Updated date
- `appointmentTime` (string, optional): Updated time
- `status` (string, optional): Updated status
- `notes` (string, optional): Updated notes

#### `cancel_appointment`

Cancels an existing appointment.

**Parameters:**
- `id` (number, required): Appointment ID
- `patientName` (string, optional): Patient name for verification
- `patientPhone` (string, optional): Patient phone for verification
- `otp` (string, optional): OTP for verification

### Lookup Tools

#### `list_clinics`

Returns a list of all clinics in the database.

**Parameters:** None

#### `list_doctors`

Returns a list of all doctors, optionally filtered by clinic.

**Parameters:**
- `clinicName` (string, optional): Filter by clinic name
- `includeClinic` (boolean, optional): Include clinic details in response

#### `find_user_by_phone`

Finds a user by phone number.

**Parameters:**
- `phone` (string, required): Phone number to search for

#### `find_user_by_name`

Finds users by name (supports partial matches).

**Parameters:**
- `name` (string, required): Name to search for

#### `list_user_appointments`

Lists all appointments for a specific user.

**Parameters:**
- `phone` (string, optional): User phone number
- `name` (string, optional): User name
- `status` (string, optional): Filter by appointment status

#### `search_appointments`

Searches appointments with various filters.

**Parameters:**
- `doctorName` (string, optional): Filter by doctor name
- `clinicBranch` (string, optional): Filter by clinic branch
- `patientPhone` (string, optional): Filter by patient phone
- `serviceType` (string, optional): Filter by service type
- `status` (string, optional): Filter by status
- `dateFrom` (string, optional): Start date (YYYY-MM-DD)
- `dateTo` (string, optional): End date (YYYY-MM-DD)

### Utility Tools

#### `validate_voucher`

Validates a voucher code.

**Parameters:**
- `code` (string, required): Voucher code to validate

#### `log_voice_call`

Logs a voice call interaction for analytics.

**Parameters:**
- `intent` (string, required): Detected intent
- `confidence` (number, required): Confidence score (0-1)
- `duration` (number, optional): Call duration in seconds
- `collectedData` (object, optional): Additional data collected during the call

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

**User (Arabic):** "أريد حجز موعد للتنظيف مع د. أحمد الروسان يوم السبت الساعة 10 صباحاً"

**Agent:** The agent will:
1. Call `list_doctors` to verify doctor availability
2. Call `list_clinics` to find the clinic
3. Call `create_appointment` with the details
4. Confirm the appointment in Arabic

### Search Appointments

**User:** "Show me all appointments for next week"

**Agent:** Calls `search_appointments` with date filters and presents the results.

### Cancel Appointment

**User:** "I want to cancel my appointment"

**Agent:** 
1. Calls `list_user_appointments` to find user's appointments
2. Calls `cancel_appointment` with verification
3. Confirms cancellation

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

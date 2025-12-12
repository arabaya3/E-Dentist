require("dotenv-flow").config();
const { db } = require("./db.ts");

// Enable TS Runtime
if (!process.env.TS_NODE_REGISTERED) {
  require("ts-node").register({
    transpileOnly: true,
    compilerOptions: {
      module: "commonjs",
      moduleResolution: "node",
      esModuleInterop: true,
    },
  });
  process.env.TS_NODE_REGISTERED = "true";
}

// Core modules
const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");

// Backend logic
const analyticsEngine = require("./analytics-engine");
const { pmsIntegration, IntegrationError } = require("./pmsIntegration");
const { issueJWT, verifyJWT, requireScope } = require("./auth.ts");
const { systemMetrics } = require("./systemMetrics.ts");
const { recordAuditEvent } = require("./audit-logger.ts");

const {
  getActiveAgentProfile,   // 👈 ضيفها هون
} = require("./dbBookingIntegration.ts");

function getOtpBaseUrl() {
  const base =
    process.env.AGENT_API_BASE_URL ||
    process.env.OTP_API_BASE_URL ||
    process.env.AUTH_STAGE_URL;
  if (!base) {
    throw new Error(
      "AGENT_API_BASE_URL (or OTP_API_BASE_URL / AUTH_STAGE_URL) is not configured for OTP requests"
    );
  }
  return base.replace(/\/$/, "");
}

async function callOtpApi(path, payload) {
  const baseUrl = getOtpBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    const error = new Error(
      (body && typeof body === "object" && body.message) || response.statusText
    );
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}


// Initialize app
const app = express();
app.use(express.json());

// CORS
app.use(
  cors({
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// =============================
//  Agent Config (React uses this)
// =============================
// =============================
//  Agent Config (React uses this)
// =============================


// =============================
//  Agent Config (React uses this)
// =============================
app.get("/api/agent/config", async (req, res) => {
  try {
    const profile = await getActiveAgentProfile();

    if (!profile) {
      return res.status(404).json({
        status: "error",
        message: "No active agent",
      });
    }

    return res.json({
      status: "success",
      config: profile,
    });
  } catch (err) {
    console.error("Agent Config Error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
});

app.post("/api/auth/send-otp", async (req, res) => {
  try {
    const phoneNumber = req.body?.phoneNumber;
    if (!phoneNumber || typeof phoneNumber !== "string") {
      return res
        .status(400)
        .json({ status: "error", message: "phoneNumber is required" });
    }
    const result = await callOtpApi("/agent/auth/send-otp", {
      phoneNumber,
    });
    return res.json(result);
  } catch (error) {
    const status = error?.status ?? 500;
    return res.status(status).json({
      status: "error",
      message: error?.message || "Failed to send OTP",
      details: error?.body ?? null,
    });
  }
});

app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const userId = req.body?.userId;
    const code = req.body?.code;
    if (!userId || Number.isNaN(Number(userId))) {
      return res
        .status(400)
        .json({ status: "error", message: "userId is required to verify OTP" });
    }
    if (!code || typeof code !== "string") {
      return res
        .status(400)
        .json({ status: "error", message: "OTP code is required" });
    }

    const result = await callOtpApi("/agent/auth/verify-otp", {
      userId: Number(userId),
      code: code.trim(),
    });

    const token = issueJWT({
      sub: String(result?.user?.id ?? userId),
      role: "patient",
      scope: ["voice:client"],
    });

    return res.json({ ...result, token });
  } catch (error) {
    const status = error?.status ?? 500;
    return res.status(status).json({
      status: "error",
      message: error?.message || "Invalid verification code.",
      details: error?.body ?? null,
    });
  }
});


// =============================
//  DB CHECK
// =============================
app.get("/api/db-check", async (req, res) => {
  try {
    const result = await db.$queryRaw`SELECT 1 + 1 AS sum`;
    res.json({ status: "ok", result });
  } catch (e) {
    res.status(500).json({ status: "error", error: e.message });
  }
});

// =============================
//  WebSocket Server
// =============================
const server = require("http").createServer(app);

const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (socket) => {
  console.log("Client connected to /ws");
  socket.send("WebSocket OK");
});

// =============================
//  START SERVER
// =============================
const PORT = process.env.PORT || 5000;

server.listen(PORT, () =>
  console.log(`💚 E-Dentist Backend running at http://localhost:${PORT}`)
);

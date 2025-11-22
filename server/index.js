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
  createBookingViaDB,
  updateBookingViaDB,
  cancelBookingViaDB,
  getAvailableDoctors,
  getActiveAgentProfile,   // 👈 ضيفها هون
} = require("./dbBookingIntegration.ts");



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
//  Doctors
// =============================
app.get("/api/db/doctors", async (req, res) => {
  try {
    const doctors = await getAvailableDoctors();
    res.json({ success: true, doctors });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================
//  Booking API
// =============================
app.post("/api/db/book", async (req, res) => {
  try {
    const result = await createBookingViaDB(req.body);
    res.json(result);
  } catch (err) {
    console.error("Book error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/db/book/:id", async (req, res) => {
  try {
    const result = await updateBookingViaDB(Number(req.params.id), req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/db/book/:id", async (req, res) => {
  try {
    const result = await cancelBookingViaDB(Number(req.params.id), req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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



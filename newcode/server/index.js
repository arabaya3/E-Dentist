require("dotenv-flow").config();
const fs = require("fs");
const path = require("path");
const wav = require("wav");
const crypto = require("crypto");

// Enable TS Runtime (مرة واحدة فقط)
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

// Import backend modules (مرة واحدة فقط)
const { db } = require("./db.ts");
const { pmsIntegration, IntegrationError } = require("./pmsIntegration");
const { issueJWT, verifyJWT, requireScope } = require("./auth.ts");
const { systemMetrics } = require("./systemMetrics.ts");
const { recordAuditEvent } = require("./audit-logger.ts");
const { getActiveAgentProfile } = require("./dbBookingIntegration.ts");

// Core modules
const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");

// Custom logic
const analyticsEngine = require("./analytics-engine");

// Initialize express app
const app = express();
app.use(express.json());

const recordingsRoot = path.join(__dirname, "data", "recordings");
if (!fs.existsSync(recordingsRoot)) {
  fs.mkdirSync(recordingsRoot, { recursive: true });
}

// recordingId -> { user: Buffer[], agent: Buffer[], metadata, startedAt }
const activeRecordings = new Map();

async function writeWavFromPcm(bufferList, filePath) {
  return new Promise((resolve, reject) => {
    if (!bufferList.length) {
      return resolve();
    }

    const writer = new wav.Writer({
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
    });

    const outStream = fs.createWriteStream(filePath);

    writer.on("finish", resolve);
    writer.on("error", reject);
    outStream.on("error", reject);

    writer.pipe(outStream);

    for (const buf of bufferList) {
      writer.write(buf);
    }

    writer.end();
  });
}


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

app.post("/api/voice-recording/start", async (req, res) => {
  try {
    const { metadata } = req.body || {};

    const recordingId = crypto.randomUUID();

    activeRecordings.set(recordingId, {
      user: [],
      agent: [],
      metadata: metadata || {},
      startedAt: new Date(),
    });

    return res.json({ status: "ok", recordingId });
  } catch (err) {
    console.error("start recording error", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to start recording",
    });
  }
});

app.post("/api/voice-recording/chunk", (req, res) => {
  try {
    const { recordingId, source, base64 } = req.body || {};

    if (!recordingId || !source || !base64) {
      return res.status(400).json({
        status: "error",
        message: "recordingId, source and base64 are required",
      });
    }

    const rec = activeRecordings.get(recordingId);
    if (!rec) {
      return res.status(404).json({
        status: "error",
        message: "Unknown recordingId",
      });
    }

    if (!["user", "agent"].includes(source)) {
      return res.status(400).json({
        status: "error",
        message: "source must be 'user' or 'agent'",
      });
    }

    const buf = Buffer.from(base64, "base64");
    rec[source].push(buf);

    return res.json({ status: "ok" });
  } catch (err) {
    console.error("chunk error", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to append chunk",
    });
  }
});
app.post("/api/voice-recording/stop", async (req, res) => {
  try {
    const { recordingId } = req.body || {};
    if (!recordingId) {
      return res.status(400).json({
        status: "error",
        message: "recordingId is required",
      });
    }

    const rec = activeRecordings.get(recordingId);
    if (!rec) {
      return res.status(404).json({
        status: "error",
        message: "Unknown recordingId",
      });
    }

    activeRecordings.delete(recordingId);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const userPath = path.join(
      recordingsRoot,
      `${timestamp}_${recordingId}_user.wav`
    );
    const agentPath = path.join(
      recordingsRoot,
      `${timestamp}_${recordingId}_agent.wav`
    );

    if (rec.user.length) {
      await writeWavFromPcm(rec.user, userPath);
    }

    if (rec.agent.length) {
      await writeWavFromPcm(rec.agent, agentPath);
    }

    const recording = await db.callRecording.create({
      data: {
        recordingId,
        userAudioPath: rec.user.length ? userPath : null,
        agentAudioPath: rec.agent.length ? agentPath : null,
      },
    });

    return res.json({ status: "ok", recording });
  } catch (err) {
    console.error("stop recording error", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to stop recording",
    });
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
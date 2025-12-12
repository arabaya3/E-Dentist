import { promises as fs } from "fs";
import path from "path";
import {
  encryptJSON,
  decryptJSON,
  sanitizeObject,
  sanitizeSensitiveText,
} from "./security";

const AUDIT_DIR = path.resolve(__dirname, "data");
const AUDIT_FILE = path.join(AUDIT_DIR, "audit-log.ndjson");

export type AuditEvent = {
  action: string;
  actor?: {
    id?: string;
    role?: string;
    scope?: string[];
    ip?: string;
    userAgent?: string;
  };
  target?: {
    type?: string;
    id?: string;
    name?: string;
  };
  status: "success" | "failure" | "pending";
  description?: string;
  metadata?: Record<string, unknown>;
};

function sanitizeAuditEvent(event: AuditEvent) {
  return sanitizeObject({
    ...event,
    description: event.description
      ? sanitizeSensitiveText(event.description)
      : undefined,
    metadata: event.metadata ? sanitizeObject(event.metadata) : undefined,
  });
}

export async function recordAuditEvent(event: AuditEvent) {
  const record = {
    ...sanitizeAuditEvent(event),
    recordedAt: new Date().toISOString(),
    schema: "audit.log.v1",
  };

  const encrypted = encryptJSON(record, "audit.log.v1");
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  await fs.appendFile(AUDIT_FILE, JSON.stringify(encrypted) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function exportDecryptedAuditEvents<T = AuditEvent>() {
  try {
    const raw = await fs.readFile(AUDIT_FILE, { encoding: "utf8" });
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.map((line) => {
      const payload = JSON.parse(line);
      const decrypted = decryptJSON<T>(payload);
      return sanitizeObject(decrypted);
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}


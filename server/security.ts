import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { promises as fs } from "fs";
import path from "path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const STORAGE_DIR = path.resolve(__dirname, "data");

function getEncryptionKey() {
  const secret = process.env.EDENTIST_AES_PASSPHRASE;
  const key = process.env.EDENTIST_AES_KEY;
  if (key && key.length === 64) {
    return Buffer.from(key, "hex");
  }
  if (!secret) {
    throw new Error(
      "Encryption key missing: set EDENTIST_AES_KEY (hex) or EDENTIST_AES_PASSPHRASE"
    );
  }
  return scryptSync(secret, "ed-hc-salt", 32);
}

export type EncryptedPayload = {
  iv: string;
  authTag: string;
  ciphertext: string;
  createdAt: string;
  schema?: string;
};

export function encryptJSON<T>(data: T, schema?: string): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const serialized = Buffer.from(JSON.stringify(data), "utf8");
  const encrypted = Buffer.concat([cipher.update(serialized), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
    createdAt: new Date().toISOString(),
    schema,
  };
}

export function decryptJSON<T>(payload: EncryptedPayload): T {
  const key = getEncryptionKey();
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

export async function persistEncryptedJSON<T>(
  filename: string,
  payload: T,
  schema?: string
) {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const encrypted = encryptJSON(payload, schema);
  const target = path.join(STORAGE_DIR, filename);
  await fs.writeFile(target, JSON.stringify(encrypted, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  return target;
}

export async function readEncryptedJSON<T>(filename: string) {
  const target = path.join(STORAGE_DIR, filename);
  const raw = await fs.readFile(target, { encoding: "utf8" });
  const payload = JSON.parse(raw) as EncryptedPayload;
  return decryptJSON<T>(payload);
}

export function sanitizeSensitiveText(input: string) {
  let sanitized = input;
  sanitized = sanitized.replace(
    /([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/gi,
    "***@***"
  );
  sanitized = sanitized.replace(/\b(\+?\d[\d\s().-]{7,})\b/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 7) {
      return match;
    }
    const visible = digits.slice(-2);
    return `***-***-${visible}`;
  });
  sanitized = sanitized.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "****-****-****-****");
  sanitized = sanitized.replace(/(['"`])[\s;]*--|(['"`])\s*or\s+1=1/gi, "$1");
  return sanitized;
}

export function sanitizeObject<T extends Record<string, unknown> | Array<unknown>>(
  value: T
): T {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") {
        return sanitizeSensitiveText(item);
      }
      if (item && typeof item === "object") {
        return sanitizeObject(item as Record<string, unknown>);
      }
      return item;
    }) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, val]) => {
    if (typeof val === "string") {
      result[key] = sanitizeSensitiveText(val);
    } else if (val && typeof val === "object") {
      result[key] = sanitizeObject(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  });
  return result as T;
}


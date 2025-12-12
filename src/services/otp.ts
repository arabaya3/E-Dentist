import { setAuthToken } from "./auth";

const OTP_USER_KEY = "ed-otp-user-id";
const OTP_PHONE_KEY = "ed-otp-phone";

const setSessionValue = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[otp] Failed to persist ${key}`, error);
  }
};

const getSessionValue = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch (error) {
    console.warn(`[otp] Failed to read ${key}`, error);
    return null;
  }
};

export const setPendingOtpUserId = (userId: number | string) => {
  setSessionValue(OTP_USER_KEY, String(userId));
};

export const getPendingOtpUserId = (): number | null => {
  const stored = getSessionValue(OTP_USER_KEY);
  if (!stored) return null;
  const parsed = Number.parseInt(stored, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const setPendingPhoneNumber = (phoneNumber: string) => {
  if (!phoneNumber) return;
  setSessionValue(OTP_PHONE_KEY, phoneNumber);
};

export const getPendingPhoneNumber = () => getSessionValue(OTP_PHONE_KEY);

const parseJsonSafe = async (response: Response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export async function sendOtp(phoneNumber: string) {
  const trimmed = phoneNumber?.trim();
  if (!trimmed) {
    throw new Error("Phone number is required to send an OTP.");
  }

  const response = await fetch("https://edentist-be-stage-576483531725.europe-west1.run.app/api/v1/agent/auth/send-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ phoneNumber: trimmed }),
  });
  

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const message =
      (payload as any)?.message ||
      (typeof payload === "string" ? payload : "Failed to send OTP.");
    throw new Error(message);
  }

  if (
    payload &&
    typeof payload === "object" &&
    "userId" in payload &&
    payload.userId
  ) {
    setPendingOtpUserId((payload as any).userId);
  }
  setPendingPhoneNumber(trimmed);

  return payload;
}

export async function verifyOtp({
  userId,
  code,
}: {
  userId?: number | string | null;
  code: string;
}) {
  const resolvedUserId =
    typeof userId === "number" || typeof userId === "string"
      ? userId
      : getPendingOtpUserId();

  if (!resolvedUserId) {
    throw new Error("Missing userId. Please request an OTP first.");
  }

  const trimmedCode = code?.trim();
  if (!trimmedCode) {
    throw new Error("OTP code is required.");
  }

  const response = await fetch("https://edentist-be-stage-576483531725.europe-west1.run.app/api/v1/agent/auth/verify-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      userId: Number(resolvedUserId),
      code: trimmedCode,
    }),
  });
  

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const message =
      (payload as any)?.message ||
      (typeof payload === "string" ? payload : "Invalid verification code.");
    throw new Error(message);
  }

  if (
    payload &&
    typeof payload === "object" &&
    "token" in payload &&
    payload.token
  ) {
    setAuthToken((payload as any).token);
  }

  if (
    payload &&
    typeof payload === "object" &&
    "user" in payload &&
    payload.user &&
    typeof (payload as any).user === "object" &&
    "id" in (payload as any).user
  ) {
    setPendingOtpUserId((payload as any).user.id);
  }

  return payload;
}

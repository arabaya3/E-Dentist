let cachedToken: string | null = null;

const STORAGE_KEY = "ed-token";
const TOKEN_EVENT = "ed-auth-token-changed";

export function setAuthToken(token: string) {
  cachedToken = token;
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch (error) {
    console.warn("[auth] Failed to persist session token", error);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(TOKEN_EVENT, { detail: { token } })
    );
  }
}

export function getAuthToken() {
  if (cachedToken) {
    return cachedToken;
  }
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      cachedToken = stored;
      return cachedToken;
    }
  } catch (error) {
    console.warn("[auth] Failed to read session token", error);
  }
  return null;
}

export async function requestAuthToken({
  clientId,
  clientSecret,
  scope,
  subject,
}: {
  clientId: string;
  clientSecret: string;
  scope?: string[];
  subject?: string;
}) {
  const response = await fetch("/api/auth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      clientId,
      clientSecret,
      scope,
      sub: subject,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message || "Unable to issue auth token");
  }
  const payload = await response.json();
  if (payload?.access_token) {
    setAuthToken(payload.access_token);
  }
  return payload;
}


import { LiveClientOptions } from "./types";

const resolveEnv = (key: string, fallback?: string) => {
  const value = process.env[key];
  if (value && value.trim()) {
    return value.trim();
  }
  return fallback;
};

const rawApiKey =
  resolveEnv("REACT_APP_GEMINI_API_KEY") ??
  resolveEnv("GEMINI_API_KEY") ??
  "";

if (!rawApiKey) {
  throw new Error("GEMINI_API_KEY is missing. Add it to your .env file.");
}

const parseModel = (value?: string) => {
  const model = value && value.trim().length ? value.trim() : "gemini-2.5-audio";
  return model.startsWith("models/") ? model : `models/${model}`;
};

const rawModel =
  resolveEnv("REACT_APP_GEMINI_MODEL") ?? resolveEnv("MODEL") ?? undefined;

const requestedModel = parseModel(rawModel);

const liveModelOverride =
  resolveEnv("REACT_APP_LIVE_MODEL") ?? resolveEnv("LIVE_MODEL");

const desiredLiveModel = liveModelOverride
  ? parseModel(liveModelOverride)
  : requestedModel;

const LIVE_COMPATIBLE_MODELS = new Set<string>([
  "models/gemini-2.0-flash-exp",
  "models/gemini-2.0-flash-exp-image-generation",
]);

const LIVE_MODEL_FALLBACK = "models/gemini-2.0-flash-exp";

const liveModelIsSupported = LIVE_COMPATIBLE_MODELS.has(desiredLiveModel);
const resolvedLiveModel = liveModelIsSupported
  ? desiredLiveModel
  : LIVE_MODEL_FALLBACK;

if (!liveModelIsSupported && typeof console !== "undefined") {
  console.warn(
    `[Gemini] Model "${desiredLiveModel}" is not supported for live streaming. Falling back to "${resolvedLiveModel}".`
  );
}

const parseApiUrl = (value?: string) => {
  const fallback = "https://generativelanguage.googleapis.com/v1beta/models";
  const source = value && value.trim().length ? value.trim() : fallback;
  try {
    const parsed = new URL(source);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;
    const pathSegments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    const apiVersion = pathSegments.length ? pathSegments[0] : "";
    return { baseUrl, apiVersion };
  } catch {
    return { baseUrl: source, apiVersion: "" };
  }
};

const apiUrl = resolveEnv("REACT_APP_API_URL") ?? resolveEnv("API_URL");
const parsedApi = parseApiUrl(apiUrl);

export const GEMINI_REQUESTED_MODEL = requestedModel;
export const GEMINI_LIVE_MODEL = resolvedLiveModel;
export const GEMINI_LIVE_MODEL_SOURCE = liveModelIsSupported
  ? "configured"
  : "fallback";
export const GEMINI_PROJECT_ID =
  resolveEnv("REACT_APP_PROJECT_ID") ?? resolveEnv("PROJECT_ID") ?? "";
export const GEMINI_API_URL =
  resolveEnv("REACT_APP_API_URL") ??
  resolveEnv("API_URL") ??
  "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_API_BASE_URL = parsedApi.baseUrl;
export const GEMINI_API_VERSION = parsedApi.apiVersion;

const httpOptions =
  parsedApi.apiVersion.length > 0
    ? {
        baseUrl: parsedApi.baseUrl,
        apiVersion: parsedApi.apiVersion,
      }
    : {
        baseUrl: parsedApi.baseUrl,
      };

export const LIVE_CLIENT_OPTIONS: LiveClientOptions = {
  apiKey: rawApiKey,
  httpOptions,
};

export const GEMINI_TEXT_MODEL =
  resolveEnv("GEMINI_TEXT_MODEL") ??
  resolveEnv("REACT_APP_GEMINI_TEXT_MODEL") ??
  "models/gemini-2.0-flash-exp";

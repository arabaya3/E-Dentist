// =========================================================
// Imports
// =========================================================
// NOTE: This file now uses external API endpoints instead of Prisma
// All database operations should go through MCP tools or external APIs

// =========================================================
// API Configuration
// =========================================================
const API_BASE =
  process.env.EDENTIST_API_BASE_URL ||
  process.env.AGENT_API_BASE_URL ||
  "https://edentist-be-stage-576483531725.europe-west1.run.app/api/v1";

// =========================================================
// Helper: API Call
// =========================================================
async function apiGet(path) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  console.log(`[dbBookingIntegration] GET ${url}`);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API call failed: ${response.status} ${response.statusText} - ${text}`);
  }

  return response.json();
}

// =========================================================
// getActiveAgentProfile – يعيد بيانات الإيجنت الأساسي
// =========================================================
// This function now calls the external API instead of Prisma
async function getActiveAgentProfile() {
  try {
    // Try to get agent config from external API
    // If no specific endpoint exists, return a default config
    const agentConfig = await apiGet("/agent/config").catch(() => null);

    if (agentConfig && agentConfig.data) {
      return {
        name: agentConfig.data.agentName || agentConfig.data.name || "Default Agent",
        language: agentConfig.data.language || "ar",
        version: agentConfig.data.version || "1.0.0",
        welcomeMessage: agentConfig.data.welcomeMessage,
        initialGreetingMessage: agentConfig.data.initialGreetingMessage,
        color: agentConfig.data.color,
        avatar: agentConfig.data.agentAvatar || agentConfig.data.avatar,
        provider: agentConfig.data.provider,
      };
    }

    // Fallback: return default config if API doesn't return data
    return {
      name: "Default Agent",
      language: "ar",
      version: "1.0.0",
      welcomeMessage: "مرحباً بك في عيادة الأسنان",
      initialGreetingMessage: "كيف يمكنني مساعدتك اليوم؟",
      color: "#4A90E2",
      avatar: null,
      provider: "gemini",
    };
  } catch (error) {
    console.error("[dbBookingIntegration] Error fetching agent profile:", error);
    // Return default config on error
    return {
      name: "Default Agent",
      language: "ar",
      version: "1.0.0",
      welcomeMessage: "مرحباً بك في عيادة الأسنان",
      initialGreetingMessage: "كيف يمكنني مساعدتك اليوم؟",
      color: "#4A90E2",
      avatar: null,
      provider: "gemini",
    };
  }
}

// =========================================================
// Legacy Functions (Deprecated - Use MCP Tools Instead)
// =========================================================
// These functions are kept for backward compatibility but should not be used
// All database operations should go through MCP tools

async function createBookingViaDB(data) {
  throw new Error(
    "createBookingViaDB is deprecated. Use MCP tool 'create_appointment' instead."
  );
}

async function updateBookingViaDB(id, updates) {
  throw new Error(
    "updateBookingViaDB is deprecated. Use MCP tool 'update_appointment' instead."
  );
}

async function cancelBookingViaDB(id, data) {
  throw new Error(
    "cancelBookingViaDB is deprecated. Use MCP tool 'cancel_appointment' instead."
  );
}

async function getAvailableDoctors() {
  throw new Error(
    "getAvailableDoctors is deprecated. Use MCP tool 'list_doctors' instead."
  );
}

// =========================================================
// Exports
// =========================================================
module.exports = {
  createBookingViaDB,
  updateBookingViaDB,
  cancelBookingViaDB,
  getAvailableDoctors,
  getActiveAgentProfile,
};

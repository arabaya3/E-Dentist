import path from "path";
import { existsSync } from "fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let clientPromise: Promise<Client> | null = null;

async function initializeClient(): Promise<Client> {
  // Resolve path relative to project root (where package.json is)
  const projectRoot = path.resolve(__dirname, "..");
  const mcpServerPath = path.resolve(projectRoot, "mcp-server", "dist", "index.js");

  console.log(`[mcp-client] Initializing MCP client, server path: ${mcpServerPath}`);

  if (!existsSync(mcpServerPath)) {
    throw new Error(
      `MCP server not found at ${mcpServerPath}. Run 'npm run build:mcp' first.`
    );
  }

  // Use process.execPath (full path to node) for reliability across platforms
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpServerPath],
  });

  const client = new Client({
    name: "edentist-backend",
    version: "1.0.0",
  });

  try {
    console.log(`[mcp-client] Connecting to MCP server...`);
    await client.connect(transport);
    console.log(`[mcp-client] Successfully connected to MCP server`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    console.error(`[mcp-client] Connection failed:`, error);
    throw new Error(`Failed to connect to MCP server: ${message}`);
  }

  return client;
}

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = initializeClient();
  }
  return clientPromise;
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown> = {}
) {
  try {
    const client = await getClient();
    
    // Debug: Log what we're sending
    console.log(`[mcp-client] Calling tool ${name} with arguments:`, JSON.stringify(args, null, 2));
    
    const result = await client.callTool({
      name,
      arguments: args,
    });

    // MCP tools return { content: [{ type: "text", text: JSON.stringify(data) }] }
    // Return the full structure so the frontend can extract it
    if (
      result &&
      typeof result === "object" &&
      "content" in result &&
      Array.isArray(result.content)
    ) {
      return result;
    }

    // Fallback: wrap in MCP format if not already
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result ?? null),
        },
      ],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    console.error(`[mcp-client] Tool call failed for ${name}:`, message);
    throw new Error(`MCP tool '${name}' failed: ${message}`);
  }
}


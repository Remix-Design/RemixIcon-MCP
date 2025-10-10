import { startMcpServer } from "../interface/mcp/icon-keyword-server";

export async function runCli(): Promise<void> {
  try {
    await startMcpServer();
  } catch (error) {
    console.error("Failed to start MCP server", error);
    process.exit(1);
  }
}

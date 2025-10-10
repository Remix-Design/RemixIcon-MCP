import { startMcpServer } from "./interface/mcp/icon-keyword-server";

startMcpServer().catch((error) => {
  console.error("Failed to start MCP server", error);
  process.exit(1);
});

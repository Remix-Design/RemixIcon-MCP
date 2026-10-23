import type { McpServerFactory } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

export function startStdioServer(factory: McpServerFactory) {
  return serveStdio(factory, {
    onerror: (error) => console.error("MCP transport error", error),
  });
}

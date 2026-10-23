import { startHttpServer } from "../interface/http/node-http-server";
import { startStdioServer } from "../interface/mcp/stdio-server";
import { createIconMcpServer } from "./mcp-server";
import { getSearchIconsUseCase } from "./search-use-case";
import type { ServerOptions } from "./server-options";

export async function startServer(options: ServerOptions) {
  await getSearchIconsUseCase();
  const handle =
    options.transport === "http"
      ? await startHttpServer({
          ...options,
          createServer: createIconMcpServer,
          allowedHosts: allowedHosts(options.host),
        })
      : startStdioServer(createIconMcpServer);
  if (options.transport === "http") {
    const host = options.host.includes(":")
      ? `[${options.host}]`
      : options.host;
    console.error(
      `RemixIcon MCP listening at http://${host}:${options.port}/mcp`,
    );
  }
  registerShutdown(handle);
  return handle;
}

function allowedHosts(host: string): string[] | undefined {
  if (host === "0.0.0.0" || host === "::") return undefined;
  return [
    ...new Set([
      host.includes(":") ? `[${host}]` : host,
      "localhost",
      "127.0.0.1",
      "[::1]",
    ]),
  ];
}

function registerShutdown(handle: { close(): Promise<void> }): void {
  const shutdown = () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    void handle.close().catch((error) => {
      console.error("Failed to close MCP server", error);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

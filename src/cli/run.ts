import { parseServerOptions } from "../bootstrap/server-options";
import { startServer } from "../bootstrap/start-server";

const HELP = `Usage: remixicon-mcp [options]

  --transport stdio|http   Transport (default: stdio)
  --host <hostname>        HTTP bind address (default: 127.0.0.1)
  --port <1-65535>         HTTP port (default: 3000)
  -h, --help              Show this help

Environment: MCP_TRANSPORT, MCP_HOST, MCP_PORT, MCP_ALLOWED_ORIGINS
HTTP endpoint: /mcp; health check: /health
`;

export async function runCli(
  args = process.argv.slice(2),
  env = process.env,
): Promise<void> {
  try {
    const options = parseServerOptions(args, env);
    if (options.help) {
      console.log(HELP);
      return;
    }
    await startServer(options);
  } catch (error) {
    console.error("Failed to start MCP server", error);
    process.exitCode = 1;
  }
}

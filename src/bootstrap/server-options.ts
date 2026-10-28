import { isIP } from "node:net";
import { parseArgs } from "node:util";

export interface ServerOptions {
  readonly transport: "stdio" | "http";
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: string[];
  readonly help: boolean;
}

const DEFAULTS: ServerOptions = {
  transport: "stdio",
  host: "127.0.0.1",
  port: 3000,
  allowedOrigins: [],
  help: false,
};

export function parseServerOptions(
  args: string[],
  env: NodeJS.ProcessEnv = {},
): ServerOptions {
  const { values } = parseArgs({
    args,
    options: {
      transport: { type: "string" },
      host: { type: "string" },
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return { ...DEFAULTS, help: true };
  const transport = values.transport ?? env.MCP_TRANSPORT ?? DEFAULTS.transport;
  if (transport !== "stdio" && transport !== "http") {
    throw new Error("Transport must be stdio or http.");
  }
  return {
    transport,
    host: parseHost(values.host ?? env.MCP_HOST ?? DEFAULTS.host),
    port: parsePort(values.port ?? env.MCP_PORT ?? String(DEFAULTS.port)),
    allowedOrigins: parseOrigins(env.MCP_ALLOWED_ORIGINS),
    help: false,
  };
}

function parseHost(host: string): string {
  if (
    !host ||
    (!isIP(host) &&
      !/^(?=.{1,253}$)[a-z\d](?:[a-z\d.-]*[a-z\d])?$/iu.test(host))
  ) {
    throw new Error(
      "Host must be an IP address or hostname, without a scheme or path.",
    );
  }
  const canonical = new URL(`http://${isIP(host) === 6 ? `[${host}]` : host}`)
    .hostname;
  return canonical.startsWith("[") ? canonical.slice(1, -1) : canonical;
}

function parsePort(rawPort: string): number {
  const port = Number(rawPort);
  if (!/^\d+$/u.test(rawPort) || port < 1 || port > 65535) {
    throw new Error("Port must be an integer from 1 to 65535.");
  }
  return port;
}

function parseOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(",").map((entry) => {
    const origin = entry.trim();
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
      throw new Error(
        "MCP_ALLOWED_ORIGINS must contain exact HTTP(S) origins without paths.",
      );
    }
    return origin;
  });
}

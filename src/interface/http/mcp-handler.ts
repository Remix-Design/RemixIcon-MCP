import { createMcpHandler, type McpServer } from "@modelcontextprotocol/server";

export const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 16 * 1024;
const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, MCP-Method, MCP-Name, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Session-Id, MCP-Protocol-Version",
};

export interface HttpHandlerOptions {
  createServer: () => McpServer;
  allowedHosts?: string[];
  allowedOrigins?: string[];
}

export interface HttpHandler {
  (request: Request): Promise<Response>;
  close(): Promise<void>;
}

export function createHttpHandler(options: HttpHandlerOptions): HttpHandler {
  const mcp = createMcpHandler(options.createServer, {
    legacy: "stateless",
    responseMode: "auto",
    maxSubscriptions: 0,
    keepAliveMs: 0,
  });
  const handler: HttpHandler = async (request) => {
    const url = new URL(request.url);
    if (options.allowedHosts && !options.allowedHosts.includes(url.hostname)) {
      return errorResponse(403, "Host is not allowed.");
    }
    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin, url, options)) {
      return errorResponse(403, "Origin is not allowed.");
    }
    const response = await route(request, url, mcp.fetch);
    applyCors(request, response, origin);
    return response;
  };
  handler.close = mcp.close;
  return handler;
}

function applyCors(
  request: Request,
  response: Response,
  origin: string | null,
): void {
  response.headers.append("Vary", "Origin");
  if (request.method === "OPTIONS")
    response.headers.append("Vary", "Access-Control-Request-Headers");
  if (!origin) return;
  response.headers.set("Access-Control-Allow-Origin", origin);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(name, value);
  }
  const parameterHeaders = (
    request.headers.get("access-control-request-headers") ?? ""
  )
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => /^mcp-param-[!#$%&'*+\-.^_`|~0-9a-z]+$/.test(name));
  if (parameterHeaders.length) {
    response.headers.set(
      "Access-Control-Allow-Headers",
      [
        CORS_HEADERS["Access-Control-Allow-Headers"],
        ...new Set(parameterHeaders),
      ].join(", "),
    );
  }
}

function isAllowedOrigin(
  origin: string,
  url: URL,
  options: HttpHandlerOptions,
): boolean {
  if (origin === "null") return false;
  try {
    if (new URL(origin).origin !== origin) return false;
  } catch {
    return false;
  }
  return (
    origin === url.origin || Boolean(options.allowedOrigins?.includes(origin))
  );
}

async function route(
  request: Request,
  url: URL,
  fetchMcp: ReturnType<typeof createMcpHandler>["fetch"],
): Promise<Response> {
  if (url.pathname === "/health") {
    return request.method === "GET"
      ? Response.json({ status: "ok", transport: "streamable-http" })
      : methodNotAllowed("GET");
  }
  if (url.pathname !== MCP_PATH) return errorResponse(404, "Not found.");
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return methodNotAllowed("POST, OPTIONS");
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) {
    return errorResponse(413, "Request body exceeds 16 KiB.");
  }
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  ) {
    return errorResponse(415, "Content-Type must be application/json.");
  }
  try {
    const text = await readBody(request);
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(text);
    } catch {
      return errorResponse(400, "Invalid JSON.", -32700);
    }
    return await fetchMcp(request, { parsedBody });
  } catch (error) {
    return error instanceof BodyTooLargeError
      ? errorResponse(413, "Request body exceeds 16 KiB.")
      : errorResponse(400, "Unable to read request body.");
  }
}

class BodyTooLargeError extends Error {}

async function readBody(request: Request): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let length = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new BodyTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function methodNotAllowed(allow: string): Response {
  const response = errorResponse(405, "Method not allowed.");
  response.headers.set("Allow", allow);
  return response;
}

function errorResponse(
  status: number,
  message: string,
  code = -32600,
): Response {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code, message } },
    { status },
  );
}

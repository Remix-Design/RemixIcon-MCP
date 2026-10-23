import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterAll, describe, expect, it } from "vitest";
import type { Unstable_DevWorker } from "wrangler";
import { unstable_dev } from "wrangler";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

interface JsonRpcMessage {
  jsonrpc: string;
  id: number;
  method?: string;
  result?: unknown;
  error?: unknown;
}

async function mcpRequest(
  worker: Unstable_DevWorker,
  method: string,
  params?: Record<string, unknown>,
  sessionId?: string,
): Promise<{ messages: JsonRpcMessage[]; sessionId?: string }> {
  const headers = new Headers(MCP_HEADERS);
  if (sessionId) {
    headers.set("mcp-session-id", sessionId);
  }

  const res = await worker.fetch("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  const sid = res.headers.get("mcp-session-id") ?? sessionId;
  const text = await res.text();
  const messages = res.headers.get("content-type")?.includes("application/json")
    ? [JSON.parse(text)]
    : (text
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6))) as JsonRpcMessage[]);

  return { messages, sessionId: sid ?? undefined };
}

describe("Cloudflare Remote MCP Worker", () => {
  let worker: Unstable_DevWorker;

  afterAll(async () => {
    if (worker) {
      await worker.stop();
    }
  });

  it("serves the MCP endpoint over Streamable HTTP", async () => {
    worker = await unstable_dev("worker/src/index.ts", {
      config: "./wrangler.jsonc",
      experimental: { disableExperimentalWarning: true },
    });

    const init = await mcpRequest(worker, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });

    expect(init.messages).toHaveLength(1);
    const result = init.messages[0]?.result as {
      serverInfo?: { name?: string };
      capabilities?: { tools?: { listChanged?: boolean } };
    };
    expect(result.serverInfo?.name).toBe("remix-icon-keyword-server");
    expect(result.capabilities?.tools).toBeDefined();
  });

  it("serves health and rejects cross-origin requests", async () => {
    const health = await worker.fetch("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });
    const rejected = await worker.fetch("/mcp", {
      method: "POST",
      headers: { ...MCP_HEADERS, Origin: "https://attacker.example" },
      body: "{}",
    });
    expect(rejected.status).toBe(403);
    expect((await worker.fetch("/mcp")).status).toBe(405);
  });

  it("lists the search_icons tool", async () => {
    worker ??= await unstable_dev("worker/src/index.ts", {
      config: "./wrangler.jsonc",
      experimental: { disableExperimentalWarning: true },
    });

    const init = await mcpRequest(worker, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });

    const list = await mcpRequest(worker, "tools/list", {}, init.sessionId);
    const tools = list.messages[0]?.result as {
      tools?: Array<{ name: string }>;
    };
    expect(tools.tools?.some((t) => t.name === "search_icons")).toBe(true);
  }, 30000);

  it("calls search_icons and returns icon matches", async () => {
    worker ??= await unstable_dev("worker/src/index.ts", {
      config: "./wrangler.jsonc",
      experimental: { disableExperimentalWarning: true },
    });

    const init = await mcpRequest(worker, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });

    const call = await mcpRequest(
      worker,
      "tools/call",
      { name: "search_icons", arguments: { keywords: "home" } },
      init.sessionId,
    );

    const result = call.messages[0]?.result as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = result.content?.[0]?.text ?? "";
    expect(text.toLowerCase()).toContain("home");
  }, 30000);
  it("negotiates the modern protocol with the SDK client", async () => {
    const client = new Client(
      { name: "worker-modern-test", version: "1.0.0" },
      {
        versionNegotiation: { mode: "auto" },
      },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost/mcp"),
      {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          return worker.fetch(new URL(request.url).pathname, {
            method: request.method,
            headers: request.headers,
            body: request.body ? await request.text() : undefined,
          });
        },
      },
    );
    try {
      await client.connect(transport);
      expect(client.getProtocolEra()).toBe("modern");
      expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");
      expect(
        (await client.listTools()).tools.map((tool) => tool.name),
      ).toContain("search_icons");
      const result = await client.callTool({
        name: "search_icons",
        arguments: { keywords: "home" },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        matches: expect.arrayContaining([
          expect.objectContaining({ name: expect.stringContaining("home") }),
        ]),
      });
    } finally {
      await client.close();
    }
  });
});

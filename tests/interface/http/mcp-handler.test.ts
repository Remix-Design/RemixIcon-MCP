import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { createIconMcpServer } from "../../../src/bootstrap/mcp-server";
import { createHttpHandler } from "../../../src/interface/http/mcp-handler";

const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};
function request(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: { ...headers, ...extraHeaders },
    body: JSON.stringify(body),
  });
}
async function messages(response: Response) {
  const body = await response.text();
  return response.headers.get("content-type")?.includes("text/event-stream")
    ? body
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)))
    : [JSON.parse(body)];
}

describe("HTTP MCP handler", () => {
  it("supports a current SDK client through discovery, list, and search", async () => {
    const handler = createHttpHandler({ createServer: createIconMcpServer });
    const client = new Client(
      { name: "http-test", version: "1.0.0" },
      { versionNegotiation: { mode: "auto" } },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost/mcp"),
      {
        fetch: async (input, init) => handler(new Request(input, init)),
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
      await handler.close();
    }
  });

  it("supports legacy stateless initialize, notifications, list and concurrent calls", async () => {
    const handler = createHttpHandler({ createServer: createIconMcpServer });
    try {
      const response = await handler(
        request({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "legacy", version: "1" },
          },
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("mcp-session-id")).toBeNull();
      expect((await messages(response))[0].result.serverInfo.name).toBe(
        "remix-icon-keyword-server",
      );
      const initialized = await handler(
        request({ jsonrpc: "2.0", method: "notifications/initialized" }),
      );
      expect(initialized.status).toBe(202);
      const list = await messages(
        await handler(request({ jsonrpc: "2.0", id: 2, method: "tools/list" })),
      );
      expect(list[0].result.tools[0].name).toBe("search_icons");
      const results = await Promise.all(
        ["home", "sun", "car"].map(async (keywords, id) => {
          const response = await handler(
            request({
              jsonrpc: "2.0",
              id,
              method: "tools/call",
              params: { name: "search_icons", arguments: { keywords } },
            }),
          );
          return (await messages(response))[0];
        }),
      );
      expect(results.map((result) => result.id)).toEqual([0, 1, 2]);
      expect(results.every((result) => !result.result.isError)).toBe(true);
    } finally {
      await handler.close();
    }
  });

  it("routes health, missing paths and unsupported methods", async () => {
    const handler = createHttpHandler({ createServer: createIconMcpServer });
    expect(
      await (await handler(new Request("http://localhost/health"))).json(),
    ).toMatchObject({ status: "ok" });
    expect(
      (await handler(new Request("http://localhost/missing"))).status,
    ).toBe(404);
    for (const method of ["GET", "DELETE", "PUT"]) {
      const response = await handler(
        new Request("http://localhost/mcp", { method }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toContain("POST");
    }
    await handler.close();
  });

  it("validates hosts and rejects cross-origin browser requests by default", async () => {
    const handler = createHttpHandler({
      createServer: createIconMcpServer,
      allowedHosts: ["localhost"],
    });
    expect(
      (await handler(new Request("http://attacker.example/health"))).status,
    ).toBe(403);
    expect(
      (await handler(request({}, { Origin: "https://attacker.example" })))
        .status,
    ).toBe(403);
    expect((await handler(request({}, { Origin: "null" }))).status).toBe(403);
    const sameOrigin = await handler(
      new Request("http://localhost/mcp", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,mcp-protocol-version",
        },
      }),
    );
    expect(sameOrigin.status).toBe(204);
    expect(sameOrigin.headers.get("access-control-allow-origin")).toBe(
      "http://localhost",
    );
    await handler.close();
  });

  it("allows configured browser origins and exposes required MCP headers", async () => {
    const handler = createHttpHandler({
      createServer: createIconMcpServer,
      allowedOrigins: ["https://client.example"],
    });
    const response = await handler(
      new Request("http://localhost/mcp", {
        method: "OPTIONS",
        headers: {
          Origin: "https://client.example",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "content-type,mcp-protocol-version,mcp-method,mcp-name,mcp-param-keywords,x-unrelated",
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://client.example",
    );
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "MCP-Protocol-Version",
    );
    const allowedHeaders = response.headers
      .get("access-control-allow-headers")
      ?.toLowerCase();
    expect(allowedHeaders).toContain("mcp-method");
    expect(allowedHeaders).toContain("mcp-name");
    expect(allowedHeaders).toContain("mcp-param-keywords");
    expect(allowedHeaders).not.toContain("x-unrelated");
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "MCP-Session-Id",
    );
    await handler.close();
  });

  it("rejects malformed JSON and oversized bodies even without Content-Length", async () => {
    const handler = createHttpHandler({ createServer: createIconMcpServer });
    const malformed = await handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers,
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe(-32700);
    const oversized = await handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers,
        body: "x".repeat(16385),
      }),
    );
    expect(oversized.status).toBe(413);
    await handler.close();
  });
  it("enforces streamed byte limits and rejects non-JSON media types", async () => {
    const handler = createHttpHandler({ createServer: createIconMcpServer });
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(8193));
      },
      cancel() {
        cancelled = true;
      },
    });
    const init: RequestInit & { duplex: string } = {
      method: "POST",
      headers,
      body,
      duplex: "half",
    };
    const response = await handler(new Request("http://localhost/mcp", init));
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    const invalidType = await handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json-invalid" },
        body: "{}",
      }),
    );
    expect(invalidType.status).toBe(415);
    await handler.close();
  });
});

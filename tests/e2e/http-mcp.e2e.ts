import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { version } from "../../package.json";

const target = process.env.MCP_E2E_URL;
if (!target)
  throw new Error("Set MCP_E2E_URL to the HTTP MCP endpoint to test.");
const endpoint = new URL(target);
const outputSchema = z.object({
  guidance: z.string(),
  matches: z
    .array(
      z.object({
        name: z.string().min(1),
        score: z.number().nonnegative(),
        category: z.string().min(1),
        style: z.enum(["line", "fill"]),
        matchedKeywords: z.array(z.string()),
      }),
    )
    .max(5),
});

async function connectClient(mode: "auto" | "legacy") {
  const client = new Client(
    { name: `docker-e2e-${mode}`, version: "1" },
    { versionNegotiation: { mode } },
  );
  try {
    await client.connect(
      new StreamableHTTPClientTransport(endpoint, {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([
              AbortSignal.timeout(10000),
              ...(init?.signal ? [init.signal] : []),
            ]),
          }),
      }),
    );
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}

async function search(client: Client, keywords: string) {
  const result = await client.callTool({
    name: "search_icons",
    arguments: { keywords },
  });
  expect(result.isError).not.toBe(true);
  expect(result.content).toEqual([{ type: "text", text: expect.any(String) }]);
  return outputSchema.parse(result.structuredContent);
}

function expectRelevant(output: z.infer<typeof outputSchema>, keyword: string) {
  expect(output.matches.length).toBeGreaterThan(0);
  expect(
    output.matches.some(({ matchedKeywords }) =>
      matchedKeywords.includes(keyword),
    ),
  ).toBe(true);
}

function http(path: string, init: RequestInit = {}) {
  return fetch(new URL(path, endpoint), {
    ...init,
    signal: AbortSignal.timeout(10000),
  });
}

describe("deployed HTTP MCP from an independent client", () => {
  let client: Client;
  beforeAll(async () => {
    if (process.env.MCP_E2E_DOCKER === "1")
      expect(process.platform).toBe("linux");
    console.info(
      JSON.stringify({
        target: endpoint.href,
        platform: process.platform,
        arch: process.arch,
        node: process.version,
      }),
    );
    client = await connectClient("auto");
  });
  afterAll(async () => {
    await client?.close();
  });

  it("negotiates the current protocol and discovers the read-only search tool", async () => {
    expect(client.getProtocolEra()).toBe("modern");
    expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");
    expect(client.getServerVersion()).toMatchObject({
      name: "remix-icon-keyword-server",
      version,
    });
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: "search_icons",
      annotations: { readOnlyHint: true, destructiveHint: false },
      inputSchema: { required: ["keywords"] },
    });
    expect(tools[0]?.outputSchema).toBeDefined();
  });

  it("returns ranked icon metadata for a single keyword", async () => {
    const output = await search(client, "home");
    expectRelevant(output, "home");
    expect(output.matches.some(({ name }) => name.includes("home"))).toBe(true);
    expect(output.matches.map(({ score }) => score)).toEqual(
      output.matches.map(({ score }) => score).sort((a, b) => b - a),
    );
  });

  it("searches comma-separated keywords", async () => {
    const output = await search(client, "sun, beach");
    expect(output.matches.length).toBeGreaterThan(0);
    expect(
      output.matches.some(({ matchedKeywords }) =>
        matchedKeywords.some((keyword) => ["sun", "beach"].includes(keyword)),
      ),
    ).toBe(true);
  });

  it("returns empty matches with guidance when nothing matches", async () => {
    const output = await search(client, "zzzxqvnotaniconzzzxqv");
    expect(output.matches).toEqual([]);
    expect(output.guidance).toContain("No icons matched");
  });

  it("rejects invalid input and recovers on the same client", async () => {
    for (const keywords of [" ", "please show me an icon"]) {
      const result = await client.callTool({
        name: "search_icons",
        arguments: { keywords },
      });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: "text", text: expect.stringContaining("Keyword") },
      ]);
    }
    expectRelevant(await search(client, "sun"), "sun");
  });

  it("supports legacy protocol negotiation, discovery and search", async () => {
    const legacy = await connectClient("legacy");
    try {
      expect(legacy.getProtocolEra()).toBe("legacy");
      expect(legacy.getNegotiatedProtocolVersion()).toBe("2025-11-25");
      expect((await legacy.listTools()).tools[0]?.name).toBe("search_icons");
      expectRelevant(await search(legacy, "home"), "home");
    } finally {
      await legacy.close();
    }
  });

  it("keeps concurrent requests on one client associated with their keywords", async () => {
    await Promise.all(
      ["home", "sun", "car"].map(async (keyword) => {
        expectRelevant(await search(client, keyword), keyword);
      }),
    );
  });

  it("isolates independent clients and survives one client closing", async () => {
    const other = await connectClient("legacy");
    try {
      await Promise.all([
        search(client, "home").then((output) => expectRelevant(output, "home")),
        search(other, "car").then((output) => expectRelevant(output, "car")),
      ]);
    } finally {
      await other.close();
    }
    expectRelevant(await search(client, "sun"), "sun");
  });

  it("serves health and enforces HTTP method, JSON, body and Origin rules", async () => {
    const health = await http("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });
    const browser = await http("/mcp");
    expect(browser.status).toBe(405);
    expect(browser.headers.get("allow")).toContain("POST");
    const invalid = await http("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe(-32700);
    const oversized = await http("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(16385),
    });
    expect(oversized.status).toBe(413);
    const untrusted = await http("/mcp", {
      method: "POST",
      headers: {
        Origin: "https://untrusted.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(untrusted.status).toBe(403);
  });
});

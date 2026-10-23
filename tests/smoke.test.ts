import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";
import { version } from "../package.json";
import { createIconMcpServer } from "../src/bootstrap/mcp-server";

describe("MCP server contract", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((close) => close()));
  });

  async function connect() {
    const server = createIconMcpServer();
    const client = new Client({ name: "contract-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    cleanup.push(
      () => client.close(),
      () => server.close(),
    );
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return client;
  }

  it("exposes the package version, read-only tool and output schema", async () => {
    const client = await connect();
    expect(client.getServerVersion()?.version).toBe(version);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: "search_icons",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(tools[0]?.outputSchema).toBeDefined();
  });

  it("returns ranked metadata and human-readable results", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "search_icons",
      arguments: { keywords: "home" },
    });
    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: expect.stringContaining("home") },
    ]);
    expect(result.structuredContent).toMatchObject({
      matches: expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          score: expect.any(Number),
          category: expect.any(String),
          style: expect.any(String),
          matchedKeywords: expect.any(Array),
        }),
      ]),
    });
  });

  it.each(["", " ", "x".repeat(201), "please show me an icon"])(
    "rejects invalid keywords: %j",
    async (keywords) => {
      const client = await connect();
      const result = await client.callTool({
        name: "search_icons",
        arguments: { keywords },
      });
      expect(result.isError).toBe(true);
    },
  );

  it("returns helpful guidance for no matches", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "search_icons",
      arguments: { keywords: "zzzxxyyqqq" },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      matches: [],
      guidance: expect.stringContaining("No icons matched"),
    });
  });
});

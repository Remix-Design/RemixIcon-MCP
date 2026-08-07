import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getSearchIconsUseCase } from "../src/bootstrap/search-use-case";

describe("MCP Server Smoke Test", () => {
  it("should connect, list tools, and call search_icons", async () => {
    // 1. Setup Server
    const server = new McpServer({
      name: "test-server",
      version: "1.0.0",
    });

    const useCase = await getSearchIconsUseCase();
    const keywordsSchema = z.string().min(1).max(200);

    server.registerTool(
      "search_icons",
      {
        title: "Search Remix Icons by keyword",
        description: "Search icons",
        inputSchema: {
          keywords: keywordsSchema.describe("Keywords"),
        },
      },
      async (rawInput) => {
        const { keywords } = z
          .object({ keywords: keywordsSchema })
          .parse(rawInput);
        const result = await useCase.execute({ input: keywords });
        return {
          content: [
            {
              type: "text",
              text: result.matches.map((m) => m.icon.name).join(", "),
            },
          ],
        };
      },
    );

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    // 2. Setup Client
    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    // 3. Connect them
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    // 4. Verify tools
    const tools = await client.listTools();
    expect(tools.tools.some((t) => t.name === "search_icons")).toBe(true);

    // 5. Call the tool
    const result = await client.callTool({
      name: "search_icons",
      arguments: { keywords: "home" },
    });

    expect(result.content[0].type).toBe("text");
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toBeTruthy();
      // Should contain some home-related icons
      expect(result.content[0].text.toLowerCase()).toContain("home");
    }

    await client.close();
  });
});

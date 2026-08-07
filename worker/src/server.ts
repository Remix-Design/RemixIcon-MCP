import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { SearchIconsResponse } from "../../src/application/use-cases/search-icons.usecase";
import { getSearchIconsUseCase } from "../../src/bootstrap/search-use-case";

const TOOL_NAME = "search_icons";

const keywordsSchema = z
  .string()
  .min(1, "Provide at least one keyword.")
  .max(200, "Input must stay concise and keyword-only.");

const inputValidationSchema = z.object({
  keywords: keywordsSchema,
});

// The FlexSearch index is built once per isolate and shared across requests.
// A search is a pure read of the index, so a single cached instance is safe.
let useCasePromise: ReturnType<typeof getSearchIconsUseCase> | null = null;

function getUseCase(): ReturnType<typeof getSearchIconsUseCase> {
  useCasePromise ??= getSearchIconsUseCase();
  return useCasePromise;
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "remix-icon-keyword-server",
    version: "0.3.0",
  });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Search Remix Icons by keyword",
      description:
        "Search Remix Icon metadata using comma-separated keywords (up to 20 keywords). Returns top 5 most relevant icons. Supports both single keywords and keyword lists. Avoid natural language sentences. Returns format: 'icon-name (score)'. Example: 'sun-fill (46.00)'.",
      inputSchema: {
        keywords: keywordsSchema.describe(
          "Comma-separated keywords to search for icons (e.g., 'summer, sun, beach')",
        ),
      },
    },
    async (rawInput) => {
      try {
        const { keywords } = inputValidationSchema.parse(rawInput ?? {});
        const useCase = await getUseCase();
        const result = await useCase.execute({ input: keywords });
        return buildToolResponse(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Keyword search failed: ${message}`,
            },
          ],
        };
      }
    },
  );

  return server;
}

function buildToolResponse(result: SearchIconsResponse) {
  const lines: string[] = [];

  if (result.guidance) {
    lines.push(result.guidance);
  }

  if (result.matches.length > 1) {
    for (const match of result.matches) {
      lines.push(`${match.icon.name} (${match.score.toFixed(2)})`);
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: lines.join("\n"),
      },
    ],
    structuredContent: {
      guidance: result.guidance,
      matches: result.matches.map((match) => ({
        name: match.icon.name,
      })),
    },
  };
}

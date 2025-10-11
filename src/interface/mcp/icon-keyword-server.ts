import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { z } from "zod";
import type { SearchIconsResponse } from "../../application/use-cases/search-icons.usecase";
import { getSearchIconsUseCase } from "../../bootstrap/search-use-case";

const TOOL_NAME = "search_icons";

// Define input validation schema once
const keywordsSchema = z
  .string()
  .min(1, "Provide at least one keyword.")
  .max(200, "Input must stay concise and keyword-only.");

const inputValidationSchema = z.object({
  keywords: keywordsSchema,
});

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "remix-icon-keyword-server",
    version: "0.3.0",
  });

  const useCase = await getSearchIconsUseCase();

  server.registerTool(
    TOOL_NAME,
    {
      title: "Search Remix Icons by keyword",
      description:
        "Search Remix Icon metadata using comma-separated keywords (up to 20 keywords). Returns top 5 most relevant icons. Supports both single keywords and keyword lists. Avoid natural language sentences.",
      inputSchema: {
        keywords: keywordsSchema.describe(
          "Comma-separated keywords to search for icons (e.g., 'summer, sun, beach')",
        ),
      },
    },
    async (rawInput) => {
      try {
        const { keywords } = inputValidationSchema.parse(rawInput ?? {});
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function buildToolResponse(result: SearchIconsResponse) {
  const lines: string[] = [];

  // Add guidance if present (for error cases or single match)
  if (result.guidance) {
    lines.push(result.guidance);
  }

  // Add icon list for multiple matches
  if (result.matches.length > 1) {
    lines.push("Top icon candidates:");
    for (const match of result.matches) {
      lines.push(
        `- ${match.icon.name} (score ${match.score.toFixed(2)})`,
      );
    }
    lines.push("");
    lines.push("Select the most suitable icon.");
  } else if (result.matches.length === 1) {
    // Single match is already handled by guidance
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
        path: match.icon.path,
        category: match.icon.category,
        style: match.icon.style,
        usage: match.icon.usage,
        baseName: match.icon.baseName,
        tags: match.icon.tags,
        score: match.score,
        matchedTokens: match.matchedTokens,
      })),
    },
  };
}

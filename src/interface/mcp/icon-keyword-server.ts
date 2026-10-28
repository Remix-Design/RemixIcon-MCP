import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { version } from "../../../package.json";
import type {
  SearchIconsResponse,
  SearchIconsUseCase,
} from "../../application/use-cases/search-icons.usecase";

interface ServerDependencies {
  readonly getSearchUseCase: () => Promise<Pick<SearchIconsUseCase, "execute">>;
}

const inputSchema = z.object({
  keywords: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Up to 20 comma-separated keywords, e.g. 'summer, sun, beach'. Use keywords rather than sentences.",
    ),
});

const outputSchema = z.object({
  guidance: z.string(),
  matches: z.array(
    z.object({
      name: z.string(),
      score: z.number(),
      category: z.string(),
      style: z.string(),
      matchedKeywords: z.array(z.string()),
    }),
  ),
});

export function createIconKeywordServer({
  getSearchUseCase,
}: ServerDependencies): McpServer {
  const server = new McpServer({ name: "remix-icon-keyword-server", version });
  server.registerTool(
    "search_icons",
    {
      title: "Search Remix Icons by keyword",
      description:
        "Search bundled Remix Icon metadata using up to 20 comma-separated keywords. Returns up to 5 ranked icons with names, scores and matched keywords. Avoid natural language sentences.",
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ keywords }) => {
      try {
        const useCase = await getSearchUseCase();
        return buildToolResponse(await useCase.execute({ input: keywords }));
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Keyword search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  );
  return server;
}

function buildToolResponse(result: SearchIconsResponse) {
  const lines = result.guidance ? [result.guidance] : [];
  if (result.matches.length > 1) {
    lines.push(
      ...result.matches.map(
        ({ icon, score }) => `${icon.name} (${score.toFixed(2)})`,
      ),
    );
  }
  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    structuredContent: {
      guidance: result.guidance,
      matches: result.matches.map(({ icon, score, matchedTokens }) => ({
        name: icon.name,
        score,
        category: icon.category,
        style: icon.style,
        matchedKeywords: [...matchedTokens],
      })),
    },
  };
}

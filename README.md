# Remix Icon MCP ![](https://img.shields.io/badge/A%20FRAD%20PRODUCT-WIP-yellow)

English | [简体中文](README.zh-CN.md)

A lightweight [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that maps icon-focused keywords directly to Remix Icon metadata. Provide concise keywords, receive matching icon names and metadata – no workers, caches, or remote heuristics required.

## Features

- **Keyword-only MCP Tool** – Enforces short, comma-separated keywords and rejects natural-language prompts before invoking the search use case.
- **FlexSearch-backed Index** – Uses FlexSearch v0.8's document index for high-performance token lookup over the local Remix Icon catalog.
- **Clean Architecture** – Domain entities, application use cases, infrastructure adapters, and MCP interface remain isolated for easy testing.
- **LLM-ready Responses** – Returns ranked candidates, matched tokens, and explicit guidance instructing the model to choose exactly one icon.

## Quick Start

```bash
pnpm install
pnpm typecheck
pnpm test
```

Launch the MCP server by running the TypeScript entrypoint with your preferred runner (e.g. `pnpm exec tsx src/index.ts`) or by compiling first. The server communicates over stdio using JSON-RPC 2.0 via the official `@modelcontextprotocol/sdk` and exposes a single tool:

- `search_icons` – requires a `keywords` string (comma-separated). Optional `limit` (default 20, max 100).

### Example Tool Call

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_icons",
    "arguments": {
      "keywords": "layout, grid, design",
      "limit": 5
    }
  }
}
```

The server returns human-readable summaries plus structured metadata indicating how many icons matched the supplied keywords.

## Project Structure

```
.
├── src/
│   ├── bootstrap/                  # Dependency wiring for Clean Architecture boundaries
│   ├── domain/                     # Icon entities and keyword parser
│   ├── application/                # Search use case orchestrating validation and ranking
│   ├── infrastructure/search/      # FlexSearch-backed repository implementation
│   ├── interface/mcp/              # MCP server built with @modelcontextprotocol/sdk
│   └── data/icon-catalog.json      # Remix Icon metadata (retained from the upstream project)
├── tests/                          # Vitest suites covering parser and use case behaviour
├── package.json                    # pnpm-friendly manifest and scripts
└── tsconfig.json                   # Strict TypeScript configuration with Node typings
```

## Implementation Notes

- Keywords are parsed with Unicode-aware boundaries, deduplicated, and sentences are rejected to guarantee keyword-only inputs.
- FlexSearch indexes icon names, tags, usage, and categories; field weights plus token matches drive deterministic scores.
- The application layer combines parser validation, repository queries, and response formatting so the interface only handles transport concerns.
- MCP responses include natural-language guidance and machine-readable matches so LLM clients can choose exactly one icon.

## Development Scripts

```bash
pnpm typecheck   # Strict TypeScript check (tsc --noEmit)
pnpm test        # Run Vitest suites
pnpm exec biome check --write --unsafe   # Format + fix code with Biome
```

## License

[MIT License](LICENSE)

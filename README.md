# Remix Icon MCP ![](https://img.shields.io/badge/A%20FRAD%20PRODUCT-WIP-yellow)

English | [简体中文](README.zh-CN.md)

A lightweight [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that maps icon-focused keywords directly to Remix Icon metadata. Provide concise keywords (up to 20), receive the top 5 matching icon names and metadata – clean architecture with FlexSearch-powered local search.

## Features

- **Smart Keyword Input** – Supports up to 20 comma-separated keywords while rejecting natural-language sentences for optimal search quality.
- **Fixed Top-5 Results** – Returns exactly 5 most relevant icons for focused decision-making.
- **FlexSearch-backed Index** – Uses FlexSearch v0.8's document index for high-performance token lookup over the local Remix Icon catalog.
- **Clean Architecture** – Domain entities, application use cases, infrastructure adapters, and MCP interface remain isolated for easy testing.
- **CLI Ready** – Can be run as a standalone CLI tool via `npx mcp-server-remix-icon` or integrated into MCP clients.
- **LLM-ready Responses** – Returns ranked candidates, matched tokens, and explicit guidance instructing the model to choose exactly one icon.

## Quick Start

### Installation

```bash
# Install as CLI tool globally
npm install -g mcp-server-remix-icon

# Or run directly with npx
npx mcp-server-remix-icon

# For development
pnpm install
pnpm typecheck
pnpm test
```

### Usage

#### As a Standalone CLI Tool

You can run the MCP server directly via stdio for testing or integration:

```bash
# Run with npx
npx mcp-server-remix-icon

# Or if installed globally
mcp-server-remix-icon
```

#### Claude Desktop Configuration

To use this server with Claude Desktop, add the following configuration to your `claude_desktop_config.json`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "remix-icon": {
      "command": "npx",
      "args": ["-y", "mcp-server-remix-icon"]
    }
  }
}
```

After saving the configuration file, completely quit and restart Claude Desktop for the changes to take effect.

#### Available Tools

The server communicates over stdio using JSON-RPC 2.0 via the official `@modelcontextprotocol/sdk` and exposes a single tool:

- `search_icons` – requires a `keywords` string (comma-separated, up to 20 keywords). Always returns top 5 results.

### Example Tool Call

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_icons",
    "arguments": {
      "keywords": "layout, grid, design"
    }
  }
}
```

The server returns human-readable summaries plus structured metadata with the top 5 icons that matched the supplied keywords.

## Project Structure

```
.
├── bin/
│   └── run.cjs                     # CLI entry point for npx execution
├── src/
│   ├── cli/                        # CLI runner implementation
│   ├── bootstrap/                  # Dependency wiring for Clean Architecture boundaries
│   ├── domain/                     # Icon entities and keyword parser
│   ├── application/                # Search use case orchestrating validation and ranking
│   ├── infrastructure/search/      # FlexSearch-backed repository implementation
│   ├── interface/mcp/              # MCP server built with @modelcontextprotocol/sdk
│   └── data/tags.json              # Remix Icon tags for search functionality
├── tests/                          # Vitest suites covering parser and use case behaviour
├── package.json                    # pnpm-friendly manifest and scripts
└── tsconfig.json                   # Strict TypeScript configuration with Node typings
```

## Implementation Notes

- Keywords are parsed with Unicode-aware boundaries, supporting up to 20 comma-separated keywords while rejecting sentence-style inputs.
- Enhanced detection differentiates between keyword lists (with delimiters) and natural language sentences (space-separated phrases).
- FlexSearch indexes icon names, tags, usage, and categories; field weights plus token matches drive deterministic scores.
- Fixed top-5 results provide focused, relevant matches without configuration complexity.
- The application layer combines parser validation, repository queries, and response formatting so the interface only handles transport concerns.
- MCP responses include natural-language guidance and machine-readable matches so LLM clients can choose exactly one icon.
- CLI runner enables standalone execution via `npx` or global installation for easy integration.

## Development Scripts

```bash
pnpm typecheck   # Strict TypeScript check (tsc --noEmit)
pnpm test        # Run Vitest suites
pnpm exec biome check --write --unsafe   # Format + fix code with Biome
```

## License

[MIT License](LICENSE)

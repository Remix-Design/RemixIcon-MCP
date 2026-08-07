# RemixIcon MCP ![](https://img.shields.io/npm/v/remixicon-mcp)

[![npm downloads](https://img.shields.io/npm/dt/remixicon-mcp)](https://www.npmjs.com/package/remixicon-mcp) [![License: MIT](https://img.shields.io/npm/l/remixicon-mcp)](https://opensource.org/licenses/MIT)

**English** | [简体中文](README.zh-CN.md)

A Model Context Protocol (MCP) server that maps icon keywords to Remix Icon names. Type up to 20 comma-separated keywords and get the top 5 matching icons.

The server runs in two ways:
- **Local (stdio)** — `npx remixicon-mcp`, for CLI use and offline access.
- **Remote (Cloudflare)** — hosted on Cloudflare Workers over Streamable HTTP, for any remote-capable MCP client.

## Features

- Accepts up to 20 comma-separated keywords and rejects natural-language sentences.
- Always returns the 5 most relevant icons for focused decisions.
- Uses a FlexSearch v0.8 document index for fast token lookup over the Remix Icon catalog.
- Ships a current catalog, synced from the official RemixIcon repo: 20 categories, 1690 base icons (3380 names across line/fill styles).
- Runs on two transports, local stdio (SDK v1) and remote Streamable HTTP (SDK v2 + `agents`), sharing one domain/application/infrastructure core.
- Returns ranked candidates with matched tokens and guidance to pick one icon.

## Quick Start

### Local (stdio)

```bash
# Run directly with npx
npx remixicon-mcp

# Or install globally
npm install -g remixicon-mcp
remixicon-mcp
```

### Remote (Cloudflare)

A hosted instance is deployed at:

```
https://remix-icon-mcp.frad.workers.dev/mcp
```

No installation needed. Point a remote-capable MCP client at the URL.

## Setup

### Remote (Cloudflare)

The hosted server speaks the standard MCP Streamable HTTP transport. Remote-capable clients only need the endpoint URL.

**Claude Desktop**: add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "remix-icon": {
      "url": "https://remix-icon-mcp.frad.workers.dev/mcp"
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add --transport http remix-icon https://remix-icon-mcp.frad.workers.dev/mcp
```

The server is stateless and requires no authentication (public icon search). Redeploy after source changes:

```bash
pnpm deploy   # wrangler deploy
pnpm dev      # wrangler dev (local preview)
```

### Claude Desktop (local)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "remix-icon": {
      "command": "npx",
      "args": ["-y", "remixicon-mcp"]
    }
  }
}
```

Quit and restart Claude Desktop, then `search_icons` is available in conversations.

### Claude Code (local)

```bash
claude mcp add --transport stdio remixicon -- npx -y remixicon-mcp
```

Restart Claude Code for the change to take effect.

## Tool

The server exposes one tool. Transport depends on the mode:

- **Local (stdio)** — JSON-RPC 2.0 over stdio via `@modelcontextprotocol/sdk` (v1).
- **Remote (Cloudflare)** — Streamable HTTP via MCP SDK v2 (`@modelcontextprotocol/server`) and `agents`.

### `search_icons`

**Input**: `keywords`, a comma-separated string up to 20 keywords.
**Output**: top 5 most relevant icons with names and scores.
**Format**: human-readable text plus structured metadata.

JSON-RPC call:

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

## Project Structure

```
.
├── bin/
│   └── run.cjs                 # CLI entry for npx execution (local stdio)
├── src/                        # Local (stdio) server + shared core layers
│   ├── cli/                    # CLI runner
│   ├── bootstrap/              # Dependency wiring
│   ├── domain/                 # Icon entities and keyword parser
│   ├── application/            # Search use case
│   ├── infrastructure/         # FlexSearch repository, data adapter
│   ├── interface/mcp/          # Local MCP server (SDK v1, stdio)
│   └── data/tags.json          # Remix Icon catalog
├── worker/                     # Remote (Cloudflare) server
│   ├── tsconfig.json           # Worker TypeScript config
│   └── src/
│       ├── index.ts            # createMcpHandler + Streamable HTTP
│       └── server.ts           # SDK v2 McpServer factory (reuses src/ core)
├── wrangler.jsonc              # Cloudflare deployment config
├── tests/                      # Vitest suites (unit + worker integration)
├── .claude-plugin/
│   └── marketplace.json        # Claude Code plugin metadata
├── package.json
├── tsconfig.json               # Node TypeScript config
└── vitest.config.mts
```

## Development

```bash
pnpm typecheck   # TypeScript check for both Node and Worker projects
pnpm test        # Vitest suites (unit + worker integration)
pnpm lint        # Biome lint with auto-fix
pnpm format      # Biome format
pnpm deploy      # Deploy the remote worker to Cloudflare
pnpm dev         # Run the worker locally via wrangler dev
```

### Syncing the icon catalog

`src/data/tags.json` is synced from the official RemixIcon repo. To refresh, download the latest file from `https://raw.githubusercontent.com/Remix-Design/RemixIcon/master/tags.json`, then run `pnpm test` and `pnpm typecheck`, and redeploy with `pnpm deploy`.

## License

[MIT](LICENSE)

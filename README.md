# RemixIcon MCP ![](https://img.shields.io/npm/v/remixicon-mcp)

[![npm downloads](https://img.shields.io/npm/dt/remixicon-mcp)](https://www.npmjs.com/package/remixicon-mcp) [![License: MIT](https://img.shields.io/npm/l/remixicon-mcp)](https://opensource.org/licenses/MIT)

**English** | [简体中文](README.zh-CN.md)

A Model Context Protocol (MCP) server that maps short keywords to Remix Icon names. Search with up to 20 comma-separated keywords and receive up to 5 ranked matches.

## Features

- Local stdio, local Node.js Streamable HTTP, and Cloudflare Workers HTTP share one MCP SDK v2 server and search implementation.
- Uses a bundled FlexSearch index with English and Chinese icon tags; no external API or credentials are needed for search.
- Returns readable text and structured results with names, scores, categories, styles, and matched keywords.
- Scores all matching candidates before selecting the top results.
- HTTP supports current MCP and legacy 2025 Streamable HTTP clients. Modern requests receive JSON responses; legacy requests use request-scoped SSE. There is no standalone SSE endpoint or persistent session.

## 2.0.0 migration

Version 2.0.0 requires Node.js 20 or later for the installed CLI. The complete source-development and test workflow requires Node.js 22.12 or later; Wrangler deployment tooling requires Node.js 22 or later.

- Keep existing stdio client configurations; stdio remains the default. HTTP is opt-in through `--transport http` or a configured MCP URL.
- Keep reading `matches[].name`. Structured results also include scores, categories, styles, and matched keywords.
- The server uses MCP SDK v2. HTTP supports modern and legacy Streamable HTTP negotiation, but not the old standalone `/sse` transport or persistent sessions.
- Worker deployment is separate from npm publication. The existing hosted endpoint continues to report 1.2.0 until separately deployed.

See [CHANGELOG.md](CHANGELOG.md) for changes.

## Quick start from source

Use Node.js 22.12 or later and pnpm for the complete source-development and test workflow. Wrangler itself requires Node.js 22 or later. The installed CLI runtime supports Node.js 20 or later.

```bash
pnpm install

# Start an HTTP server at http://127.0.0.1:3000/mcp
pnpm start:http
```

Keep the server running, then configure a URL-capable MCP client with `http://127.0.0.1:3000/mcp`. For Claude Code:

```bash
claude mcp add --transport http remix-icon http://127.0.0.1:3000/mcp
```

To use stdio instead:

```bash
pnpm start
```

### CLI and configuration

With the CLI installed, stdio remains the default:

```bash
remixicon-mcp
remixicon-mcp --transport http --host 127.0.0.1 --port 3000
```

The same options work when running this checkout directly:

```bash
pnpm exec tsx src/index.ts --transport http --host 127.0.0.1 --port 3000
```

| CLI option | Environment variable | Default |
| --- | --- | --- |
| `--transport` | `MCP_TRANSPORT` | `stdio` |
| `--host` | `MCP_HOST` | `127.0.0.1` |
| `--port` | `MCP_PORT` | `3000` |

CLI options override environment variables. For Node HTTP, `MCP_ALLOWED_ORIGINS` optionally accepts comma-separated exact browser origins, such as `https://icons.example.com,http://localhost:5173`. Origins include the scheme and optional port, without a path or trailing slash. Same-origin requests and native clients without an `Origin` header are accepted by default; other browser origins are rejected.

The default host accepts local connections. To accept connections from other machines, explicitly set `--host 0.0.0.0`. This is public icon search with no authentication. If you expose it externally, configure TLS and any required access controls through your reverse proxy.

### HTTP endpoints

| Endpoint | Methods | Behavior |
| --- | --- | --- |
| `/mcp` | `POST`, `OPTIONS` | MCP requests and browser preflight |
| `/health` | `GET` | JSON health response |

`POST /mcp` requires `Content-Type: application/json`; request bodies are limited to 16 KiB. `GET /mcp` and `DELETE /mcp` return `405`. There is no legacy `/sse` endpoint or persistent session requirement.

### Published stdio package

The published package can be used by stdio clients:

```bash
npx -y remixicon-mcp
```

For Claude Desktop, add this entry to `claude_desktop_config.json` and restart the app:

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

For Claude Code:

```bash
claude mcp add --transport stdio remixicon -- npx -y remixicon-mcp
```

### Cloudflare Workers

The existing hosted endpoint is [RemixIcon MCP](https://remix-icon-mcp.frad.workers.dev/mcp). Configure a URL-capable MCP client with that address, or use:

```bash
claude mcp add --transport http remix-icon https://remix-icon-mcp.frad.workers.dev/mcp
```

The HTTP implementation was deployed and verified on October 24, 2026, with Cloudflare version `1a2ca18e-d7a6-4910-ac2f-c6d318aa407e` serving 100% of traffic. Real MCP clients passed modern (`2026-07-28`) and legacy (`2025-11-25`) protocol negotiation, tool discovery, search, and concurrent calls. The reported server version is `1.2.0`; the deployed MCP SDK is `2.3.0`. This records the previous deployment; it is not updated automatically when release source changes.

Use the endpoint in an MCP client. Opening `/mcp` in a browser sends `GET` and returns `405` as expected; use [/health](https://remix-icon-mcp.frad.workers.dev/health) for a browser health check. Future local edits do not update the hosted service until deployment:

```bash
pnpm dev       # Local Worker preview
pnpm run deploy # Publish to Cloudflare Workers
```

## Tool: `search_icons`

Input: `keywords`, a nonempty string of up to 200 characters containing up to 20 comma-separated keywords. Use short keywords rather than sentences.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_icons",
    "arguments": { "keywords": "layout, grid, design" }
  }
}
```

Successful responses include readable `content` and `structuredContent`. The output schema is shared by all transports:

```typescript
{
  guidance: string;
  matches: Array<{
    name: string;
    score: number;
    category: string;
    style: string;
    matchedKeywords: string[];
  }>;
}
```

`matches` contains zero to five items. `matches[].name` remains available to existing clients; the additional fields describe ranking and matched catalog tokens. Invalid keyword input returns a tool error. Tool annotations mark the search as read-only and idempotent.

## Project structure

```text
bin/run.cjs                    CLI launcher
src/cli/                       CLI options and process lifecycle
src/bootstrap/                 Dependency wiring and shared search index
src/domain/                    Icon entities and keyword parser
src/application/               Search use case and repository port
src/infrastructure/            FlexSearch repository and data adapter
src/interface/mcp/             Shared SDK v2 tool registration
src/interface/http/            Shared HTTP routes and request checks
src/data/tags.json             Bundled Remix Icon metadata
worker/src/index.ts            Cloudflare HTTP entry point
wrangler.jsonc                 Cloudflare configuration
tests/                         Unit, transport, and integration tests
```

## Development

```bash
pnpm start        # Node stdio server
pnpm start:http   # Node HTTP server
pnpm typecheck    # Node and Worker TypeScript checks
pnpm test         # Run unit and local integration suites once
pnpm test:watch   # Watch tests during development
pnpm run test:e2e:docker # Check the hosted HTTP MCP from Docker
pnpm lint         # Biome lint with auto-fix
pnpm format       # Biome formatting
pnpm build        # Build validation
```

The Docker command runs nine HTTP MCP cases against `https://remix-icon-mcp.frad.workers.dev/mcp` using a Linux client: modern and legacy negotiation, discovery, searches, no matches, invalid input recovery, concurrent requests, client isolation, and HTTP guards. Set `MCP_E2E_URL` to test another deployment. It uses locked dependencies, copies no host credentials or modules, and removes its test container after the run. Each run saves `report.json` and `runtime.json` in a separate directory under `.e2e/docker-http/`. These live checks are separate from `pnpm test`.

`src/data/tags.json` is bundled metadata from the [official RemixIcon catalog](https://github.com/Remix-Design/RemixIcon/blob/master/tags.json). To refresh it, update the file from that source, run tests and type checks, and review the changes before publishing a package or deploying a Worker. The server treats this metadata as read-only at runtime.

## License

[MIT](LICENSE)

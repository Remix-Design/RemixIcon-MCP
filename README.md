# Remix Icon MCP ![](https://img.shields.io/badge/A%20FRAD%20PRODUCT-WIP-yellow)

English | [简体中文](README.zh-CN.md)

A lightweight [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that maps icon-related keywords directly to Remix Icon metadata. Provide keywords, receive matching icon names and metadata – no Cloudflare Workers, caches, or AI pipelines required.

## Features

- **Keyword-focused MCP Tool** – Accepts comma-separated icon keywords and returns ranked Remix Icon matches.
- **Fast Local Index** – Pre-computed inverted index over the bundled icon catalog for instant lookup.
- **Deterministic Results** – No remote services or AI heuristics, only keyword matching and prefix expansion.
- **Metadata-rich Output** – Each result includes the icon path, category, style, and the tokens that triggered a match.

## Quick Start

```bash
npm install
npm run build
```

Launch the MCP server by running the compiled JavaScript (for example with `node build/index.js`) or by executing the TypeScript entrypoint with your preferred runner. The server communicates over stdio using JSON-RPC 2.0 and exposes a single tool:

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
│   ├── data/icon-catalog.json  # Remix Icon metadata (retained from the original project)
│   ├── icon-search.ts          # Keyword parsing, inverted index, ranking
│   ├── icon-types.ts           # Shared icon typings
│   ├── index.ts                # Entry point (bootstraps the MCP server)
│   └── mcp-server.ts           # Minimal JSON-RPC MCP server implementation
├── tests/                      # Vitest tests (unchanged)
├── package.json                # Lightweight npm manifest
└── tsconfig.json               # Node-friendly TypeScript configuration
```

## Implementation Notes

- Keywords are tokenised using Unicode-aware boundaries and normalised to lowercase.
- An inverted index maps each token to the icons containing it; prefix expansion provides basic fuzzy matching without external libraries.
- Results are scored by keyword coverage (exact matches weighted higher) and sorted deterministically.
- Server responses follow MCP tool semantics and are emitted with `Content-Length` headers for compatibility.

## Development Scripts

```bash
npm run build   # Type-checks the project
npm run lint    # Alias for build (tsc --noEmit)
npm run test    # Run existing Vitest suite
```

## License

[MIT License](LICENSE)

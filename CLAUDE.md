# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- `npm run typecheck` - Strict TypeScript check for both Node and Worker projects (`tsc --noEmit` for `src/` and `worker/`)
- `npm run lint` - Run Biome linter with auto-fix
- `npm run format` - Format code with Biome
- `npm test` - Run tests with Vitest (unit + worker integration)
- `npm run deploy` - Deploy the remote MCP worker to Cloudflare Workers (`wrangler deploy`)
- `npm run dev` - Run the worker locally via `wrangler dev`

### Testing
- Tests use Vitest with Node environment
- Test files located in `tests/` directory (including `tests/worker/` for Cloudflare worker integration)
- Configuration in `vitest.config.mts`
- Single test execution: `vitest run specific.test.ts`
- Worker integration tests use `unstable_dev` from wrangler to spin up a real local workerd runtime

### CLI Usage
- `npx remixicon-mcp` - Run local MCP server directly via stdio
- `npm install -g remixicon-mcp` - Install as global CLI tool
- Local testing: `node bin/run.cjs` or `tsx src/cli/run.ts`
- Remote MCP endpoint: `https://remix-icon-mcp.frad.workers.dev/mcp` (Streamable HTTP)

## Architecture Overview

### Core Structure
This is a **Model Context Protocol (MCP) server** that provides intelligent icon search for Remix Icons. The architecture follows Clean Architecture principles with clear separation between domain logic, application services, infrastructure, and interface layers.

### Project Structure
```
src/                        # Local (stdio) MCP server - shared core layers
├── cli/                    # CLI runner for standalone execution
├── bootstrap/              # Dependency injection and service wiring
├── domain/                 # Business logic and entities
│   ├── entities/           # Core data models (Icon)
│   ├── services/           # Domain services (KeywordParser)
│   └── constants/          # Text processing constants
├── application/            # Use cases and ports
│   ├── use-cases/          # Business logic orchestration
│   └── ports/              # Repository interfaces
├── infrastructure/         # External implementations
│   ├── search/             # FlexSearch repository
│   └── data/               # Data adapters
├── interface/              # External interfaces
│   └── mcp/                # Local MCP server (SDK v1, stdio)
└── data/                   # Static data files
    └── tags.json           # Remix Icon catalog (synced from official repo)

worker/                     # Remote (Cloudflare) MCP server
├── tsconfig.json           # Worker TypeScript config (Workers types)
└── src/
    ├── index.ts            # Worker entry: createMcpHandler + Streamable HTTP
    └── server.ts           # MCP SDK v2 McpServer factory (reuses src/ core)

wrangler.jsonc              # Cloudflare Worker deployment config
```

### Key Components

**Domain Layer**
- `Icon` entity: Core icon metadata model with name, tags, category, usage
- `KeywordParser` service: Validates and parses comma-separated keywords (max 20)
- Text processing constants for Unicode-aware keyword validation

**Application Layer**
- `SearchIconsUseCase`: Orchestrates icon search workflow
- `IconSearchRepository` port: Abstract interface for search repositories
- Validates input, delegates to repository, formats results

**Infrastructure Layer**
- `FlexSearchIconSearchRepository`: FlexSearch-based implementation
- `TagsToIconsAdapter`: Converts raw tags.json data to Icon entities
- Document index with field weights for optimized search scoring

**Interface Layer (Local)**
- `IconKeywordServer`: MCP server using @modelcontextprotocol/sdk (v1)
- Exposes single `search_icons` tool
- JSON-RPC 2.0 communication over stdio

**Worker Layer (Remote)**
- `worker/src/server.ts`: MCP SDK v2 `McpServer` factory, reuses `src/` core via bootstrap
- `worker/src/index.ts`: Stateless `createMcpHandler` from `agents/mcp/server`, Streamable HTTP
- Single tool `search_icons`, same schema and response shape as local
- Deployed via wrangler to `https://remix-icon-mcp.frad.workers.dev/mcp`

**CLI Layer**
- `runCli()`: Standalone CLI execution via tsx
- `bin/run.cjs`: Node.js wrapper for npx compatibility

### Data Flow
1. Icon catalog loaded from `src/data/tags.json`
2. TagsToIconsAdapter converts raw data to Icon entities
3. FlexSearch repository builds document index on initialization
4. KeywordParser validates input keywords (max 20, comma-separated)
5. SearchIconsUseCase coordinates search workflow
6. FlexSearch performs weighted search across name, tags, category, usage
7. Results formatted for MCP response (always top 5)

### Search Configuration
FlexSearch document index with optimized weights:
- Name matching: Highest priority for exact icon names
- Tags matching: Keyword relevance scoring
- Category matching: Icon categorization scoring
- Usage matching: Common usage patterns scoring

### MCP Interface
Single tool: `search_icons`
- Input: `keywords` string (comma-separated, max 20 keywords)
- Output: Top 5 most relevant icons with metadata
- Validation: Rejects natural language sentences, accepts keyword lists
- Response: Human-readable summary + structured metadata
- Transport: stdio (local) or Streamable HTTP (remote on Cloudflare)

### Data Source
- `src/data/tags.json` synced from the official `Remix-Design/RemixIcon` repository
- Current catalog: 20 categories, 1690 base icons (3380 names across line/fill styles)
- Data is bundled into the worker; no runtime fetch or external storage needed

## Key Implementation Patterns

### Clean Architecture
- **Dependency Rule**: Dependencies point inward (Infrastructure → Application → Domain)
- **Port-Adapter Pattern**: Application defines ports, Infrastructure provides adapters
- **Use Case Orchestration**: Application layer coordinates business workflows
- **Entity Isolation**: Domain models contain only business logic

### Search Architecture
- **Document Index**: FlexSearch with pre-built index for performance
- **Field Weighting**: Configurable weights for different icon properties
- **Token Matching**: Unicode-aware tokenization for multi-language support
- **Deterministic Scoring**: Consistent relevance scoring for reproducible results

### Input Validation
- **Keyword Limits**: Maximum 20 keywords to prevent abuse
- **Format Detection**: Distinguishes keyword lists from natural language
- **Unicode Support**: Proper handling of international characters
- **Error Handling**: Clear validation messages for invalid inputs

### CLI Design
- **Stdio Communication**: JSON-RPC 2.0 over stdin/stdout
- **Graceful Error Handling**: Proper error responses and logging
- **Process Management**: Clean startup/shutdown procedures
- **Wrapper Compatibility**: Node.js wrapper for npx execution

## Development Guidelines

### Adding New Search Features
1. Extend `Icon` entity in `src/domain/entities/icon.ts`
2. Update `TagsToIconsAdapter` to handle new data fields
3. Modify FlexSearch configuration in repository
4. Update use case if business logic changes
5. Add tests for new functionality

### Syncing the Icon Catalog
- `src/data/tags.json` is synced from the official `Remix-Design/RemixIcon` repo
- To refresh: download the latest `tags.json` from `https://raw.githubusercontent.com/Remix-Design/RemixIcon/master/tags.json`
- Run `npm test` and `npm run typecheck` after updating — data is bundled into both the local server and the worker
- Redeploy the worker (`npm run deploy`) after a data refresh

### Testing Strategy
- Unit tests for domain services and entities
- Integration tests for use cases and repositories
- CLI tests for MCP interface functionality
- Mock FlexSearch in unit tests for isolation
- Worker integration tests in `tests/worker/` use `unstable_dev` to run a real local workerd runtime and exercise the Streamable HTTP MCP protocol end-to-end

### Code Organization
- Keep domain layer pure (no external dependencies)
- Infrastructure implements application ports
- Use dependency injection via bootstrap layer
- Maintain single responsibility principle throughout

## Performance Considerations

### Search Optimization
- **Index Pre-building**: FlexSearch index built once at startup (or once per isolate in the worker)
- **Memory Efficiency**: Icon data loaded once, shared across requests
- **Scoring Cache**: Consistent scoring prevents recalculation
- **Result Limiting**: Fixed top 5 results control response size

### Worker Performance
- **Stateless**: `createMcpHandler` creates a fresh server per request; no session state to persist
- **Bundle Size**: ~244 KB gzipped (FlexSearch + icon data + MCP SDK v2)
- **Isolate Caching**: FlexSearch index and icon map built once per isolate, reused across requests
- **Fast Startup**: ~115 ms worker startup time observed at deploy

### CLI Performance
- **Minimal Dependencies**: Fast startup time for CLI usage
- **Efficient Parsing**: Quick keyword validation and tokenization
- **Stream Processing**: JSON-RPC responses streamed efficiently
- **Memory Management**: Proper cleanup and resource management

## Deployment and Distribution

### NPM Package
- **Bin Entry**: `bin/run.cjs` for CLI execution
- **Main Entry**: `src/index.ts` for library usage
- **Files Included**: Essential source and documentation files
- **Engine Compatibility**: Node.js >= 18.0.0

### Cloudflare Deployment
- **Wrangler Config**: `wrangler.jsonc` with `main: worker/src/index.ts`
- **Worker Entry**: `worker/src/index.ts` with stateless `createMcpHandler`
- **Deploy**: `npm run deploy` (wrangler deploy) to workers.dev
- **Endpoint**: `https://remix-icon-mcp.frad.workers.dev/mcp`
- **Stateless**: No Durable Objects or bindings; FlexSearch index built once per isolate
- **No Auth**: Public icon-search service; add OAuth via `@cloudflare/workers-oauth-provider` if needed

### MCP Integration
- **Claude Desktop**: Configuration via `claude_desktop_config.json` (command for stdio, URL for remote)
- **Claude Code**: Marketplace plugin or manual `.claude/settings.json`
- **Stdio Protocol**: Standard MCP JSON-RPC 2.0 communication (local)
- **Streamable HTTP**: Remote MCP transport on Cloudflare
- **Tool Discovery**: Automatic tool registration and metadata
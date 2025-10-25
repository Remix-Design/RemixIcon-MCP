# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- `npm run build` - Run TypeScript compiler check (tsc --noEmit)
- `npm run typecheck` - Same as build, strict TypeScript checking
- `npm run lint` - Run Biome linter with auto-fix
- `npm run format` - Format code with Biome
- `npm test` - Run tests with Vitest

### Testing
- Tests use Vitest with Node environment
- Test files located in `tests/` directory
- Configuration in `vitest.config.mts`
- Single test execution: `vitest run specific.test.ts`

### CLI Usage
- `npx remixicon-mcp` - Run MCP server directly via stdio
- `npm install -g remixicon-mcp` - Install as global CLI tool
- Local testing: `node bin/run.cjs` or `tsx src/cli/run.ts`

## Architecture Overview

### Core Structure
This is a **Model Context Protocol (MCP) server** that provides intelligent icon search for Remix Icons. The architecture follows Clean Architecture principles with clear separation between domain logic, application services, infrastructure, and interface layers.

### Project Structure
```
src/
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
│   └── mcp/                # MCP server implementation
└── data/                   # Static data files
    └── tags.json           # Remix Icon catalog
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

**Interface Layer**
- `IconKeywordServer`: MCP server using @modelcontextprotocol/sdk
- Exposes single `search_icons` tool
- JSON-RPC 2.0 communication over stdio

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

### Testing Strategy
- Unit tests for domain services and entities
- Integration tests for use cases and repositories
- CLI tests for MCP interface functionality
- Mock FlexSearch in unit tests for isolation

### Code Organization
- Keep domain layer pure (no external dependencies)
- Infrastructure implements application ports
- Use dependency injection via bootstrap layer
- Maintain single responsibility principle throughout

## Performance Considerations

### Search Optimization
- **Index Pre-building**: FlexSearch index built once at startup
- **Memory Efficiency**: Icon data loaded once, shared across requests
- **Scoring Cache**: Consistent scoring prevents recalculation
- **Result Limiting**: Fixed top 5 results control response size

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

### MCP Integration
- **Claude Desktop**: Configuration via `claude_desktop_config.json`
- **Claude Code**: Marketplace plugin or manual `.claude/settings.json`
- **Stdio Protocol**: Standard MCP JSON-RPC 2.0 communication
- **Tool Discovery**: Automatic tool registration and metadata
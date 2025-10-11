# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.3.2] - 2025-10-11

### Added
- Claude Desktop configuration documentation in README
  - Added detailed setup instructions for macOS and Windows
  - Included example configuration for `claude_desktop_config.json`
  - Added instructions to restart Claude Desktop after configuration

### Changed
- Improved README structure with clearer usage sections
  - Separated standalone CLI and Claude Desktop configuration
  - Enhanced documentation for both English and Chinese versions


## [0.3.1] - 2025-10-11

### Fixed
- Added npm publish configuration for better package distribution
  - Configured `files` field to include only necessary published files
  - Set Node.js engine requirement to >=18.0.0
  - Extended package keywords for better discoverability
- Fixed type safety issue with optional chaining in FlexSearch icon search repository
- Moved `tsx` from devDependencies to dependencies for proper runtime execution


## [0.2.0] - 2025-10-11

### Added
- CLI runner infrastructure for standalone execution
  - Added `bin/run.cjs` entry point for npx/npm execution
  - New `src/cli/` directory with CLI implementation
  - Package.json `bin` field for global installation support
- Enhanced keyword parser with improved detection logic
  - Support for up to 20 comma-separated keywords
  - Better differentiation between keyword lists and natural language sentences
  - Delimiter-based detection allows richer keyword input
  - Comprehensive test coverage for new detection patterns

### Changed
- **BREAKING**: Removed configurable `limit` parameter from search API
  - Fixed result count to 5 icons for all searches
  - Simplified API surface by removing unnecessary configuration
  - Updated `search_icons` tool to no longer accept `limit` argument
- Improved keyword vs sentence detection algorithm
  - Space-separated inputs with 4+ words now correctly detected as sentences
  - Comma-separated inputs support up to 20 keywords before triggering sentence detection
  - Stop word detection works with delimiters for better accuracy
- Updated documentation to reflect CLI availability and fixed result count

### Fixed
- Downgraded Zod dependency from 4.1.12 to 3.25.76
  - Resolved breaking changes incompatible with MCP SDK
  - Fixed TypeScript configuration compatibility issues
- Corrected test suites to match new API behavior (removed limit tests)


## [0.1.0] - 2025-03-01

### Added
- Inverted index implementation for faster search
  - Preliminary search using inverted index
  - Fallback to detailed scoring for better results
- Enhanced API functionality
  - Renamed `searchIconsByCategory` to `findIconsByCategory` for consistency
  - Increased result limit from 3 to 5 icons
  - Improved result scoring and ranking
- Project structure reorganization
  - Better organization of domain models and services
  - Improved type definitions for icons and search
- Documentation improvements
  - Updated project structure documentation
  - Added detailed setup and deployment instructions
  - Synchronized English and Chinese documentation

### Changed
- Search algorithm improvements
  - Two-tier search strategy implementation
  - Better handling of Chinese text input
  - Improved category relevance calculation
- Performance enhancements
  - Optimized search index building
  - Improved caching strategy
  - Better memory usage

### Fixed
- Fixed inconsistent API naming
- Corrected project structure documentation
- Improved error handling in search services


## 0.0.1 - 2025-02-27

### Added
- Initial project setup and configuration
  - TypeScript and Cloudflare Workers environment setup
  - Development tooling (Vitest, Wrangler)
  - Project documentation (README in English and Chinese)
- Core API endpoints implementation
  - `findIcons`: Smart icon search with natural language support
  - `getIconCategories`: Category listing functionality
  - `searchIconsByCategory`: Category-based icon search
- Advanced search algorithms integration
  - Jaccard Similarity matching
  - N-gram matching algorithm
  - Category-based matching
  - Exact matching support
  - Levenshtein Distance calculation
  - Name-based matching
  - Tag-based search functionality
- Performance optimizations
  - LRU caching implementation (2000 entries)
  - Similarity threshold configuration (0.08)
  - Multi-language support optimization
  - English and Chinese text processing

[0.3.1]: https://github.com/fradser/mcp-server-remix-icon/compare/v0.2.0...v0.3.1
[0.2.0]: https://github.com/fradser/mcp-server-remix-icon/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fradser/mcp-server-remix-icon/compare/v0.0.1...v0.1.0
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2025-02-27

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
# Remix Icon MCP ![](https://img.shields.io/badge/A%20FRAD%20PRODUCT-WIP-yellow)

[![Twitter Follow](https://img.shields.io/twitter/follow/FradSer?style=social)](https://twitter.com/FradSer)

English | [简体中文](README.zh-CN.md)

A powerful icon search and recommendation service built on Cloudflare Workers, providing intelligent icon discovery through advanced semantic matching algorithms.

## Features

- **Smart Icon Search**: Find icons based on natural language descriptions using multiple similarity algorithms
- **Multi-language Support**: Optimized for both English and Chinese text input
- **Category Management**: Browse and search icons by categories
- **Advanced Matching**: Uses multiple algorithms for better search results:
  - Jaccard Similarity
  - N-gram Matching
  - Category Matching
  - Exact Matching
  - Levenshtein Distance
  - Name Matching
  - Tag-based Matching
- **Inverted Index**: Fast preliminary search using an inverted index
- **Caching**: LRU caching for improved performance

## API Endpoints

### Find Icons
```typescript
findIcons(description: string): ResponseContent[]
```
Finds icons based on user description, returns top 5 recommendations with similarity scores.

### Get Icon Categories
```typescript
getIconCategories(): ResponseContent[]
```
Returns a list of all available icon categories.

### Find Icons by Category
```typescript
findIconsByCategory(description: string, category: string): ResponseContent[]
```
Searches for icons within a specific category based on description, returns top 5 recommendations.

## Project Structure

```
.
├── src/                   # Source code directory
│   ├── index.ts           # Main entry point
│   ├── data/              # Data files including icon catalog
│   ├── domain/            # Domain models and services
│   │   ├── icon/          # Icon domain models
│   │   └── search/        # Search functionality
│   ├── infrastructure/    # Infrastructure components
│   │   ├── logging/       # Logging utilities
│   │   └── result/        # Result handling
│   └── utils/             # Utility functions
│       ├── similarity/    # Similarity calculation algorithms
│       └── text/          # Text processing utilities
├── tests/                 # Test files
│   ├── integration/       # Integration tests
│   └── unit/              # Unit tests
└── wrangler.jsonc         # Cloudflare Workers configuration
```

## Technical Details

- Built on Cloudflare Workers platform
- Uses LRU caching for performance optimization
- Implements weighted multi-algorithm similarity scoring
- Supports both character and word-level matching for Chinese text
- Configurable similarity thresholds and weights
- Uses inverted index for faster preliminary search

## Performance Optimization

- Implements caching with LRU (Least Recently Used) strategy
- Maximum cache size: 2000 entries
- Minimum score threshold: 0.08
- Optimized similarity calculations for both English and Chinese text
- Two-tier search strategy: inverted index for fast preliminary results, followed by detailed scoring

## Response Format

All endpoints return responses in the following format:
```typescript
interface ResponseContent {
    type: 'text';
    text: string;
}
```

## Development

This project is built using TypeScript and Cloudflare Workers. The main functionality is implemented in the `RemixIconMCP` class which extends `WorkerEntrypoint`.

### Setup and Deployment

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Deploy to Cloudflare Workers
npm run deploy

# Run tests
npm run test
```

## License

[MIT License](LICENSE) 
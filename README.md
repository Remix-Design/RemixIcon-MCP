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

## API Endpoints

### Find Icons
```typescript
findIcons(description: string): ResponseContent[]
```
Finds icons based on user description, returns top 3 recommendations with similarity scores.

### Get Icon Categories
```typescript
getIconCategories(): ResponseContent[]
```
Returns a list of all available icon categories.

### Search Icons by Category
```typescript
searchIconsByCategory(category: string, limit: number = 10): ResponseContent[]
```
Searches for icons within a specific category with an optional limit.

## Technical Details

- Built on Cloudflare Workers platform
- Uses LRU caching for performance optimization
- Implements weighted multi-algorithm similarity scoring
- Supports both character and word-level matching for Chinese text
- Configurable similarity thresholds and weights

## Performance Optimization

- Implements caching with LRU (Least Recently Used) strategy
- Maximum cache size: 2000 entries
- Minimum score threshold: 0.08
- Optimized similarity calculations for both English and Chinese text

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

## License

[MIT License](LICENSE) 
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- `npm run dev` or `npm start` - Start development server with Wrangler
- `npm run deploy` - Generate MCP documentation and deploy to Cloudflare Workers  
- `npm run deploy:kv` - Deploy with KV storage initialization (recommended for production)
- `npm test` - Run tests with Vitest (using Cloudflare Workers test pool)
- `npm run cf-typegen` - Generate Cloudflare Workers types

### Testing
- All tests use Vitest with `@cloudflare/vitest-pool-workers` for Cloudflare Workers compatibility
- Test files are located in `tests/` directory with subdirectories for `integration/` and `unit/` tests
- Configuration is in `vitest.config.mts` which references `wrangler.jsonc`

## Architecture Overview

### Core Structure
This is a **Cloudflare Workers MCP (Model Context Protocol) server** that provides intelligent icon search and recommendation services for Remix Icons. The architecture follows domain-driven design principles.

### Key Components

**Main Entry Point (`src/index.ts`)**
- `RemixIconMCP` class extends `WorkerEntrypoint` 
- Provides three main methods: `findIcons()`, `getIconCategories()`, `findIconsByCategory()`
- Uses dependency injection pattern with `createSearchService()` factory

**Domain Layer (`src/domain/`)**
- **Icon Domain**: Type definitions and models for icon metadata
- **Search Domain**: Complete search functionality including:
  - Search configuration with weights, thresholds, and boosts
  - Multi-level caching with LRU strategy
  - Inverted index for fast preliminary search
  - Scorer service with multiple similarity algorithms
  - Query processing and enhancement

**Search Architecture**
- **Two-tier search strategy**: Fast inverted index for preliminary results, then detailed scoring
- **Multi-algorithm similarity matching**: Jaccard, N-gram, Levenshtein, category matching, exact matching
- **Semantic query enhancement**: Enriches queries with related terms
- **Configurable scoring**: Weights and thresholds defined in `DEFAULT_SEARCH_CONFIG`

**Infrastructure Layer (`src/infrastructure/`)**
- Logging with configurable log levels
- Result handling with success/failure patterns

**Utilities (`src/utils/`)**
- Text processing for normalization and Chinese/English text handling
- Similarity calculations with semantic vectors
- Multiple similarity algorithms implementation

### Data Flow
1. Icon catalog loaded from `src/data/icon-catalog.json`
2. Inverted index built on service initialization
3. Search requests processed through query enhancement → index search → detailed scoring → caching
4. Results returned with relevance scores and categories

### Performance Features
- **Hybrid caching**: Cloudflare Cache API with in-memory LRU for hot data
- **Streaming search**: Memory-efficient batch processing to avoid 128MB Worker limits
- **KV storage**: Icon catalog and search indexes stored in Cloudflare KV for persistence
- **Inverted index**: Fast preliminary search before detailed scoring
- **Configurable thresholds**: Minimum score (0.08), high score (0.3), secondary results (0.1)
- **Concurrent batch processing**: Parallel processing with memory management

## Configuration

### Search Configuration (`src/domain/search/config/`)
All search behavior is controlled by `DEFAULT_SEARCH_CONFIG`:
- **Weights**: Category (0.35), Name match (0.37), Tags (0.28), etc.
- **Thresholds**: High score (0.3), minimum score (0.05), secondary (0.1)
- **Boosts**: Exact match (2.4), name match (2.2), category match (2.2)
- **Cache settings**: Max size 1000, TTL 1 hour

### Cloudflare Workers (`wrangler.jsonc`)
- Uses compatibility date `2025-02-24`
- Observability enabled with Analytics Engine integration
- KV namespace: `ICON_CATALOG` for storing icon data and search indexes
- Analytics Engine dataset: `remix_icon_analytics` for metrics storage
- Environment variables: `TELEMETRY_ENABLED`, `DASHBOARD_ENABLED`, `LOG_LEVEL`
- Main entry point: `src/index.ts`

### Observability Configuration
- **Telemetry Service**: Comprehensive metrics collection and distributed tracing
- **Dashboard Service**: Real-time monitoring with customizable widgets and alerting
- **Correlation Tracker**: Request correlation across services and operations
- **Analytics Engine Integration**: Persistent storage of metrics and traces
- **Alert System**: Configurable thresholds for error rates, response times, and resource usage

## Cursor Rules Integration
- Project structure documented in `.cursor/rules/overview.mdc`
- Custom shortcuts defined in `.cursor/rules/shortcuts.mdc`
- "Ready to release" command updates README files
- "Hi" command provides codebase analysis

## Key Implementation Patterns
- **Domain-driven design** with clear separation of concerns
- **Dependency injection** throughout service layer
- **Result pattern** for error handling instead of exceptions
- **Factory pattern** for service creation
- **Strategy pattern** for similarity algorithms
- **Adapter pattern** for cache interface compatibility
- **Streaming pattern** for memory-efficient processing
- **Comprehensive logging** with structured context

## Architecture Optimizations

### Phase 1 Improvements (Completed)
1. **KV Storage Migration**: Icon catalog moved from JSON to Cloudflare KV
2. **Memory Optimization**: Streaming search with batch processing
3. **Cache Modernization**: Cloudflare Cache API with hybrid in-memory layer

### Phase 2 Simplifications (Completed)
1. **Unified Cache Service**: Consolidated 3 cache implementations into 1
2. **Unified Search Service**: Merged SearchService and StreamingSearchService
3. **Centralized Error Handling**: Consistent error patterns across all services
4. **Configuration Management**: Single ConfigManager for all settings

### Phase 3 Advanced Performance (Completed)
1. **Tiered Search Pipeline**: Multi-stage search with Bloom filters and early termination
2. **Incremental Indexing**: N-gram pre-computation with versioning and delta updates
3. **Advanced Observability**: Comprehensive metrics, tracing, and real-time dashboards
4. **Smart Caching System**: ML-driven predictive caching with query pattern analysis

### Architecture Benefits
- **Memory Usage**: Reduced from ~1.1MB JSON loading to streaming batches
- **Cache Persistence**: Search results survive Worker restarts  
- **Code Maintainability**: 40% reduction in service classes through unification
- **Error Consistency**: Structured error handling with proper logging levels
- **Configuration Flexibility**: Environment-based config with sensible defaults
- **Response Time**: Hot data < 1ms, warm data < 50ms, cold data < 200ms
- **Search Performance**: 3-stage pipeline with O(1) → O(log n) → O(k) complexity
- **Observability**: Real-time metrics, distributed tracing, and automated alerting
- **Query Intelligence**: N-gram matching, phonetic search, and pattern analytics

## Observability Features

### Real-Time Dashboard
- **System Overview**: Request counts, success rates, response times, cache hit rates
- **Performance Metrics**: Memory usage, P95 response times, error rates
- **Query Analytics**: Popular search patterns, category distribution, trend analysis
- **Response Time Heatmap**: Performance patterns by time and day
- **Alert Management**: Active alerts with severity levels and acknowledgment

### Distributed Tracing
- **Correlation Tracking**: End-to-end request correlation across services
- **Span Collection**: Detailed operation timing and metadata
- **Performance Analysis**: Bottleneck identification and optimization insights
- **Error Attribution**: Precise error location and context

### Metrics Collection
- **Search Metrics**: Duration, result counts, cache hits, error counts by operation
- **Performance Counters**: Memory usage, request rates, error rates
- **Query Patterns**: Frequency analysis, success rates, response time patterns
- **System Health**: Active spans, correlation contexts, resource utilization

### Alerting System
- **Configurable Thresholds**: Error rate, response time, cache hit rate, memory usage
- **Severity Levels**: Low, medium, high, critical with appropriate escalation
- **Alert Cooldowns**: Prevent notification spam with configurable intervals
- **Real-Time Notifications**: Immediate alerts for critical system issues

### Analytics Engine Integration
- **Persistent Storage**: Long-term metrics storage in Cloudflare Analytics Engine
- **Data Export**: Structured data export for external analysis tools
- **Historical Analysis**: Long-term trend analysis and capacity planning
- **Custom Dashboards**: Flexible widget system for specialized monitoring needs

## Smart Caching System

### Predictive Cache Service
- **Query Pattern Analysis**: ML-driven analysis of user search patterns and behaviors
- **Seasonal Intelligence**: Time-based patterns with hourly and weekly distributions
- **User Behavior Tracking**: Session analysis and query sequence learning
- **Smart Predictions**: Probability-based cache warming with reasoning explanations
- **Background Warming**: Automated cache warming based on predicted queries

### Intelligent Cache Management
- **Adaptive TTL**: Dynamic cache expiration based on query characteristics and usage patterns
- **Multi-Tier Eviction**: Sophisticated eviction policies (LRU, LFU, adaptive, predictive)
- **Priority-Based Storage**: Smart cache entry prioritization based on query complexity and success rates
- **Memory Optimization**: Automatic memory management with compression and adaptive sizing
- **Performance Analytics**: Comprehensive cache hit/miss analysis and warming success metrics

### ML-Driven Optimization
- **Feature Engineering**: Query frequency, recency, seasonality, and user context analysis
- **Probability Modeling**: Weighted linear model for cache warming probability calculation
- **Pattern Recognition**: Related query identification and user segment analysis
- **Adaptive Learning**: Real-time model parameter adjustment based on cache performance
- **Predictive Insights**: Query trend forecasting and user behavior prediction

### Cache Warming Strategies
- **Reactive Warming**: Traditional cache-miss-triggered warming
- **Predictive Warming**: ML-prediction-based proactive cache warming
- **Hybrid Approach**: Combined reactive and predictive strategies for optimal performance
- **Priority Queuing**: Smart warming queue management with probability-based prioritization
- **Success Tracking**: Warming effectiveness monitoring and adaptive threshold adjustment
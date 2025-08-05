import { ILogger } from '../../../infrastructure/logging/logger';
import { Result } from '../../../infrastructure/result/result';
import { ErrorHandler, ErrorType } from '../../../infrastructure/error/error-handler';
import { SimilarityEngine } from '../../../utils/similarity/similarity';
import { IconMetadata, ResponseContent } from '../../icon/types/icon.types';
import { SearchConfig, SearchParams } from '../types/search.types';
import { ICache } from './cache.service';
import { IInvertedIndex } from './inverted-index.service';
import { IQueryProcessor } from './query.service';
import { IScorer } from './scorer.service';
import { IKVStorage } from '../../../infrastructure/storage/kv-storage.service';
import { TextProcessor } from '../../../utils/text/text-processor';
import { TelemetryService } from '../../../infrastructure/observability/telemetry.service';
import { CorrelationTracker } from '../../../infrastructure/observability/correlation-tracker';

// Forward declaration to avoid circular dependency
export interface ITieredSearchService {
	performTieredSearch(description: string, resultLimit: number): Promise<ResponseContent[]>;
	performTieredCategorySearch(description: string, category: string, resultLimit: number): Promise<ResponseContent[]>;
	buildIndex(icons: IconMetadata[]): void;
}

/**
 * Unified search service that combines traditional and streaming search capabilities
 * Provides both low-level search operations and high-level API methods
 */
export class UnifiedSearchService {
	private static readonly BATCH_SIZE = 100;
	private static readonly MAX_CONCURRENT_BATCHES = 3;
	private readonly errorHandler: ErrorHandler;
	
	private tieredSearchService?: ITieredSearchService;
	
	constructor(
		private readonly scorer: IScorer,
		private readonly cache: ICache,
		private readonly queryProcessor: IQueryProcessor,
		private readonly config: SearchConfig,
		private readonly logger: ILogger,
		private readonly kvStorage: IKVStorage,
		private readonly invertedIndex?: IInvertedIndex,
		private readonly telemetryService?: TelemetryService,
		private readonly correlationTracker?: CorrelationTracker
	) {
		this.errorHandler = new ErrorHandler(logger);
	}

	/**
	 * Set the tiered search service (to avoid circular dependency)
	 */
	setTieredSearchService(tieredSearchService: ITieredSearchService): void {
		this.tieredSearchService = tieredSearchService;
	}

	/**
	 * Builds the search index
	 */
	buildIndex(icons: IconMetadata[]): void {
		if (!this.invertedIndex) {
			this.logger.warn('Inverted index not available, skipping index build');
			return;
		}

		try {
			this.invertedIndex.buildIndex(icons);
			this.logger.info('Search index built successfully', { iconCount: icons.length });
		} catch (error) {
			this.logger.error('Error building search index', { error });
		}
	}

	/**
	 * High-level API: Find icons based on description
	 */
	async findIcons(description: string, resultLimit: number = 5): Promise<ResponseContent[]> {
		const startTime = Date.now();
		
		// Create correlation context for this search request
		const correlationContext = this.correlationTracker?.createContext({
			metadata: { operation: 'findIcons', description, resultLimit }
		});
		
		// Start telemetry span
		const spanId = this.telemetryService?.startSpan('search.findIcons', correlationContext?.correlationId);
		if (spanId) {
			this.telemetryService?.addSpanTags(spanId, { description, resultLimit });
		}
		
		// Track operation in correlation tracker
		const operationId = correlationContext 
			? this.correlationTracker?.trackOperation(correlationContext.correlationId, 'findIcons', 'UnifiedSearchService')
			: undefined;
		
		// Validate input
		const validation = this.errorHandler.validateParams(
			{ description, resultLimit },
			(params) => typeof params.description === 'string' && params.description.length > 0 && params.resultLimit > 0,
			'Invalid search parameters: description must be non-empty string and resultLimit must be positive'
		);
		
		if (!validation.success) {
			const duration = Date.now() - startTime;
			
			// Record failed metrics
			this.telemetryService?.recordSearchMetrics({
				operation: 'findIcons',
				duration,
				resultCount: 0,
				cacheHit: false,
				errorCount: 1,
				query: description
			});
			
			// Complete tracking
			if (spanId) this.telemetryService?.finishSpan(spanId, 'error');
			if (operationId && correlationContext) {
				this.correlationTracker?.completeOperation(correlationContext.correlationId, operationId, 'error');
				this.correlationTracker?.completeContext(correlationContext.correlationId, 'failed');
			}
			
			return [];
		}

		// Use tiered search if available for better performance
		if (this.tieredSearchService) {
			this.logger.debug('Using tiered search pipeline', { description, resultLimit });
			
			try {
				const results = await this.tieredSearchService.performTieredSearch(description, resultLimit);
				const duration = Date.now() - startTime;
				
				// Record successful metrics
				this.telemetryService?.recordSearchMetrics({
					operation: 'findIcons',
					duration,
					resultCount: results.length,
					cacheHit: false, // Tiered search handles its own caching
					stage: 'tiered_pipeline',
					query: description
				});
				
				// Complete tracking
				if (spanId) this.telemetryService?.finishSpan(spanId, 'success');
				if (operationId && correlationContext) {
					this.correlationTracker?.completeOperation(correlationContext.correlationId, operationId, 'success', { resultCount: results.length });
					this.correlationTracker?.completeContext(correlationContext.correlationId, 'completed');
				}
				
				return results;
			} catch (error) {
				const duration = Date.now() - startTime;
				
				// Record error metrics
				this.telemetryService?.recordSearchMetrics({
					operation: 'findIcons',
					duration,
					resultCount: 0,
					cacheHit: false,
					errorCount: 1,
					stage: 'tiered_pipeline',
					query: description
				});
				
				// Complete tracking with error
				if (spanId) this.telemetryService?.finishSpan(spanId, 'error');
				if (operationId && correlationContext) {
					this.correlationTracker?.completeOperation(correlationContext.correlationId, operationId, 'error', { error: error.message });
					this.correlationTracker?.completeContext(correlationContext.correlationId, 'failed');
				}
				
				this.logger.error('Tiered search failed, falling back to standard search', { error });
				// Continue to fallback search
			}
		}

		// Fallback to standard search pipeline
		const result = await this.errorHandler.safeExecute(
			async () => {
				const catalogResult = await this.kvStorage.getIconCatalog();
				if (!catalogResult.success || !catalogResult.data) {
					throw new Error('Icon catalog not available');
				}

				const icons = catalogResult.data;
				
				// Try inverted index first
				if (this.invertedIndex) {
					const indexResults = this.searchWithIndex(description);
					if (indexResults.size >= resultLimit) {
						return this.formatIndexResults(indexResults, icons, resultLimit);
					}
				}

				// Fall back to streaming search
				return await this.streamingSearch(description, icons, resultLimit);
			},
			ErrorType.SEARCH,
			'find icons',
			{ description, resultLimit }
		);

		return result.success ? result.data : [];
	}

	/**
	 * High-level API: Find icons by category
	 */
	async findIconsByCategory(description: string, category: string, resultLimit: number = 5): Promise<ResponseContent[]> {
		// Use tiered search if available for better performance
		if (this.tieredSearchService) {
			this.logger.debug('Using tiered category search pipeline', { description, category, resultLimit });
			return await this.tieredSearchService.performTieredCategorySearch(description, category, resultLimit);
		}

		// Fallback to standard category search
		try {
			this.logger.debug('Finding icons by category', { description, category, resultLimit });
			
			// Try to get category-specific icons first
			const categoryResult = await this.kvStorage.getIconsByCategory(category);
			let categoryIcons: IconMetadata[];
			
			if (categoryResult.success && categoryResult.data) {
				categoryIcons = categoryResult.data;
			} else {
				// Fallback: filter from full catalog
				const catalogResult = await this.kvStorage.getIconCatalog();
				if (!catalogResult.success || !catalogResult.data) {
					return [];
				}
				
				const normalizedCategory = TextProcessor.normalizeInput(category);
				categoryIcons = catalogResult.data.filter(icon => 
					TextProcessor.normalizeInput(icon.category) === normalizedCategory
				);
			}

			if (categoryIcons.length === 0) {
				return [];
			}

			// Try inverted index first
			if (this.invertedIndex) {
				const indexResults = this.searchCategoryWithIndex(description, category);
				if (indexResults.size >= resultLimit) {
					return this.formatIndexResults(indexResults, categoryIcons, resultLimit);
				}
			}

			// Fall back to streaming search
			return await this.streamingSearch(description, categoryIcons, resultLimit);
		} catch (error) {
			this.logger.error('Error in findIconsByCategory', { error, description, category });
			return [];
		}
	}

	/**
	 * Low-level API: Individual icon search with caching
	 */
	async search(params: SearchParams): Promise<Result<number>> {
		// Validate parameters
		const validation = this.errorHandler.validateParams(
			params,
			this.validateParams.bind(this),
			'Invalid search parameters'
		);
		
		if (!validation.success) {
			return validation;
		}

		return await this.errorHandler.safeExecute(
			async () => {
				const cacheKey = this.generateCacheKey(params);
				const cachedScore = this.cache.get(cacheKey);

				if (cachedScore !== undefined) {
					this.logger.debug('Cache hit', { cacheKey });
					return cachedScore;
				}

				// Enhance and process query
				const enhancedParams = this.enhanceSearchParams(params);
				const processedParams = this.queryProcessor.process(enhancedParams);

				// Calculate score
				const score = this.scorer.calculate(processedParams);

				// Cache result
				this.cache.set(cacheKey, score);
				return score;
			},
			ErrorType.SEARCH,
			'calculate search score',
			{ cacheKey: this.generateCacheKey(params) }
		);
	}

	/**
	 * Batch search with concurrency control
	 */
	async batchSearch(paramsArray: SearchParams[]): Promise<Result<number>[]> {
		try {
			if (!Array.isArray(paramsArray) || paramsArray.length === 0) {
				return [];
			}

			// Split into chunks for processing
			const chunks = this.createBatches(paramsArray, 10);
			const results = await Promise.all(
				chunks.map(chunk => Promise.all(chunk.map(params => this.search(params))))
			);

			return results.flat();
		} catch (error) {
			this.logger.error('Batch search error', { error });
			return paramsArray.map(() => Result.failure(error instanceof Error ? error : new Error(String(error))));
		}
	}

	/**
	 * Search using inverted index
	 */
	searchWithIndex(query: string): Map<string, number> {
		if (!this.invertedIndex) {
			return new Map();
		}

		try {
			const enhancedQuery = SimilarityEngine.enrichQuery(query);
			return this.invertedIndex.search(enhancedQuery);
		} catch (error) {
			this.logger.error('Index search error', { error, query });
			return new Map();
		}
	}

	/**
	 * Search category using inverted index
	 */
	searchCategoryWithIndex(query: string, category: string): Map<string, number> {
		if (!this.invertedIndex) {
			return new Map();
		}

		try {
			const enhancedQuery = SimilarityEngine.enrichQuery(query);
			return this.invertedIndex.searchByCategory(enhancedQuery, category);
		} catch (error) {
			this.logger.error('Category index search error', { error, query, category });
			return new Map();
		}
	}

	/**
	 * Memory-efficient streaming search
	 */
	private async streamingSearch(description: string, icons: IconMetadata[], resultLimit: number): Promise<ResponseContent[]> {
		const batches = this.createBatches(icons, UnifiedSearchService.BATCH_SIZE);
		const results: Array<{ name: string; score: number; category: string }> = [];
		
		// Process batches with concurrency control
		for (let i = 0; i < batches.length; i += UnifiedSearchService.MAX_CONCURRENT_BATCHES) {
			const batchSlice = batches.slice(i, i + UnifiedSearchService.MAX_CONCURRENT_BATCHES);
			
			const batchPromises = batchSlice.map(batch => 
				this.processBatch(batch, description)
			);
			
			const batchResults = await Promise.all(batchPromises);
			
			for (const batchResult of batchResults) {
				results.push(...batchResult);
			}
			
			// Early termination for high-quality results
			if (results.length > resultLimit * 3) {
				const topResults = results
					.sort((a, b) => b.score - a.score)
					.slice(0, resultLimit * 2);
				
				if (topResults[0]?.score > this.config.thresholds.highScore) {
					break;
				}
			}
			
			// Yield control periodically
			if (i % 10 === 0) {
				await new Promise(resolve => setTimeout(resolve, 0));
			}
		}

		return this.formatStreamingResults(results, resultLimit);
	}

	/**
	 * Process a batch of icons
	 */
	private async processBatch(
		batch: IconMetadata[], 
		description: string
	): Promise<Array<{ name: string; score: number; category: string }>> {
		const results: Array<{ name: string; score: number; category: string }> = [];
		
		for (const icon of batch) {
			const searchResult = await this.search({
				description,
				usage: icon.usage,
				category: icon.category,
				name: icon.name,
				tags: icon.tags
			});

			if (searchResult.success && searchResult.data && searchResult.data >= this.config.thresholds.minScore) {
				results.push({
					name: icon.name,
					score: searchResult.data,
					category: icon.category
				});
			}
		}

		return results;
	}

	/**
	 * Format index search results
	 */
	private formatIndexResults(indexResults: Map<string, number>, icons: IconMetadata[], limit: number): ResponseContent[] {
		return Array.from(indexResults.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([name, score]) => {
				const icon = icons.find(i => i.name === name);
				return {
					type: 'text' as const,
					text: `${name} (Score: ${score.toFixed(2)}, Category: ${icon?.category || 'Unknown'})`
				};
			});
	}

	/**
	 * Format streaming search results
	 */
	private formatStreamingResults(results: Array<{ name: string; score: number; category: string }>, limit: number): ResponseContent[] {
		return results
			.filter(result => result.score >= this.config.thresholds.minScore)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map(result => ({
				type: 'text' as const,
				text: `${result.name} (Score: ${result.score.toFixed(2)}, Category: ${result.category})`
			}));
	}

	/**
	 * Utility methods
	 */
	private validateParams(params: SearchParams): boolean {
		return !!(
			params &&
			typeof params.description === 'string' &&
			typeof params.usage === 'string' &&
			typeof params.category === 'string' &&
			typeof params.name === 'string' &&
			Array.isArray(params.tags)
		);
	}

	private generateCacheKey(params: SearchParams): string {
		return JSON.stringify({
			d: params.description,
			c: params.category,
			n: params.name,
			t: Array.isArray(params.tags) ? [...params.tags].sort() : [],
		});
	}

	private enhanceSearchParams(params: SearchParams): SearchParams {
		return {
			...params,
			description: SimilarityEngine.enrichQuery(params.description),
		};
	}

	private createBatches<T>(items: T[], batchSize: number): T[][] {
		const batches: T[][] = [];
		for (let i = 0; i < items.length; i += batchSize) {
			batches.push(items.slice(i, i + batchSize));
		}
		return batches;
	}
}
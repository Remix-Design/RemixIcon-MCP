import { ILogger } from '../../../infrastructure/logging/logger';
import { Result } from '../../../infrastructure/result/result';
import { SearchConfig, SearchParams } from '../types/search.types';
import { ICache } from './cache.service';
import { IQueryProcessor } from './query.service';
import { IScorer } from './scorer.service';

/**
 * Search service
 * Provides search functionality with caching and preprocessing
 */
export class SearchService {
	/**
	 * Creates a new search service
	 * @param scorer - Scorer for calculating search relevance
	 * @param cache - Cache for storing search results
	 * @param queryProcessor - Processor for enhancing search queries
	 * @param config - Search configuration
	 * @param logger - Logger instance
	 */
	constructor(
		private readonly scorer: IScorer,
		private readonly cache: ICache,
		private readonly queryProcessor: IQueryProcessor,
		private readonly config: SearchConfig,
		private readonly logger: ILogger
	) {}

	/**
	 * Performs a search with the given parameters
	 * @param params - Search parameters
	 * @returns Result containing the search score or an error
	 */
	async search(params: SearchParams): Promise<Result<number>> {
		try {
			this.logger.debug('Starting search', { params });

			if (!this.validateParams(params)) {
				return Result.failure(new Error('Invalid search parameters'));
			}

			const cacheKey = this.generateCacheKey(params);
			const cachedScore = this.cache.get(cacheKey);

			if (cachedScore !== undefined) {
				this.logger.debug('Cache hit', { cacheKey });
				return Result.success(cachedScore);
			}

			const processedParams = this.preprocessParams(params);
			const score = this.scorer.calculate(processedParams);

			this.cache.set(cacheKey, score);
			this.logger.debug('Search completed', { score });

			return Result.success(score);
		} catch (error) {
			this.logger.error('Search error', { error, params });
			return Result.failure(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Performs multiple searches in parallel
	 * @param paramsArray - Array of search parameters
	 * @returns Array of results for each search
	 */
	async batchSearch(paramsArray: SearchParams[]): Promise<Result<number>[]> {
		try {
			if (!Array.isArray(paramsArray) || paramsArray.length === 0) {
				return [];
			}

			this.logger.debug('Starting batch search', { count: paramsArray.length });

			// Split into chunks to avoid overwhelming the system
			const chunks = this.splitIntoChunks(paramsArray, 10);
			const results = await Promise.all(chunks.map((chunk) => Promise.all(chunk.map((params) => this.search(params)))));

			this.logger.debug('Batch search completed');
			return results.flat();
		} catch (error) {
			this.logger.error('Batch search error', { error });
			return paramsArray.map(() => Result.failure(error instanceof Error ? error : new Error(String(error))));
		}
	}

	/**
	 * Validates search parameters
	 * @param params - Parameters to validate
	 * @returns True if parameters are valid, false otherwise
	 * @private
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

	/**
	 * Generates a cache key for the given parameters
	 * @param params - Search parameters
	 * @returns Cache key string
	 * @private
	 */
	private generateCacheKey(params: SearchParams): string {
		return JSON.stringify({
			d: params.description,
			c: params.category,
			n: params.name,
			t: Array.isArray(params.tags) ? [...params.tags].sort() : [],
		});
	}

	/**
	 * Preprocesses search parameters
	 * @param params - Original search parameters
	 * @returns Processed search parameters
	 * @private
	 */
	private preprocessParams(params: SearchParams): SearchParams {
		return {
			...params,
			description: this.queryProcessor.processQuery(params.description),
		};
	}

	/**
	 * Splits an array into chunks of the specified size
	 * @param array - Array to split
	 * @param size - Maximum chunk size
	 * @returns Array of chunks
	 * @private
	 */
	private splitIntoChunks<T>(array: T[], size: number): T[][] {
		return array.reduce((chunks, item, index) => {
			const chunkIndex = Math.floor(index / size);
			if (!chunks[chunkIndex]) {
				chunks[chunkIndex] = [];
			}
			chunks[chunkIndex].push(item);
			return chunks;
		}, [] as T[][]);
	}
}

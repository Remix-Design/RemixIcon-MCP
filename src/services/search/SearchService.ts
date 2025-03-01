import { SearchConfig, SearchParams } from '../../types/search';
import { ILogger } from '../../utils/Logger';
import { Result } from '../../utils/Result';
import { ICache } from './CacheManager';
import { IQueryProcessor } from './QueryProcessor';
import { IScorer } from './SearchScorer';

export class SearchService {
	constructor(
		private readonly scorer: IScorer,
		private readonly cache: ICache,
		private readonly queryProcessor: IQueryProcessor,
		private readonly config: SearchConfig,
		private readonly logger: ILogger
	) {}

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

			return Result.success(score);
		} catch (error) {
			this.logger.error('Search error', { error, params });
			return Result.failure(error as Error);
		}
	}

	async batchSearch(paramsArray: SearchParams[]): Promise<Result<number>[]> {
		try {
			const chunks = this.splitIntoChunks(paramsArray, 10);
			const results = await Promise.all(chunks.map((chunk) => Promise.all(chunk.map((params) => this.search(params)))));
			return results.flat();
		} catch (error) {
			this.logger.error('Batch search error', { error });
			return paramsArray.map(() => Result.failure(error as Error));
		}
	}

	private validateParams(params: SearchParams): boolean {
		return !!(params.description && params.category && Array.isArray(params.tags));
	}

	private generateCacheKey(params: SearchParams): string {
		return JSON.stringify({
			d: params.description,
			c: params.category,
			n: params.name,
			t: params.tags.sort(),
		});
	}

	private preprocessParams(params: SearchParams): SearchParams {
		return {
			...params,
			description: this.queryProcessor.processQuery(params.description),
		};
	}

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

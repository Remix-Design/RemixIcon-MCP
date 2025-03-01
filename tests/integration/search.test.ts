import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SEARCH_CONFIG } from '../../src/domain/search/config';
import { SearchService } from '../../src/domain/search/services';
import { MultiLevelCache } from '../../src/domain/search/services/cache.service';
import { InvertedIndexService } from '../../src/domain/search/services/inverted-index.service';
import { QueryService } from '../../src/domain/search/services/query.service';
import { ScorerService } from '../../src/domain/search/services/scorer.service';
import { ConsoleLogger, LogLevel } from '../../src/infrastructure/logging/logger';

/**
 * Integration tests for the SearchService
 */
describe('SearchService Integration', () => {
	let searchService: SearchService;

	beforeAll(() => {
		const logger = new ConsoleLogger(LogLevel.ERROR);
		const cache = new MultiLevelCache(DEFAULT_SEARCH_CONFIG, logger);
		const queryProcessor = new QueryService(DEFAULT_SEARCH_CONFIG, logger);
		const scorer = new ScorerService(DEFAULT_SEARCH_CONFIG, logger);
		const invertedIndex = new InvertedIndexService(DEFAULT_SEARCH_CONFIG, logger);

		searchService = new SearchService(scorer, cache, queryProcessor, DEFAULT_SEARCH_CONFIG, logger, invertedIndex);
	});

	describe('search', () => {
		it('should return a valid score for search parameters', async () => {
			const result = await searchService.search({
				description: 'test search',
				usage: 'test usage',
				category: 'Test',
				name: 'test-icon',
				tags: ['test', 'icon'],
			});

			expect(result.success).toBe(true);
			expect(result.data).toBeGreaterThanOrEqual(0);
			expect(result.data).toBeLessThanOrEqual(1);
		});

		it('should handle invalid parameters', async () => {
			const result = await searchService.search(null as any);

			expect(result.success).toBe(false);
		});
	});

	describe('searchWithIndex', () => {
		it('should return an empty map when index is not built', () => {
			const results = searchService.searchWithIndex('test query');
			expect(results).toBeInstanceOf(Map);
			expect(results.size).toBe(0);
		});
	});
});

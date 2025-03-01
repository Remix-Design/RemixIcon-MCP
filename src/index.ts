import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';
import iconCatalog from './data/icon-catalog.json';
import { ResponseContent } from './domain/icon/types/icon.types';
import { DEFAULT_SEARCH_CONFIG } from './domain/search/config';
import { SearchService } from './domain/search/services';
import { MultiLevelCache } from './domain/search/services/cache.service';
import { InvertedIndexService } from './domain/search/services/inverted-index.service';
import { QueryService } from './domain/search/services/query.service';
import { ScorerService } from './domain/search/services/scorer.service';
import { ConsoleLogger, LogLevel } from './infrastructure/logging/logger';
import { TextProcessor } from './utils/text/text-processor';

/**
 * Main RemixIcon MCP implementation
 */
export default class RemixIconMCP extends WorkerEntrypoint<Env> {
	private searchService: SearchService;

	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		this.searchService = createSearchService();

		// Build search index
		this.searchService.buildIndex(iconCatalog.icons);
	}

	/**
	 * Find icons based on description with enhanced matching
	 * @param {string} description - The user's description to search for icons
	 * @returns {ResponseContent[]} Array of matching icons
	 */
	async findIcons(description: string): Promise<ResponseContent[]> {
		try {
			if (!description || typeof description !== 'string') {
				return [];
			}

			// 固定返回5个结果
			const resultLimit = 5;

			// Use inverted index for faster search
			const indexResults = this.searchService.searchWithIndex(description);

			// If we have enough results from the index, use them
			if (indexResults.size >= resultLimit) {
				const topResults = Array.from(indexResults.entries())
					.sort((a, b) => b[1] - a[1])
					.slice(0, resultLimit);

				return topResults.map(([name, score]) => {
					const icon = iconCatalog.icons.find((i) => i.name === name);
					return {
						type: 'text' as const,
						text: `${name} (Score: ${score.toFixed(2)}, Category: ${icon?.category || 'Unknown'})`,
					};
				});
			}

			// Fall back to standard search if index doesn't have enough results
			const scoredIcons = [];
			const categoryMatches = new Map<string, number>();
			let totalCategoryScore = 0;

			// Score calculation for all icons
			for (const icon of iconCatalog.icons) {
				const searchResult = await this.searchService.search({
					description,
					usage: icon.usage,
					category: icon.category,
					name: icon.name,
					tags: icon.tags,
				});

				if (!searchResult.success || !searchResult.data) continue;
				const score = searchResult.data;

				if (score >= DEFAULT_SEARCH_CONFIG.thresholds.minScore) {
					scoredIcons.push({
						name: icon.name,
						score,
						category: icon.category,
						termFrequency: 0,
						relevanceBoost: 1.0,
					});

					// Track category matches
					const currentScore = categoryMatches.get(icon.category) || 0;
					categoryMatches.set(icon.category, currentScore + score);
					totalCategoryScore += score;
				}
			}

			// Calculate category relevance
			const categoryRelevance = new Map(
				Array.from(categoryMatches.entries()).map(([category, score]) => [category, score / totalCategoryScore])
			);

			// Enhanced filtering and sorting
			const primaryResults = scoredIcons
				.filter((icon) => icon.score >= DEFAULT_SEARCH_CONFIG.thresholds.highScore)
				.sort((a, b) => b.score - a.score);

			const secondaryResults = scoredIcons
				.filter(
					(icon) =>
						icon.score >= DEFAULT_SEARCH_CONFIG.thresholds.secondaryResults && icon.score < DEFAULT_SEARCH_CONFIG.thresholds.highScore
				)
				.sort((a, b) => b.score - a.score);

			// Combine results with deduplication
			const selectedIcons = new Set<string>();
			const results: any[] = [];

			// Add primary results
			for (const icon of primaryResults) {
				if (selectedIcons.size >= resultLimit) break;
				if (!selectedIcons.has(icon.name)) {
					results.push(icon);
					selectedIcons.add(icon.name);
				}
			}

			// Add secondary results if needed
			if (selectedIcons.size < resultLimit) {
				for (const icon of secondaryResults) {
					if (selectedIcons.size >= resultLimit) break;
					if (!selectedIcons.has(icon.name)) {
						results.push(icon);
						selectedIcons.add(icon.name);
					}
				}
			}

			// Ensure we don't exceed the result limit (consistent with findIconsByCategory)
			return results.slice(0, resultLimit).map((icon) => ({
				type: 'text' as const,
				text: `${icon.name} (Score: ${icon.score.toFixed(2)}, Category: ${icon.category})`,
			}));
		} catch (error) {
			console.error('Error in findIcons:', error);
			return [];
		}
	}

	/**
	 * Get all available icon categories
	 * @returns {ResponseContent[]} Array of unique icon categories
	 */
	getIconCategories(): ResponseContent[] {
		try {
			const categories = new Set<string>();
			iconCatalog.icons.forEach((icon) => categories.add(icon.category));

			return Array.from(categories)
				.sort()
				.map((category) => ({
					type: 'text' as const,
					text: category,
				}));
		} catch (error) {
			console.error('Error in getIconCategories:', error);
			return [];
		}
	}

	/**
	 * Find icons in a specific category based on description
	 * @param {string} description - The search description
	 * @param {string} category - The category to search in
	 * @returns {ResponseContent[]} Array of matching icons in the specified category
	 */
	async findIconsByCategory(description: string, category: string): Promise<ResponseContent[]> {
		try {
			// Validate required parameters
			if (!description || typeof description !== 'string') {
				return [];
			}

			if (!category || typeof category !== 'string') {
				return [];
			}

			// 固定返回5个结果
			const resultLimit = 5;

			const normalizedDescription = TextProcessor.normalizeInput(description);
			const normalizedCategory = TextProcessor.normalizeInput(category);

			// Use inverted index for faster search
			const indexResults = this.searchService.searchCategoryWithIndex(description, category);

			// If we have enough results from the index, use them
			if (indexResults.size >= resultLimit) {
				const topResults = Array.from(indexResults.entries())
					.sort((a, b) => b[1] - a[1])
					.slice(0, resultLimit);

				return topResults.map(([name, score]) => {
					const icon = iconCatalog.icons.find((i) => i.name === name);
					return {
						type: 'text' as const,
						text: `${name} (Score: ${score.toFixed(2)}, Category: ${icon?.category || category})`,
					};
				});
			}

			// Fall back to standard search if index doesn't have enough results
			const scoredIcons = await Promise.all(
				iconCatalog.icons
					.filter((icon) => TextProcessor.normalizeInput(icon.category) === normalizedCategory)
					.map(async (icon) => {
						const usage = TextProcessor.normalizeInput(icon.usage);
						const name = TextProcessor.normalizeInput(icon.name);

						const searchResult = await this.searchService.search({
							description: normalizedDescription,
							usage,
							category,
							name,
							tags: icon.tags,
						});

						if (!searchResult.success || !searchResult.data) return null;

						return {
							name: icon.name,
							score: searchResult.data,
							termFrequency: 0,
							category: icon.category,
							relevanceBoost: 1.0,
						};
					})
			);

			const validIcons = scoredIcons
				.filter((icon): icon is NonNullable<typeof icon> => icon !== null && icon.score >= DEFAULT_SEARCH_CONFIG.thresholds.minScore)
				.sort((a, b) => b.score - a.score);

			return validIcons.slice(0, resultLimit).map((icon) => ({
				type: 'text' as const,
				text: `${icon.name} (Score: ${icon.score.toFixed(2)}, Category: ${icon.category})`,
			}));
		} catch (error) {
			console.error('Error in findIconsByCategory:', error);
			return [];
		}
	}

	/**
	 * @ignore
	 */
	async fetch(request: Request): Promise<Response> {
		return new ProxyToSelf(this).fetch(request);
	}
}

export function createSearchService(): SearchService {
	const logger = new ConsoleLogger(LogLevel.DEBUG);
	const cache = new MultiLevelCache(DEFAULT_SEARCH_CONFIG, logger);
	const queryProcessor = new QueryService(DEFAULT_SEARCH_CONFIG, logger);
	const scorer = new ScorerService(DEFAULT_SEARCH_CONFIG, logger);
	const invertedIndex = new InvertedIndexService(DEFAULT_SEARCH_CONFIG, logger);

	return new SearchService(scorer, cache, queryProcessor, DEFAULT_SEARCH_CONFIG, logger, invertedIndex);
}

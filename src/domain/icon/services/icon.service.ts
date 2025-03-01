import { ILogger } from '../../../infrastructure/logging/logger';
import { TextProcessor } from '../../../utils/text/text-processor';
import { SearchService } from '../../search/services/search.service';
import { IconCatalog, ResponseContent } from '../types/icon.types';

/**
 * Icon service
 * Provides functionality for searching and retrieving icons
 */
export class IconService {
	/**
	 * Default number of results to return
	 * @private
	 */
	private readonly DEFAULT_RESULT_LIMIT = 5;

	/**
	 * Creates a new icon service
	 * @param iconCatalog - Catalog of all available icons
	 * @param searchService - Search service for finding icons
	 * @param logger - Logger instance
	 */
	constructor(private readonly iconCatalog: IconCatalog, private readonly searchService: SearchService, private readonly logger: ILogger) {}

	/**
	 * Finds icons based on description
	 * @param description - The user's description to search for icons
	 * @returns Array of matching icons
	 */
	async findIcons(description: string): Promise<ResponseContent[]> {
		try {
			this.logger.debug('Finding icons', { description });

			if (!description || typeof description !== 'string') {
				return [];
			}

			const resultLimit = this.DEFAULT_RESULT_LIMIT;
			const scoredIcons = [];
			const categoryMatches = new Map<string, number>();
			let totalCategoryScore = 0;

			// Score calculation for all icons
			for (const icon of this.iconCatalog.icons) {
				const searchResult = await this.searchService.search({
					description,
					usage: icon.usage,
					category: icon.category,
					name: icon.name,
					tags: icon.tags,
				});

				if (!searchResult.success || !searchResult.data) continue;
				const score = searchResult.data;

				if (score >= 0.15) {
					// Using minimum score threshold
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
				Array.from(categoryMatches.entries()).map(([category, score]) => [category, score / (totalCategoryScore || 1)])
			);

			// Enhanced filtering and sorting
			const primaryResults = scoredIcons
				.filter((icon) => icon.score >= 0.75) // High score threshold
				.sort((a, b) => b.score - a.score);

			const secondaryResults = scoredIcons
				.filter(
					(icon) => icon.score >= 0.4 && icon.score < 0.75 // Secondary results threshold
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

			// Format results
			return results.slice(0, resultLimit).map((icon) => ({
				type: 'text' as const,
				text: `${icon.name} (Score: ${icon.score.toFixed(2)}, Category: ${icon.category})`,
			}));
		} catch (error) {
			this.logger.error('Error finding icons', { error, description });
			return [];
		}
	}

	/**
	 * Gets all available icon categories
	 * @returns Array of unique icon categories
	 */
	getIconCategories(): ResponseContent[] {
		try {
			const categories = new Set<string>();
			this.iconCatalog.icons.forEach((icon) => categories.add(icon.category));

			return Array.from(categories)
				.sort()
				.map((category) => ({
					type: 'text' as const,
					text: category,
				}));
		} catch (error) {
			this.logger.error('Error getting icon categories', { error });
			return [];
		}
	}

	/**
	 * Finds icons in a specific category based on description
	 * @param description - The search description
	 * @param category - The category to search in
	 * @returns Array of matching icons in the specified category
	 */
	async findIconsByCategory(description: string, category: string): Promise<ResponseContent[]> {
		try {
			this.logger.debug('Finding icons by category', { description, category });

			// Validate required parameters
			if (!description || typeof description !== 'string') {
				return [];
			}

			if (!category || typeof category !== 'string') {
				return [];
			}

			const resultLimit = this.DEFAULT_RESULT_LIMIT;
			const normalizedDescription = TextProcessor.normalizeInput(description);
			const normalizedCategory = TextProcessor.normalizeInput(category);

			const scoredIcons = await Promise.all(
				this.iconCatalog.icons
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
				.filter(
					(icon): icon is NonNullable<typeof icon> => icon !== null && icon.score >= 0.15 // Minimum score threshold
				)
				.sort((a, b) => b.score - a.score);

			return validIcons.slice(0, resultLimit).map((icon) => ({
				type: 'text' as const,
				text: `${icon.name} (Score: ${icon.score.toFixed(2)}, Category: ${icon.category})`,
			}));
		} catch (error) {
			this.logger.error('Error finding icons by category', { error, description, category });
			return [];
		}
	}
}

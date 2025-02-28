import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';
import { SEARCH_ENGINE_CONFIG } from './config';
import iconCatalog from './icon-catalog.json';
import { SearchService } from './services';
import { ResponseContent, ScoredIcon } from './types';
import { TextProcessor } from './utils';

/**
 * Main RemixIcon MCP implementation
 */
export default class RemixIconMCP extends WorkerEntrypoint<Env> {
	private searchService: SearchService;

	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		this.searchService = new SearchService();
	}

	/**
	 * Find icons based on user description with enhanced matching
	 * @param {string} description - The user's description to search for icons
	 * @returns {ResponseContent[]} Array of matching icons with their scores and categories
	 */
	findIcons(description: string): ResponseContent[] {
		if (!description || typeof description !== 'string') {
			return [];
		}

		const searchService = new SearchService();
		const scoredIcons = [];
		const categoryMatches = new Map<string, number>();
		let totalCategoryScore = 0;

		// Score calculation for all icons
		for (const icon of iconCatalog.icons) {
			const score = searchService.calculateSimilarityScore(description, icon.usage, icon.category, icon.name, icon.tags);

			if (score >= SEARCH_ENGINE_CONFIG.MIN_SCORE_THRESHOLD) {
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
			.filter((icon) => icon.score >= SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.HIGH_SCORE_THRESHOLD)
			.sort((a, b) => this.compareIcons(a, b, categoryRelevance));

		const secondaryResults = scoredIcons
			.filter(
				(icon) =>
					icon.score >= SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.SECONDARY_RESULTS_THRESHOLD &&
					icon.score < SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.HIGH_SCORE_THRESHOLD
			)
			.sort((a, b) => this.compareIcons(a, b, categoryRelevance));

		// Combine results with deduplication
		const selectedIcons = new Set<string>();
		const results: any[] = [];

		// Add primary results
		for (const icon of primaryResults) {
			if (selectedIcons.size >= SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.MAX_RESULTS) break;
			if (!selectedIcons.has(icon.name)) {
				results.push(icon);
				selectedIcons.add(icon.name);

				// Add similar icons if available
				const similarIcons = this.findSimilarIcons(icon, primaryResults);
				for (const similar of similarIcons) {
					if (selectedIcons.size < SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.MAX_RESULTS && !selectedIcons.has(similar.name)) {
						results.push(similar);
						selectedIcons.add(similar.name);
					}
				}
			}
		}

		// Add secondary results if needed
		if (selectedIcons.size < SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.MAX_RESULTS) {
			for (const icon of secondaryResults) {
				if (selectedIcons.size >= SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.MAX_RESULTS) break;
				if (!selectedIcons.has(icon.name)) {
					results.push(icon);
					selectedIcons.add(icon.name);
				}
			}
		}

		return this.formatResults(results);
	}

	/**
	 * Compare icons for sorting
	 * @param {ScoredIcon} a - First icon to compare
	 * @param {ScoredIcon} b - Second icon to compare
	 * @param {Map<string, number>} categoryRelevance - Map of category relevance scores
	 * @returns {number} Comparison result (-1, 0, or 1)
	 */
	private compareIcons(a: ScoredIcon, b: ScoredIcon, categoryRelevance: Map<string, number>): number {
		// Primary sort by score
		const scoreDiff = b.score - a.score;
		if (Math.abs(scoreDiff) > 0.1) {
			return scoreDiff;
		}

		// Secondary sort by category relevance
		const categoryDiff = (categoryRelevance.get(b.category) || 0) - (categoryRelevance.get(a.category) || 0);
		if (Math.abs(categoryDiff) > 0.1) {
			return categoryDiff;
		}

		// Final sort by name length
		return a.name.length - b.name.length;
	}

	/**
	 * Find similar icons based on name and category
	 * @param {ScoredIcon} icon - The reference icon to find similar ones for
	 * @param {ScoredIcon[]} icons - Array of icons to search through
	 * @returns {ScoredIcon[]} Array of similar icons
	 */
	private findSimilarIcons(icon: ScoredIcon, icons: ScoredIcon[]): ScoredIcon[] {
		return icons
			.filter(
				(other) =>
					other !== icon &&
					other.category === icon.category &&
					(other.name.includes(icon.name) || icon.name.includes(other.name)) &&
					other.score >= icon.score * SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.SIMILAR_ICON_THRESHOLD
			)
			.slice(0, SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.MAX_SIMILAR_ICONS);
	}

	/**
	 * Get all available icon categories
	 * @returns {ResponseContent[]} Array of unique icon categories
	 */
	getIconCategories(): ResponseContent[] {
		const categories = new Set<string>();
		iconCatalog.icons.forEach((icon) => categories.add(icon.category));

		return Array.from(categories)
			.sort()
			.map((category) => ({
				type: 'text' as const,
				text: category,
			}));
	}

	/**
	 * Find icons in a specific category based on description
	 * @param {string} description - The search description
	 * @param {string} category - The category to search in
	 * @param {number} [limit=3] - Maximum number of results to return
	 * @returns {ResponseContent[]} Array of matching icons in the specified category
	 * @throws {Error} If description or category is not provided
	 */
	findIconsByCategory(description: string, category: string, limit: number = 3): ResponseContent[] {
		if (!description || !category) {
			throw new Error('Description and category must be provided');
		}

		const normalizedDescription = TextProcessor.normalizeInput(description);
		const normalizedCategory = TextProcessor.normalizeInput(category);

		const scoredIcons = iconCatalog.icons
			.filter((icon) => TextProcessor.normalizeInput(icon.category) === normalizedCategory)
			.map((icon) => {
				const usage = TextProcessor.normalizeInput(icon.usage);
				const name = TextProcessor.normalizeInput(icon.name);
				const score = this.searchService.calculateSimilarityScore(normalizedDescription, usage, category, name, icon.tags);

				return {
					name: icon.name,
					score,
					termFrequency: 0,
					category: icon.category,
					relevanceBoost: 1.0,
				};
			})
			.filter((icon) => icon.score >= SEARCH_ENGINE_CONFIG.MIN_SCORE_THRESHOLD)
			.sort((a, b) => b.score - a.score);

		return this.formatResults(scoredIcons.slice(0, limit));
	}

	/**
	 * Calculate term frequency
	 * @param {string[]} searchTerms - Array of search terms
	 * @param {string[]} targetTerms - Array of terms to search in
	 * @returns {number} The frequency of search terms in target terms
	 */
	private calculateTermFrequency(searchTerms: string[], targetTerms: string[]): number {
		const searchSet = new Set(searchTerms);
		return targetTerms.filter((term) => searchSet.has(term)).length;
	}

	/**
	 * Format scored icons into response format
	 * @param {ScoredIcon[]} icons - Array of scored icons to format
	 * @returns {ResponseContent[]} Formatted icon results
	 */
	private formatResults(icons: ScoredIcon[]): ResponseContent[] {
		return icons.map((icon) => ({
			type: 'text' as const,
			text: `${icon.name} (Score: ${icon.score.toFixed(2)}, Category: ${icon.category})`,
		}));
	}

	/**
	 * @ignore
	 */
	async fetch(request: Request): Promise<Response> {
		return new ProxyToSelf(this).fetch(request);
	}
}

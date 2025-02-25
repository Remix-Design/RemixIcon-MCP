import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';
import iconCatalog from './remix-icon-catalog.json';

interface IconRecommendation {
	baseName: string;
	score: number;
}

interface IconInfo {
	baseName: string;
	category: string;
	style: string;
	usage: string;
}

interface ResponseContent {
	type: 'text';
	text: string;
}

interface SimilarityScore {
	algorithm: string;
	score: number;
	weight: number;
}

export default class RemixIconMCP extends WorkerEntrypoint<Env> {
	// Cache for common word stems and synonyms
	private static readonly commonWords = new Set(['icon', 'button', 'symbol', 'image', 'logo']);
	private static readonly synonymMap = new Map<string, string[]>([
		['play', ['start', 'begin', 'run']],
		['stop', ['end', 'halt', 'pause']],
		['delete', ['remove', 'trash', 'erase']],
		['add', ['plus', 'create', 'new']],
		['edit', ['modify', 'change', 'update']],
	]);

	/**
	 * Find icons based on user description
	 * @param description {string} User's description of the icon they need
	 * @return {Array<ResponseContent>} Top 3 recommended icons formatted as text content
	 */
	findIcons(description: string): ResponseContent[] {
		// Convert description to lowercase for case-insensitive matching
		const lowerDescription = description.toLowerCase();

		// Calculate similarity scores for each icon
		const scoredIcons = iconCatalog.icons.map((icon) => {
			const usage = icon.usage.toLowerCase();
			const category = icon.category.toLowerCase();

			// Calculate similarity score based on description matching usage and category
			let score = this.calculateSimilarityScore(lowerDescription, usage, category);

			return {
				baseName: icon.baseName,
				score: score,
			};
		});

		// Sort by score (descending) and take top 3
		const topIcons = scoredIcons.sort((a, b) => b.score - a.score).slice(0, 3);

		// Convert to the expected response format
		return topIcons.map((icon) => ({
			type: 'text' as const,
			text: `${icon.baseName} (Score: ${icon.score.toFixed(2)})`,
		}));
	}

	/**
	 * Get all available icon categories
	 * @return {Array<ResponseContent>} List of all unique icon categories formatted as text content
	 */
	getIconCategories(): ResponseContent[] {
		// Extract all categories and remove duplicates
		const categories = new Set<string>();

		iconCatalog.icons.forEach((icon) => {
			categories.add(icon.category);
		});

		// Convert to the expected response format
		return Array.from(categories)
			.sort()
			.map((category) => ({
				type: 'text' as const,
				text: category,
			}));
	}

	/**
	 * Search for icons in a specific category
	 * @param category {string} The category to search in
	 * @param limit {number} Maximum number of icons to return (default: 10)
	 * @return {Array<ResponseContent>} List of icons in the specified category formatted as text content
	 */
	searchIconsByCategory(category: string, limit: number = 10): ResponseContent[] {
		// Filter icons by the specified category
		const filteredIcons = iconCatalog.icons
			.filter((icon) => icon.category.toLowerCase() === category.toLowerCase())
			.map((icon) => ({
				baseName: icon.baseName,
				category: icon.category,
				style: icon.style,
				usage: icon.usage,
			}))
			.slice(0, limit);

		// Convert to the expected response format
		return filteredIcons.map((icon) => ({
			type: 'text' as const,
			text: `${icon.baseName} (${icon.style}) - ${icon.usage}`,
		}));
	}

	/**
	 * Calculate similarity score between user description and icon metadata using multiple algorithms
	 * @private
	 */
	private calculateSimilarityScore(description: string, usage: string, category: string): number {
		// Preprocess input strings
		const processedDesc = this.preprocessText(description);
		const processedUsage = this.preprocessText(usage);
		const processedCategory = this.preprocessText(category);

		// Calculate scores using different algorithms
		const scores: SimilarityScore[] = [
			{
				algorithm: 'jaccard',
				score: this.calculateJaccardSimilarity(processedDesc, processedUsage),
				weight: 0.25,
			},
			{
				algorithm: 'ngram',
				score: this.calculateNGramSimilarity(processedDesc, processedUsage, 2),
				weight: 0.2,
			},
			{
				algorithm: 'levenshtein',
				score: this.calculateLevenshteinSimilarity(processedDesc, processedUsage),
				weight: 0.15,
			},
			{
				algorithm: 'category',
				score: this.calculateCategoryScore(processedDesc, processedCategory),
				weight: 0.2,
			},
			{
				algorithm: 'semantic',
				score: this.calculateSemanticScore(processedDesc, processedUsage),
				weight: 0.2,
			},
		];

		// Dynamic weight adjustment based on input characteristics
		this.adjustWeights(scores, processedDesc, processedUsage);

		// Calculate weighted average
		const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
		const weightedSum = scores.reduce((sum, s) => sum + s.score * s.weight, 0);

		return Math.min(1, weightedSum / totalWeight);
	}

	/**
	 * Preprocess text for better comparison
	 * @private
	 */
	private preprocessText(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^\w\s-]/g, '') // Remove special characters except hyphen
			.replace(/\s+/g, ' ') // Normalize whitespace
			.trim();
	}

	/**
	 * Calculate Jaccard similarity between two strings with word stemming
	 * @private
	 */
	private calculateJaccardSimilarity(str1: string, str2: string): number {
		const words1 = new Set(this.getWordVariants(str1));
		const words2 = new Set(this.getWordVariants(str2));

		const intersection = new Set([...words1].filter((x) => words2.has(x)));
		const union = new Set([...words1, ...words2]);

		return intersection.size / union.size;
	}

	/**
	 * Get word variants including stems and synonyms
	 * @private
	 */
	private getWordVariants(text: string): string[] {
		const words = text.split(/\s+/);
		const variants = new Set<string>();

		for (const word of words) {
			// Add original word
			variants.add(word);

			// Add word stem (simple implementation)
			const stem = this.simpleStem(word);
			variants.add(stem);

			// Add synonyms
			const synonyms = RemixIconMCP.synonymMap.get(word) || [];
			synonyms.forEach((syn) => variants.add(syn));
		}

		return Array.from(variants);
	}

	/**
	 * Simple word stemming (can be replaced with a proper stemming library)
	 * @private
	 */
	private simpleStem(word: string): string {
		return word
			.replace(/(?:ing|ed|er|ment)$/, '') // Remove common suffixes
			.replace(/(?:s|es)$/, ''); // Remove plurals
	}

	/**
	 * Calculate N-gram similarity with optimized implementation
	 * @private
	 */
	private calculateNGramSimilarity(str1: string, str2: string, n: number): number {
		if (str1.length < n || str2.length < n) {
			return str1 === str2 ? 1 : 0;
		}

		const getNGrams = (str: string, n: number) => {
			const ngrams = new Map<string, number>();
			for (let i = 0; i <= str.length - n; i++) {
				const gram = str.slice(i, i + n);
				ngrams.set(gram, (ngrams.get(gram) || 0) + 1);
			}
			return ngrams;
		};

		const ngrams1 = getNGrams(str1, n);
		const ngrams2 = getNGrams(str2, n);

		let intersection = 0;
		for (const [gram, count1] of ngrams1) {
			const count2 = ngrams2.get(gram) || 0;
			intersection += Math.min(count1, count2);
		}

		const total1 = Array.from(ngrams1.values()).reduce((sum, count) => sum + count, 0);
		const total2 = Array.from(ngrams2.values()).reduce((sum, count) => sum + count, 0);

		return (2.0 * intersection) / (total1 + total2);
	}

	/**
	 * Calculate Levenshtein similarity
	 * @private
	 */
	private calculateLevenshteinSimilarity(str1: string, str2: string): number {
		if (str1 === str2) return 1;
		if (str1.length === 0) return 0;
		if (str2.length === 0) return 0;

		const matrix = Array(str2.length + 1)
			.fill(null)
			.map(() => Array(str1.length + 1).fill(0));

		for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
		for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

		for (let j = 1; j <= str2.length; j++) {
			for (let i = 1; i <= str1.length; i++) {
				const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
				matrix[j][i] = Math.min(
					matrix[j][i - 1] + 1, // deletion
					matrix[j - 1][i] + 1, // insertion
					matrix[j - 1][i - 1] + substitutionCost // substitution
				);
			}
		}

		const distance = matrix[str2.length][str1.length];
		const maxLength = Math.max(str1.length, str2.length);
		return 1 - distance / maxLength;
	}

	/**
	 * Calculate category match score with context awareness
	 * @private
	 */
	private calculateCategoryScore(description: string, category: string): number {
		if (description.includes(category)) return 1;

		const descWords = new Set(description.split(/\s+/));
		const categoryWords = new Set(category.split(/\s+/));

		let matchCount = 0;
		for (const word of descWords) {
			if (categoryWords.has(word) || [...categoryWords].some((catWord) => this.calculateLevenshteinSimilarity(word, catWord) > 0.8)) {
				matchCount++;
			}
		}

		return matchCount / Math.max(descWords.size, categoryWords.size);
	}

	/**
	 * Calculate semantic similarity using synonyms and context
	 * @private
	 */
	private calculateSemanticScore(description: string, usage: string): number {
		const descWords = description.split(/\s+/);
		const usageWords = usage.split(/\s+/);

		let matchScore = 0;
		for (const descWord of descWords) {
			if (RemixIconMCP.commonWords.has(descWord)) continue;

			let wordScore = 0;
			for (const usageWord of usageWords) {
				// Check direct match
				if (descWord === usageWord) {
					wordScore = Math.max(wordScore, 1);
					continue;
				}

				// Check synonyms
				const synonyms = RemixIconMCP.synonymMap.get(descWord) || [];
				if (synonyms.includes(usageWord)) {
					wordScore = Math.max(wordScore, 0.9);
					continue;
				}

				// Check partial match
				const similarity = this.calculateLevenshteinSimilarity(descWord, usageWord);
				wordScore = Math.max(wordScore, similarity);
			}
			matchScore += wordScore;
		}

		return matchScore / descWords.length;
	}

	/**
	 * Dynamically adjust weights based on input characteristics
	 * @private
	 */
	private adjustWeights(scores: SimilarityScore[], description: string, usage: string): void {
		const descLength = description.length;
		const usageLength = usage.length;

		// Adjust weights based on input length differences
		if (Math.abs(descLength - usageLength) > 10) {
			// Favor n-gram and semantic matching for very different lengths
			const ngramScore = scores.find((s) => s.algorithm === 'ngram');
			const semanticScore = scores.find((s) => s.algorithm === 'semantic');
			if (ngramScore) ngramScore.weight *= 1.2;
			if (semanticScore) semanticScore.weight *= 1.2;
		}

		// Boost exact matches for short inputs
		if (descLength < 10 && usageLength < 10) {
			const jaccardScore = scores.find((s) => s.algorithm === 'jaccard');
			if (jaccardScore) jaccardScore.weight *= 1.3;
		}

		// Normalize weights
		const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
		scores.forEach((s) => (s.weight = s.weight / totalWeight));
	}

	/**
	 * @ignore
	 **/
	async fetch(request: Request): Promise<Response> {
		return new ProxyToSelf(this).fetch(request);
	}
}

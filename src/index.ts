import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';
import iconCatalog from './remix-icon-catalog.json';

interface IconRecommendation {
	name: string;
	score: number;
}

interface IconInfo {
	name: string;
	category: string;
	style: string;
	usage: string;
}

interface ResponseContent {
	type: 'text';
	text: string;
}

interface SimilarityWeights {
	jaccard: number;
	ngram: number;
	category: number;
	exact: number;
	levenshtein: number;
	nameMatch: number;
}

export default class RemixIconMCP extends WorkerEntrypoint<Env> {
	// Maximum number of items to keep in cache
	private readonly MAX_CACHE_SIZE = 2000;

	// Minimum score threshold for results
	private readonly MIN_SCORE_THRESHOLD = 0.08;

	// Similarity weights for different algorithms
	private readonly weights: SimilarityWeights = {
		jaccard: 0.3,
		ngram: 0.15,
		category: 0.2,
		exact: 0.2,
		levenshtein: 0.05,
		nameMatch: 0.1,
	};

	// Cache for similarity calculations with LRU-like behavior
	private similarityCache: Map<string, number> = new Map();
	private cacheAccessOrder: string[] = [];

	/**
	 * Find icons based on user description
	 * @param description {string} User's description of the icon they need
	 * @return {Array<ResponseContent>} Top 3 recommended icons formatted as text content
	 */
	findIcons(description: string): ResponseContent[] {
		// Input validation
		if (!description || typeof description !== 'string') {
			throw new Error('Invalid description provided');
		}

		// Convert description to lowercase and normalize
		const lowerDescription = this.normalizeInput(description);

		// Calculate similarity scores for each icon
		const scoredIcons = iconCatalog.icons.map((icon) => {
			const usage = this.normalizeInput(icon.usage);
			const category = this.normalizeInput(icon.category);
			const name = this.normalizeInput(icon.name);

			// Generate cache key
			const cacheKey = `${lowerDescription}_${usage}_${category}_${name}`;

			// Check cache first
			let score = this.getCachedScore(cacheKey);
			if (score === undefined) {
				// Calculate similarity score if not in cache
				score = this.calculateSimilarityScore(lowerDescription, usage, category, name);
				this.setCachedScore(cacheKey, score);
			}

			return {
				name: icon.name,
				score: score,
			};
		});

		// Filter by minimum score and sort by score (descending)
		const topIcons = scoredIcons
			.filter((icon) => icon.score >= this.MIN_SCORE_THRESHOLD)
			.sort((a, b) => b.score - a.score)
			.slice(0, 3);

		// Convert to the expected response format
		return topIcons.map((icon) => ({
			type: 'text' as const,
			text: `${icon.name} (Score: ${icon.score.toFixed(2)})`,
		}));
	}

	/**
	 * Get cached similarity score with LRU update
	 * @private
	 */
	private getCachedScore(key: string): number | undefined {
		const score = this.similarityCache.get(key);
		if (score !== undefined) {
			// Update access order
			this.cacheAccessOrder = this.cacheAccessOrder.filter((k) => k !== key);
			this.cacheAccessOrder.push(key);
		}
		return score;
	}

	/**
	 * Set cached similarity score with size limit enforcement
	 * @private
	 */
	private setCachedScore(key: string, score: number): void {
		// Remove oldest entries if cache is full
		while (this.similarityCache.size >= this.MAX_CACHE_SIZE) {
			const oldestKey = this.cacheAccessOrder.shift();
			if (oldestKey) {
				this.similarityCache.delete(oldestKey);
			}
		}

		// Add new entry
		this.similarityCache.set(key, score);
		this.cacheAccessOrder.push(key);
	}

	/**
	 * Calculate similarity score between user description and icon metadata using multiple algorithms
	 * @private
	 */
	private calculateSimilarityScore(description: string, usage: string, category: string, name: string): number {
		// Quick exact match check for high-confidence matches
		if (description === usage || description === name) {
			return 1.0;
		}

		const scores: { [key: string]: number } = {
			jaccard: this.calculateJaccardSimilarity(description, usage),
			ngram: this.calculateNGramSimilarity(description, usage, 2),
			category: this.calculateCategoryScore(description, category),
			exact: this.calculateExactMatchScore(description, usage),
			levenshtein: this.calculateLevenshteinSimilarity(description, usage),
			nameMatch: this.calculateNameMatchScore(description, name),
		};

		// Apply boosting for high-confidence matches
		if (scores.exact > 0.8 || scores.nameMatch > 0.8) {
			return Math.min(1, scores.exact * 1.2);
		}

		// Calculate weighted sum
		let weightedSum = 0;
		let totalWeight = 0;

		for (const [key, weight] of Object.entries(this.weights)) {
			weightedSum += scores[key] * weight;
			totalWeight += weight;
		}

		// Normalize final score
		return Math.min(1, weightedSum / totalWeight);
	}

	/**
	 * Calculate category match score with partial matching
	 * @private
	 */
	private calculateCategoryScore(description: string, category: string): number {
		// Quick exact match check
		if (description === category) {
			return 1;
		}

		// Check for category as a whole phrase first
		if (description.includes(category)) {
			return 0.9; // High but not perfect score for substring match
		}

		// Check individual words
		const categoryWords = category.split(/\s+/);
		const descriptionWords = new Set(description.split(/\s+/));

		const matchingWords = categoryWords.filter((word) => descriptionWords.has(word));
		const partialScore = matchingWords.length / categoryWords.length;

		// Boost score if matching words are in sequence
		if (partialScore > 0 && description.includes(matchingWords.join(' '))) {
			return Math.min(1, partialScore * 1.2);
		}

		return partialScore;
	}

	/**
	 * Calculate name match score with improved partial matching
	 * @private
	 */
	private calculateNameMatchScore(description: string, name: string): number {
		// Remove common suffixes and split by separators
		const cleanName = name.replace(/-(?:fill|line)$/, '');
		const descWords = description.split(/\s+/);
		const nameWords = cleanName.split(/[-\s]+/);

		// Check for exact matches first
		const exactMatches = descWords.filter((word) => nameWords.includes(word));
		if (exactMatches.length > 0) {
			const exactScore = exactMatches.length / Math.max(descWords.length, nameWords.length);
			if (exactScore > 0.5) {
				return exactScore;
			}
		}

		// Check for partial matches
		let partialMatches = 0;
		for (const descWord of descWords) {
			for (const nameWord of nameWords) {
				if (nameWord.includes(descWord) || descWord.includes(nameWord)) {
					partialMatches++;
					break;
				}
			}
		}

		return partialMatches / Math.max(descWords.length, nameWords.length);
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
				name: icon.name,
			}))
			.slice(0, limit);

		// Convert to the expected response format
		return filteredIcons.map((icon) => ({
			type: 'text' as const,
			text: icon.name,
		}));
	}

	/**
	 * Calculate exact match score between two strings
	 * @private
	 */
	private calculateExactMatchScore(str1: string, str2: string): number {
		const words1 = new Set(str1.split(/\s+/));
		const words2 = new Set(str2.split(/\s+/));
		const exactMatches = [...words1].filter((word) => words2.has(word)).length;
		return exactMatches / Math.max(words1.size, words2.size);
	}

	/**
	 * Calculate Levenshtein distance based similarity
	 * @private
	 */
	private calculateLevenshteinSimilarity(str1: string, str2: string): number {
		const matrix: number[][] = [];

		// Initialize matrix
		for (let i = 0; i <= str1.length; i++) {
			matrix[i] = [i];
		}
		for (let j = 0; j <= str2.length; j++) {
			matrix[0][j] = j;
		}

		// Fill matrix
		for (let i = 1; i <= str1.length; i++) {
			for (let j = 1; j <= str2.length; j++) {
				if (str1[i - 1] === str2[j - 1]) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j - 1] + 1, // substitution
						matrix[i][j - 1] + 1, // insertion
						matrix[i - 1][j] + 1 // deletion
					);
				}
			}
		}

		// Convert distance to similarity score (0-1)
		const maxLength = Math.max(str1.length, str2.length);
		return 1 - matrix[str1.length][str2.length] / maxLength;
	}

	/**
	 * Normalize input string
	 * @private
	 */
	private normalizeInput(input: string): string {
		return input
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, '') // Remove special characters except hyphen
			.replace(/\s+/g, ' '); // Normalize whitespace
	}

	/**
	 * Calculate Jaccard similarity between two strings
	 * @private
	 */
	private calculateJaccardSimilarity(str1: string, str2: string): number {
		const set1 = new Set(str1.toLowerCase().split(/\s+/));
		const set2 = new Set(str2.toLowerCase().split(/\s+/));

		const intersection = new Set([...set1].filter((x) => set2.has(x)));
		const union = new Set([...set1, ...set2]);

		return intersection.size / union.size;
	}

	/**
	 * Calculate N-gram similarity between two strings
	 * @private
	 */
	private calculateNGramSimilarity(str1: string, str2: string, n: number): number {
		// Convert strings to lowercase for case-insensitive comparison
		str1 = str1.toLowerCase();
		str2 = str2.toLowerCase();

		// Generate n-grams for both strings
		const getNGrams = (str: string, n: number) => {
			const ngrams = new Set<string>();
			for (let i = 0; i <= str.length - n; i++) {
				ngrams.add(str.slice(i, i + n));
			}
			return ngrams;
		};

		const ngrams1 = getNGrams(str1, n);
		const ngrams2 = getNGrams(str2, n);

		// Calculate Dice coefficient
		const intersection = new Set([...ngrams1].filter((x) => ngrams2.has(x)));
		return (2.0 * intersection.size) / (ngrams1.size + ngrams2.size);
	}

	/**
	 * @ignore
	 **/
	async fetch(request: Request): Promise<Response> {
		return new ProxyToSelf(this).fetch(request);
	}
}

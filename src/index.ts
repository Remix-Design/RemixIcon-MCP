import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';
import iconCatalog from './icon-catalog.json';

interface IconRecommendation {
	name: string;
	score: number;
}

interface IconInfo {
	name: string;
	category: string;
	style: string;
	usage: string;
	tags: string[];
}

interface ResponseContent {
	type: 'text';
	text: string;
}

interface SimilarityWeights {
	cosine: number;
	category: number;
	tags: number;
	nameMatch: number;
}

export default class RemixIconMCP extends WorkerEntrypoint<Env> {
	// Maximum number of items to keep in cache
	private readonly MAX_CACHE_SIZE = 2000;

	// Minimum score threshold for results
	private readonly MIN_SCORE_THRESHOLD = 0.08;

	// Similarity weights for different algorithms
	private readonly weights: SimilarityWeights = {
		cosine: 0.4, // Main text similarity algorithm
		category: 0.2, // Category weight
		tags: 0.2, // Tags weight
		nameMatch: 0.2, // Name match weight
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
				score = this.calculateSimilarityScore(lowerDescription, usage, category, name, icon.tags);
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
	private calculateSimilarityScore(description: string, usage: string, category: string, name: string, tags: string[]): number {
		// Quick exact match check for high-confidence matches
		if (description === usage || description === name) {
			return 1.0;
		}

		const scores: { [key: string]: number } = {
			cosine: this.calculateCosineSimilarity(description, usage),
			category: this.calculateCategoryScore(description, category),
			tags: this.calculateTagsScore(description, tags || []),
			nameMatch: this.calculateNameMatchScore(description, name),
		};

		// Apply boosting for high-confidence name matches
		if (scores.nameMatch > 0.8) {
			return Math.min(1, scores.nameMatch * 1.2);
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
	 * Split text into words with improved Chinese handling
	 * @private
	 */
	private splitWords(text: string): string[] {
		// Split English words by spaces and hyphens
		const englishWords = text.split(/[-\s]+/);

		// For Chinese, use character-based and word-based splitting
		const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];

		// Extract potential Chinese words (2-3 characters)
		const chineseWords: string[] = [];
		for (let i = 0; i < text.length - 1; i++) {
			if (/[\u4e00-\u9fa5]/.test(text[i])) {
				// Add 2-character words
				if (/[\u4e00-\u9fa5]/.test(text[i + 1])) {
					chineseWords.push(text.slice(i, i + 2));
				}
				// Add 3-character words
				if (i < text.length - 2 && /[\u4e00-\u9fa5]/.test(text[i + 2])) {
					chineseWords.push(text.slice(i, i + 3));
				}
			}
		}

		return [...new Set([...englishWords, ...chineseChars, ...chineseWords])].filter((word) => word.length > 0);
	}

	/**
	 * Normalize input string while preserving Chinese characters
	 * @private
	 */
	private normalizeInput(input: string): string {
		return input
			.toLowerCase()
			.trim()
			.replace(/[^\w\s\u4e00-\u9fa5-]/g, ''); // Keep alphanumeric, spaces, hyphens and Chinese characters
	}

	/**
	 * Calculate cosine similarity between two strings
	 * Handles both English and Chinese text
	 * @private
	 */
	private calculateCosineSimilarity(str1: string, str2: string): number {
		// Get word vectors including Chinese characters
		const words1 = this.splitWords(str1);
		const words2 = this.splitWords(str2);

		// Create term frequency maps
		const tf1 = new Map<string, number>();
		const tf2 = new Map<string, number>();

		// Calculate term frequencies for str1
		words1.forEach((word) => {
			tf1.set(word, (tf1.get(word) || 0) + 1);
		});

		// Calculate term frequencies for str2
		words2.forEach((word) => {
			tf2.set(word, (tf2.get(word) || 0) + 1);
		});

		// Get unique terms
		const uniqueTerms = new Set([...tf1.keys(), ...tf2.keys()]);

		// Calculate dot product and magnitudes
		let dotProduct = 0;
		let magnitude1 = 0;
		let magnitude2 = 0;

		uniqueTerms.forEach((term) => {
			const freq1 = tf1.get(term) || 0;
			const freq2 = tf2.get(term) || 0;

			dotProduct += freq1 * freq2;
			magnitude1 += freq1 * freq1;
			magnitude2 += freq2 * freq2;
		});

		// Avoid division by zero
		if (magnitude1 === 0 || magnitude2 === 0) {
			return 0;
		}

		// Calculate cosine similarity
		return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
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
	 * Calculate name match score with improved partial matching and Chinese support
	 * @private
	 */
	private calculateNameMatchScore(description: string, name: string): number {
		// Remove common suffixes and split by separators
		const cleanName = name.replace(/-(?:fill|line)$/, '');
		const descWords = this.splitWords(description);
		const nameWords = this.splitWords(cleanName);

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
	 * Calculate category match score with partial matching and Chinese support
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

		// Check individual words including Chinese characters
		const categoryWords = this.splitWords(category);
		const descriptionWords = new Set(this.splitWords(description));

		const matchingWords = categoryWords.filter((word) => descriptionWords.has(word));
		const partialScore = matchingWords.length / categoryWords.length;

		// Boost score if matching words are in sequence
		if (partialScore > 0 && description.includes(matchingWords.join(''))) {
			return Math.min(1, partialScore * 1.2);
		}

		return partialScore;
	}

	/**
	 * Calculate similarity score between description and icon tags with improved Chinese support
	 * @private
	 */
	private calculateTagsScore(description: string, tags: string[]): number {
		if (!tags || tags.length === 0) {
			return 0;
		}

		const descWords = new Set(this.splitWords(description.toLowerCase()));
		const descChars = new Set([...description.toLowerCase()].filter((char) => /[\u4e00-\u9fa5]/.test(char)));

		let totalScore = 0;
		let maxTagScore = 0;

		for (const tag of tags) {
			const tagLower = tag.toLowerCase();
			const tagWords = this.splitWords(tagLower);
			const tagChars = new Set([...tagLower].filter((char) => /[\u4e00-\u9fa5]/.test(char)));

			// Calculate word-level match score
			const wordMatchCount = tagWords.filter((word) => descWords.has(word)).length;
			const wordScore = wordMatchCount / Math.max(tagWords.length, 1);

			// Calculate character-level match score for Chinese
			let charScore = 0;
			if (tagChars.size > 0 && descChars.size > 0) {
				const commonChars = [...tagChars].filter((char) => descChars.has(char)).length;
				charScore = commonChars / Math.max(tagChars.size, descChars.size);
			}

			// Calculate position-based score for exact matches
			let positionScore = 0;
			if (description.includes(tag)) {
				const position = description.indexOf(tag);
				positionScore = 1 - (position / description.length) * 0.5; // Earlier matches get higher scores
			}

			// Combine scores with weights
			const tagScore = Math.max(
				wordScore * 0.4 + charScore * 0.4 + positionScore * 0.2,
				description.toLowerCase().includes(tagLower) ? 0.9 : 0 // Boost for exact matches
			);

			totalScore += tagScore;
			maxTagScore = Math.max(maxTagScore, tagScore);
		}

		// Combine average score and best match score
		const avgScore = totalScore / tags.length;
		return Math.min(1, avgScore * 0.7 + maxTagScore * 0.3);
	}

	/**
	 * @ignore
	 **/
	async fetch(request: Request): Promise<Response> {
		return new ProxyToSelf(this).fetch(request);
	}
}

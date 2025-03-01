import { ILogger } from '../../../infrastructure/logging/logger';
import { SimilarityEngine } from '../../../utils/similarity/similarity';
import { SearchConfig, SearchParams, SearchScores } from '../types/search.types';

/**
 * Scorer interface for search scoring
 * Defines the contract for search scoring implementations
 */
export interface IScorer {
	/**
	 * Calculates the overall search score
	 * @param params - Search parameters
	 * @returns Overall search score between 0 and 1
	 */
	calculate(params: SearchParams): number;

	/**
	 * Calculates partial scores for different aspects of the search
	 * @param params - Search parameters
	 * @returns Object containing scores for different aspects
	 */
	calculatePartialScores(params: SearchParams): SearchScores;
}

/**
 * Search scorer service
 * Calculates search relevance scores based on various similarity metrics
 */
export class ScorerService implements IScorer {
	/**
	 * Creates a new search scorer
	 * @param config - Search configuration
	 * @param logger - Logger instance
	 */
	constructor(private readonly config: SearchConfig, private readonly logger: ILogger) {}

	/**
	 * Calculates the overall search score
	 * @param params - Search parameters
	 * @returns Overall search score between 0 and 1
	 */
	calculate(params: SearchParams): number {
		try {
			if (!this.validateParams(params)) {
				return 0;
			}

			const scores = this.calculatePartialScores(params);
			return this.combineScores(scores);
		} catch (error) {
			this.logger.error('Error calculating score', { error, params });
			return 0;
		}
	}

	/**
	 * Calculates partial scores for different aspects of the search
	 * @param params - Search parameters
	 * @returns Object containing scores for different aspects
	 */
	calculatePartialScores(params: SearchParams): SearchScores {
		return {
			cosine: this.calculateCosineSimilarity(params.description, params.usage),
			category: this.calculateCategoryScore(params.description, params.category),
			tags: this.calculateTagsScore(params.description, params.tags),
			nameMatch: this.calculateNameMatchScore(params.description, params.name),
			contextual: this.calculateContextualScore(params),
		};
	}

	/**
	 * Validates search parameters
	 * @param params - Search parameters to validate
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
	 * Combines partial scores into an overall score
	 * @param scores - Partial scores for different aspects
	 * @returns Combined score between 0 and 1
	 * @private
	 */
	private combineScores(scores: SearchScores): number {
		const { weights } = this.config;
		let totalScore = 0;
		let totalWeight = 0;

		for (const [key, score] of Object.entries(scores)) {
			const weight = weights[key as keyof typeof weights];
			if (weight) {
				totalScore += score * weight;
				totalWeight += weight;
			}
		}

		return Math.min(1, Math.max(0, totalWeight > 0 ? totalScore / totalWeight : 0));
	}

	/**
	 * Calculates cosine similarity between two strings
	 * @param str1 - First string
	 * @param str2 - Second string
	 * @returns Similarity score between 0 and 1
	 * @private
	 */
	private calculateCosineSimilarity(str1: string, str2: string): number {
		if (!str1 || !str2) {
			return 0;
		}

		return SimilarityEngine.calculateCosineSimilarity(str1, str2);
	}

	/**
	 * Calculates similarity between description and category
	 * @param description - Search description
	 * @param category - Icon category
	 * @returns Similarity score between 0 and 1
	 * @private
	 */
	private calculateCategoryScore(description: string, category: string): number {
		if (!description || !category) {
			return 0;
		}

		// Split description and category into words
		const descWords = description.toLowerCase().split(/\s+/);
		const categoryWords = category.toLowerCase().split(/[-_\s]+/);

		// Check for exact category match
		if (description.toLowerCase() === category.toLowerCase()) {
			return 1.0; // Perfect match
		}

		// Check if category is fully contained in description
		if (description.toLowerCase().includes(category.toLowerCase())) {
			return 0.95; // Very strong match - increased from 0.9
		}

		// Check if description is fully contained in category
		if (category.toLowerCase().includes(description.toLowerCase())) {
			return 0.85; // Strong match - increased from 0.8
		}

		// Special handling for specific categories
		const categoryLower = category.toLowerCase();
		if (
			categoryLower === 'communication' &&
			(description.toLowerCase().includes('message') ||
				description.toLowerCase().includes('chat') ||
				description.toLowerCase().includes('mail') ||
				description.toLowerCase().includes('talk'))
		) {
			return 0.9; // Strong match for communication-related terms
		}

		if (
			categoryLower === 'media' &&
			(description.toLowerCase().includes('play') ||
				description.toLowerCase().includes('video') ||
				description.toLowerCase().includes('audio') ||
				description.toLowerCase().includes('music'))
		) {
			return 0.9; // Strong match for media-related terms
		}

		// Check for word-level matches with improved scoring
		const wordMatches = categoryWords.filter((catWord) =>
			descWords.some((descWord) => descWord === catWord || descWord.includes(catWord) || catWord.includes(descWord))
		);

		if (wordMatches.length > 0) {
			// Calculate match ratio (how many category words match)
			const matchRatio = wordMatches.length / categoryWords.length;
			// Apply progressive boost based on match ratio - increased boost factor
			return Math.min(0.8, 0.45 + matchRatio * 0.6); // Increased from 0.75, 0.4, 0.5
		}

		// Fall back to comprehensive similarity with a boost
		const baseSimilarity = SimilarityEngine.calculateComprehensiveSimilarity(description, category);
		return baseSimilarity * 1.3; // Increased boost from 1.2
	}

	/**
	 * Calculates similarity between description and tags
	 * @param description - Search description
	 * @param tags - Icon tags
	 * @returns Similarity score between 0 and 1
	 * @private
	 */
	private calculateTagsScore(description: string, tags: string[]): number {
		if (!description || !tags || tags.length === 0) {
			return 0;
		}

		// Split description into words for better matching
		const descWords = description.toLowerCase().split(/\s+/);

		// Calculate similarity for each tag with enhanced matching
		const tagScores = tags.map((tag) => {
			// Base similarity using comprehensive similarity
			const baseSimilarity = SimilarityEngine.calculateComprehensiveSimilarity(description, tag);

			// Check for exact matches in the description
			if (description.toLowerCase() === tag.toLowerCase()) {
				return Math.min(1.0, baseSimilarity * 2.5); // Significant boost for exact matches
			}

			// Check for inclusion in the description
			if (description.toLowerCase().includes(tag.toLowerCase())) {
				return Math.min(1.0, baseSimilarity * 1.8); // Strong boost for inclusion
			}

			// Check for word-level matches
			const tagWords = tag.toLowerCase().split(/[-_\s]+/);
			const wordMatches = tagWords.filter((tagWord) =>
				descWords.some((descWord) => descWord.includes(tagWord) || tagWord.includes(descWord))
			);

			if (wordMatches.length > 0) {
				// Apply progressive boost based on number of matching words
				const wordMatchBoost = 1.2 + 0.15 * wordMatches.length;
				return Math.min(1.0, baseSimilarity * wordMatchBoost);
			}

			return baseSimilarity;
		});

		// Get the top 3 most relevant tag scores with higher weight for best matches
		const sortedScores = tagScores.sort((a, b) => b - a);
		const topScores = sortedScores.slice(0, 3);

		if (topScores.length === 0) return 0;

		// Apply weighted average with higher weight for best matches
		if (topScores.length === 1) return topScores[0];
		if (topScores.length === 2) return topScores[0] * 0.7 + topScores[1] * 0.3;
		return topScores[0] * 0.6 + topScores[1] * 0.25 + topScores[2] * 0.15;
	}

	/**
	 * Calculates similarity between description and icon name
	 * @param description - Search description
	 * @param name - Icon name
	 * @returns Similarity score between 0 and 1
	 * @private
	 */
	private calculateNameMatchScore(description: string, name: string): number {
		if (!description || !name) {
			return 0;
		}

		const similarity = SimilarityEngine.calculateComprehensiveSimilarity(description, name);

		// Apply additional boosts for name matches
		const normalizedDesc = description.toLowerCase();
		const normalizedName = name.toLowerCase();

		let boost = 1.0;

		// Boost for exact matches
		if (normalizedDesc === normalizedName) {
			boost = 2.0;
		}
		// Boost for partial matches
		else if (normalizedDesc.includes(normalizedName) || normalizedName.includes(normalizedDesc)) {
			boost = 1.5;
		}
		// Boost for word matches
		else {
			const descWords = normalizedDesc.split(/\s+/);
			const nameWords = normalizedName.split(/[-_\s]+/);
			const commonWords = descWords.filter((word) => nameWords.some((nameWord) => nameWord.includes(word)));
			if (commonWords.length > 0) {
				boost = 1.2 + 0.1 * commonWords.length;
			}
		}

		return Math.min(1, similarity * boost);
	}

	/**
	 * Calculates contextual relevance score
	 * @param params - Search parameters
	 * @returns Contextual relevance score between 0 and 1
	 * @private
	 */
	private calculateContextualScore(params: SearchParams): number {
		const { description, category, tags, name, usage } = params;

		if (!description || !category || !tags) {
			return 0;
		}

		const categoryScore = this.calculateCategoryScore(description, category);
		const tagsScore = this.calculateTagsScore(description, tags);
		const nameScore = this.calculateNameMatchScore(description, name);
		const usageScore = this.calculateUsageScore(description, usage);

		// Enhanced weighting system
		const weights = {
			category: 0.25, // Increased category weight
			tags: 0.25, // Increased tags weight
			name: 0.35, // Highest weight for name matches
			usage: 0.15, // Reduced usage weight
		};

		// Calculate weighted score
		const totalScore = categoryScore * weights.category + tagsScore * weights.tags + nameScore * weights.name + usageScore * weights.usage;

		// Apply additional context boost
		const contextBoost = this.calculateContextBoost(params);

		return Math.min(1, totalScore * contextBoost);
	}

	/**
	 * Calculates a context-based boost factor
	 * @param params - Search parameters
	 * @returns Boost factor between 1.0 and 1.5
	 * @private
	 */
	private calculateContextBoost(params: SearchParams): number {
		const { description, category, tags, name } = params;

		let boost = 1.0;

		// Boost for category relevance
		if (description.toLowerCase().includes(category.toLowerCase())) {
			boost += 0.1;
		}

		// Boost for tag matches
		const descWords = description.toLowerCase().split(/\s+/);
		const tagMatches = tags.filter((tag) => descWords.some((word) => tag.toLowerCase().includes(word))).length;

		if (tagMatches > 0) {
			boost += Math.min(0.2, tagMatches * 0.05);
		}

		// Boost for name relevance
		if (
			name
				.toLowerCase()
				.split(/[-_\s]+/)
				.some((part) => descWords.includes(part.toLowerCase()))
		) {
			boost += 0.1;
		}

		return Math.min(1.5, boost);
	}

	private calculateUsageScore(usage: string, targetUsage: string): number {
		if (!usage || !targetUsage) {
			return 0;
		}
		return SimilarityEngine.calculateComprehensiveSimilarity(usage, targetUsage);
	}
}

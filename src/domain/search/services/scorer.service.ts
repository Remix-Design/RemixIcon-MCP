import { ILogger } from '../../../infrastructure/logging/logger';
import { SimilarityEngine } from '../../../utils/similarity/similarity';
import { SEMANTIC_GROUPS } from '../config/semantic.config';
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
			semantic: this.calculateSemanticScore(params),
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
			totalScore += score * weight;
			totalWeight += weight;
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

		const descWords = description.toLowerCase().split(/\s+/);
		const catWords = category.toLowerCase().split(/\s+/);

		let maxScore = 0;
		for (const descWord of descWords) {
			for (const catWord of catWords) {
				const similarity = SimilarityEngine.calculateNormalizedEditDistance(descWord, catWord);
				maxScore = Math.max(maxScore, similarity);
			}
		}

		return maxScore;
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

		const descWords = description.toLowerCase().split(/\s+/);
		let totalScore = 0;

		for (const tag of tags) {
			const tagWords = tag.toLowerCase().split(/\s+/);
			let tagScore = 0;

			for (const descWord of descWords) {
				for (const tagWord of tagWords) {
					const similarity = SimilarityEngine.calculateNormalizedEditDistance(descWord, tagWord);
					tagScore = Math.max(tagScore, similarity);
				}
			}

			totalScore += tagScore;
		}

		return totalScore / tags.length;
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

		const descWords = description.toLowerCase().split(/\s+/);
		const nameWords = name.toLowerCase().split(/\s+/);

		if (descWords.length === 0 || nameWords.length === 0) {
			return 0;
		}

		let totalScore = 0;
		for (const descWord of descWords) {
			for (const nameWord of nameWords) {
				totalScore += SimilarityEngine.calculateNormalizedEditDistance(descWord, nameWord);
			}
		}

		return totalScore / (descWords.length * nameWords.length);
	}

	/**
	 * Calculates semantic similarity based on semantic groups
	 * @param params - Search parameters
	 * @returns Semantic similarity score between 0 and 1
	 * @private
	 */
	private calculateSemanticScore(params: SearchParams): number {
		const { description } = params;

		if (!description) {
			return 0;
		}

		const descWords = description.toLowerCase().split(/\s+/);

		if (descWords.length === 0) {
			return 0;
		}

		let totalScore = 0;
		let maxGroupScore = 0;

		// Iterate through each semantic group
		for (const group of Object.values(SEMANTIC_GROUPS)) {
			let groupScore = 0;

			// 1. Direct word matching
			for (const descWord of descWords) {
				let wordScore = 0;
				// Check each word in the group
				for (const semanticWord of group.words) {
					const similarity = SimilarityEngine.calculateNormalizedEditDistance(descWord, semanticWord.word);
					wordScore = Math.max(wordScore, similarity * (semanticWord.weight || 1.0));
				}
				groupScore += wordScore;
			}

			// 2. Related word matching
			for (const descWord of descWords) {
				let relatedScore = 0;
				for (const relatedWord of group.related) {
					const similarity = SimilarityEngine.calculateNormalizedEditDistance(descWord, relatedWord);
					relatedScore = Math.max(relatedScore, similarity * 0.8); // Related words have slightly lower weight
				}
				groupScore += relatedScore;
			}

			// 3. Icon type matching
			if (group.iconTypes) {
				for (const descWord of descWords) {
					let iconScore = 0;
					for (const iconType of group.iconTypes) {
						const similarity = SimilarityEngine.calculateNormalizedEditDistance(descWord, iconType);
						iconScore = Math.max(iconScore, similarity * 0.9); // Icon types have medium weight
					}
					groupScore += iconScore;
				}
			}

			// Apply group weight and metadata priority
			const priorityBoost = group.metadata?.priority ? group.metadata.priority / 5 : 1;
			groupScore *= group.weight * priorityBoost;

			// Update highest score
			maxGroupScore = Math.max(maxGroupScore, groupScore);
			totalScore += groupScore;
		}

		// Combined score: consider highest group score and overall score
		const semanticGroupCount = Object.keys(SEMANTIC_GROUPS).length;
		const normalizedScore = semanticGroupCount > 0 ? (maxGroupScore * 0.7 + (totalScore / semanticGroupCount) * 0.3) / descWords.length : 0;

		// Ensure score is between 0 and 1
		return Math.min(1, Math.max(0, normalizedScore));
	}

	/**
	 * Calculates contextual relevance score
	 * @param params - Search parameters
	 * @returns Contextual relevance score between 0 and 1
	 * @private
	 */
	private calculateContextualScore(params: SearchParams): number {
		const { description, category, tags } = params;

		if (!description || !category || !tags) {
			return 0;
		}

		const descWords = description.toLowerCase().split(/\s+/);

		if (descWords.length === 0) {
			return 0;
		}

		const contextWords = new Set([...category.toLowerCase().split(/\s+/), ...tags.map((tag) => tag.toLowerCase())]);

		let totalScore = 0;
		for (const word of descWords) {
			let maxScore = 0;
			for (const contextWord of contextWords) {
				const similarity = SimilarityEngine.calculateNormalizedEditDistance(word, contextWord);
				maxScore = Math.max(maxScore, similarity);
			}
			totalScore += maxScore;
		}

		return totalScore / descWords.length;
	}
}

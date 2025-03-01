import { TextProcessor } from '../text/text-processor';
import { SemanticVectors } from './semantic-vectors';

/**
 * Similarity engine
 * Provides methods for calculating text similarity using various algorithms
 */
export class SimilarityEngine {
	/**
	 * Calculates length of common prefix between two strings
	 * @param str1 - First string
	 * @param str2 - Second string
	 * @returns Length of common prefix
	 */
	static commonPrefixLength(str1: string, str2: string): number {
		if (!str1 || !str2) {
			return 0;
		}

		let i = 0;
		while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
			i++;
		}
		return i;
	}

	/**
	 * Calculates similarity based on character n-grams
	 * @param str1 - First string
	 * @param str2 - Second string
	 * @param n - Size of n-grams
	 * @returns Similarity score between 0 and 1
	 */
	static calculateNGramSimilarity(str1: string, str2: string, n: number = 2): number {
		if (!str1 || !str2) {
			return 0;
		}

		if (str1 === str2) {
			return 1;
		}

		// Normalize inputs
		str1 = TextProcessor.normalizeInput(str1);
		str2 = TextProcessor.normalizeInput(str2);

		// Generate n-grams for different sizes
		const ngrams1_2 = new Set(this.generateNGrams(str1, 2));
		const ngrams2_2 = new Set(this.generateNGrams(str2, 2));
		const ngrams1_3 = new Set(this.generateNGrams(str1, 3));
		const ngrams2_3 = new Set(this.generateNGrams(str2, 3));

		// Calculate intersection and union for both n-gram sizes
		const intersection2 = new Set([...ngrams1_2].filter((x) => ngrams2_2.has(x)));
		const union2 = new Set([...ngrams1_2, ...ngrams2_2]);
		const intersection3 = new Set([...ngrams1_3].filter((x) => ngrams2_3.has(x)));
		const union3 = new Set([...ngrams1_3, ...ngrams2_3]);

		// Calculate weighted average of similarities
		const sim2 = union2.size > 0 ? intersection2.size / union2.size : 0;
		const sim3 = union3.size > 0 ? intersection3.size / union3.size : 0;

		return sim2 * 0.4 + sim3 * 0.6;
	}

	/**
	 * Generates n-grams from a string
	 * @param str - Input string
	 * @param n - Size of n-grams
	 * @returns Array of n-grams
	 * @private
	 */
	private static generateNGrams(str: string, n: number): string[] {
		if (str.length < n) {
			return [str];
		}

		const ngrams = [];
		for (let i = 0; i <= str.length - n; i++) {
			ngrams.push(str.slice(i, i + n));
		}
		return ngrams;
	}

	/**
	 * Calculates cosine similarity between two strings
	 * @param str1 - First string
	 * @param str2 - Second string
	 * @returns Similarity score between 0 and 1
	 */
	static calculateCosineSimilarity(str1: string, str2: string): number {
		if (!str1 || !str2) {
			return 0;
		}

		// Check for exact match
		if (str1.toLowerCase() === str2.toLowerCase()) {
			return 1.0;
		}

		const words1 = TextProcessor.splitIntoWords(str1);
		const words2 = TextProcessor.splitIntoWords(str2);

		if (words1.length === 0 || words2.length === 0) {
			return 0;
		}

		// Create term frequency maps
		const freqMap1 = TextProcessor.calculateWordFrequency(str1);
		const freqMap2 = TextProcessor.calculateWordFrequency(str2);

		// Calculate dot product with fuzzy matching and n-gram similarity
		let dotProduct = 0;
		let magnitude1 = 0;
		let magnitude2 = 0;

		// Enhanced word matching with semantic similarity
		for (const word1 of freqMap1.keys()) {
			const freq1 = freqMap1.get(word1) || 0;
			magnitude1 += freq1 * freq1;

			// Find best matching word in str2
			let bestMatch = 0;
			for (const word2 of freqMap2.keys()) {
				// Calculate multiple similarity metrics
				const editSimilarity = this.calculateNormalizedEditDistance(word1, word2);
				const ngramSimilarity = this.calculateNGramSimilarity(word1, word2);
				const semanticSimilarity = SemanticVectors.calculateSemanticSimilarity(word1, word2);

				// Weighted combination of similarity metrics
				const similarity = editSimilarity * 0.3 + ngramSimilarity * 0.3 + semanticSimilarity * 0.4;

				// Improved threshold for matching
				if (similarity > 0.35) {
					const freq2 = freqMap2.get(word2) || 0;
					// Enhanced matching bonus with progressive scaling
					let matchBonus = 1.0;

					// Exact word match gets highest boost
					if (word1 === word2) {
						matchBonus = 1.5;
					}
					// Partial match gets medium boost
					else if (word1.includes(word2) || word2.includes(word1)) {
						matchBonus = 1.3;
					}
					// Semantic match gets small boost
					else if (semanticSimilarity > 0.5) {
						matchBonus = 1.2;
					}

					bestMatch = Math.max(bestMatch, freq1 * freq2 * similarity * matchBonus);
				}
			}
			dotProduct += bestMatch;
		}

		for (const word2 of freqMap2.keys()) {
			const freq2 = freqMap2.get(word2) || 0;
			magnitude2 += freq2 * freq2;
		}

		if (magnitude1 === 0 || magnitude2 === 0) {
			return 0;
		}

		// Apply length normalization to reduce bias towards longer strings
		const lengthRatio = Math.min(words1.length, words2.length) / Math.max(words1.length, words2.length);
		const lengthBoost = 0.8 + 0.2 * lengthRatio; // Length similarity factor

		const similarity = dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
		return Math.min(1, similarity * lengthBoost * 1.25); // Apply length normalization and boost
	}

	/**
	 * Calculates Jaccard similarity between two strings
	 * @param str1 - First string
	 * @param str2 - Second string
	 * @returns Similarity score between 0 and 1
	 */
	static calculateJaccardSimilarity(str1: string, str2: string): number {
		if (!str1 || !str2) {
			return 0;
		}

		const words1 = new Set(TextProcessor.splitIntoWords(str1));
		const words2 = new Set(TextProcessor.splitIntoWords(str2));

		if (words1.size === 0 || words2.size === 0) {
			return 0;
		}

		// Calculate intersection with fuzzy matching
		let intersectionCount = 0;
		for (const word1 of words1) {
			for (const word2 of words2) {
				if (word1 === word2 || this.calculateNormalizedEditDistance(word1, word2) > 0.5) {
					intersectionCount++;
					break;
				}
			}
		}

		const union = new Set([...words1, ...words2]);
		return intersectionCount / union.size;
	}

	/**
	 * Calculates normalized edit distance (Levenshtein) between two strings
	 * @param str1 - First string
	 * @param str2 - Second string
	 * @returns Similarity score between 0 and 1
	 */
	static calculateNormalizedEditDistance(str1: string, str2: string): number {
		if (!str1 || !str2) {
			return 0;
		}

		if (str1 === str2) {
			return 1;
		}

		// Optimization: Use dynamic programming for edit distance calculation
		const len1 = str1.length;
		const len2 = str2.length;

		// Early termination for very different length strings
		if (Math.abs(len1 - len2) > Math.min(len1, len2) * 0.5) {
			return 0;
		}

		// Initialize matrix with only two rows to save memory
		let prevRow = Array(len2 + 1).fill(0);
		let currRow = Array(len2 + 1).fill(0);

		// Initialize first row
		for (let j = 0; j <= len2; j++) {
			prevRow[j] = j;
		}

		// Fill the matrix
		for (let i = 1; i <= len1; i++) {
			currRow[0] = i;

			for (let j = 1; j <= len2; j++) {
				const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
				currRow[j] = Math.min(
					prevRow[j] + 1, // deletion
					currRow[j - 1] + 1, // insertion
					prevRow[j - 1] + cost // substitution
				);
			}

			// Swap rows
			[prevRow, currRow] = [currRow, prevRow];
		}

		// Normalize the distance (prevRow contains the final results after the swap)
		const maxLen = Math.max(len1, len2);
		return maxLen === 0 ? 1 : 1 - prevRow[len2] / maxLen;
	}

	/**
	 * Calculates word overlap similarity between two strings
	 * @param str1 - First string
	 * @param str2 - Second string
	 * @returns Similarity score between 0 and 1
	 */
	static calculateWordOverlapSimilarity(str1: string, str2: string): number {
		if (!str1 || !str2) {
			return 0;
		}

		const words1 = TextProcessor.splitIntoWords(str1);
		const words2 = TextProcessor.splitIntoWords(str2);

		if (words1.length === 0 || words2.length === 0) {
			return 0;
		}

		// Count matching words with fuzzy matching
		let matchCount = 0;
		for (const word1 of words1) {
			for (const word2 of words2) {
				if (word1 === word2 || this.calculateNormalizedEditDistance(word1, word2) > 0.5) {
					matchCount++;
					break;
				}
			}
		}

		return matchCount / Math.max(words1.length, words2.length);
	}

	/**
	 * Calculates comprehensive similarity between two strings
	 * Combines multiple similarity measures for better results
	 * @param str1 - First string
	 * @param str2 - Second string
	 * @returns Similarity score between 0 and 1
	 */
	static calculateComprehensiveSimilarity(str1: string, str2: string): number {
		if (!str1 || !str2) {
			return 0;
		}

		if (str1 === str2) {
			return 1;
		}

		// Calculate different similarity measures
		const cosineSim = this.calculateCosineSimilarity(str1, str2);
		const editSim = this.calculateNormalizedEditDistance(str1, str2);
		const ngramSim = this.calculateNGramSimilarity(str1, str2);
		const jaccardSim = this.calculateJaccardSimilarity(str1, str2);
		const semanticSim = SemanticVectors.calculateSemanticSimilarity(str1, str2);

		// Weighted average of similarities
		return cosineSim * 0.25 + editSim * 0.15 + ngramSim * 0.15 + jaccardSim * 0.15 + semanticSim * 0.3;
	}

	/**
	 * Enriches a query with semantic information
	 * @param query - Original query
	 * @returns Enriched query with semantic information
	 */
	static enrichQuery(query: string): string {
		if (!query) return '';

		return SemanticVectors.enrichText(query);
	}
}

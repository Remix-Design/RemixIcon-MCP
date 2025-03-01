import { TextProcessor } from '../text/text-processor';

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
		const sim2 = intersection2.size / union2.size;
		const sim3 = intersection3.size / union3.size;

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

		for (const word1 of freqMap1.keys()) {
			const freq1 = freqMap1.get(word1) || 0;
			magnitude1 += freq1 * freq1;

			// Find best matching word in str2
			let bestMatch = 0;
			for (const word2 of freqMap2.keys()) {
				const editSimilarity = this.calculateNormalizedEditDistance(word1, word2);
				const ngramSimilarity = this.calculateNGramSimilarity(word1, word2);
				const similarity = Math.max(editSimilarity, ngramSimilarity);

				if (similarity > 0.4) {
					const freq2 = freqMap2.get(word2) || 0;
					const matchBonus = word1 === word2 ? 1.2 : 1.0; // Boost exact matches
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

		const similarity = dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
		return Math.min(1, similarity * 1.2); // Boost similarity slightly
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

		// Calculate Levenshtein distance
		const len1 = str1.length;
		const len2 = str2.length;
		const matrix: number[][] = Array(len1 + 1)
			.fill(null)
			.map(() => Array(len2 + 1).fill(0));

		// Initialize first row and column
		for (let i = 0; i <= len1; i++) {
			matrix[i][0] = i;
		}

		for (let j = 0; j <= len2; j++) {
			matrix[0][j] = j;
		}

		// Fill the matrix
		for (let i = 1; i <= len1; i++) {
			for (let j = 1; j <= len2; j++) {
				const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
				matrix[i][j] = Math.min(
					matrix[i - 1][j] + 1, // deletion
					matrix[i][j - 1] + 1, // insertion
					matrix[i - 1][j - 1] + cost // substitution
				);
			}
		}

		// Normalize the distance
		const maxLen = Math.max(len1, len2);
		return maxLen === 0 ? 1 : 1 - matrix[len1][len2] / maxLen;
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

		// Use a more lenient normalization factor
		const normalizationFactor = Math.max(words1.length, words2.length);
		return matchCount / normalizationFactor;
	}

	/**
	 * Calculates a comprehensive similarity score combining multiple metrics
	 * @param str1 - First string
	 * @param str2 - Second string
	 * @returns Combined similarity score between 0 and 1
	 */
	static calculateComprehensiveSimilarity(str1: string, str2: string): number {
		if (!str1 || !str2) {
			return 0;
		}

		if (str1 === str2) {
			return 1;
		}

		// Calculate individual similarity scores
		const cosineSim = this.calculateCosineSimilarity(str1, str2);
		const jaccardSim = this.calculateJaccardSimilarity(str1, str2);
		const ngramSim = this.calculateNGramSimilarity(str1, str2);
		const overlapSim = this.calculateWordOverlapSimilarity(str1, str2);

		// Calculate prefix bonus
		const prefixLength = this.commonPrefixLength(TextProcessor.normalizeInput(str1), TextProcessor.normalizeInput(str2));
		const prefixBonus = prefixLength > 0 ? prefixLength / Math.max(str1.length, str2.length) : 0;

		// Calculate exact word match bonus
		const words1 = new Set(TextProcessor.splitIntoWords(str1));
		const words2 = new Set(TextProcessor.splitIntoWords(str2));
		const exactMatches = [...words1].filter((w) => words2.has(w)).length;
		const exactMatchBonus = exactMatches > 0 ? exactMatches / Math.max(words1.size, words2.size) : 0;

		// Weighted combination of scores
		const combinedScore =
			cosineSim * 0.3 + jaccardSim * 0.2 + ngramSim * 0.2 + overlapSim * 0.1 + prefixBonus * 0.1 + exactMatchBonus * 0.1;

		// Apply length penalty for very short matches
		const shortestLength = Math.min(str1.length, str2.length);
		const lengthPenalty = shortestLength < 3 ? 0.5 : 1;

		// Boost score for very similar strings
		const finalScore = combinedScore * lengthPenalty;
		return Math.min(1, finalScore * 1.2); // Apply final boost with cap at 1.0
	}
}

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

		const ngrams1 = new Set(this.generateNGrams(str1, n));
		const ngrams2 = new Set(this.generateNGrams(str2, n));

		if (ngrams1.size === 0 || ngrams2.size === 0) {
			return 0;
		}

		const intersection = new Set([...ngrams1].filter((x) => ngrams2.has(x)));
		const union = new Set([...ngrams1, ...ngrams2]);

		return intersection.size / union.size;
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

		// Get all unique words
		const uniqueWords = new Set([...freqMap1.keys(), ...freqMap2.keys()]);

		// Calculate dot product
		let dotProduct = 0;
		let magnitude1 = 0;
		let magnitude2 = 0;

		for (const word of uniqueWords) {
			const freq1 = freqMap1.get(word) || 0;
			const freq2 = freqMap2.get(word) || 0;

			dotProduct += freq1 * freq2;
			magnitude1 += freq1 * freq1;
			magnitude2 += freq2 * freq2;
		}

		// Calculate cosine similarity
		if (magnitude1 === 0 || magnitude2 === 0) {
			return 0;
		}

		return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
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

		// Calculate intersection and union
		const intersection = new Set([...words1].filter((word) => words2.has(word)));
		const union = new Set([...words1, ...words2]);

		return intersection.size / union.size;
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

		// Count matching words
		let matchCount = 0;
		for (const word1 of words1) {
			for (const word2 of words2) {
				if (word1 === word2 || this.calculateNormalizedEditDistance(word1, word2) > 0.8) {
					matchCount++;
					break;
				}
			}
		}

		// Normalize by the length of the shorter string
		return matchCount / Math.min(words1.length, words2.length);
	}
}

/**
 * Core similarity calculation engine
 */
export class SimilarityEngine {
	/**
	 * Calculates length of common prefix between two strings
	 */
	static commonPrefixLength(str1: string, str2: string): number {
		let i = 0;
		while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
			i++;
		}
		return i;
	}

	/**
	 * Calculates similarity based on character n-grams
	 */
	static calculateNGramSimilarity(str1: string, str2: string, n: number): number {
		const ngrams1 = new Set(this.generateNGrams(str1, n));
		const ngrams2 = new Set(this.generateNGrams(str2, n));

		const intersection = new Set([...ngrams1].filter((x) => ngrams2.has(x)));
		const union = new Set([...ngrams1, ...ngrams2]);

		return intersection.size / union.size;
	}

	/**
	 * Generates n-grams from a string
	 */
	private static generateNGrams(str: string, n: number): string[] {
		const ngrams = [];
		for (let i = 0; i <= str.length - n; i++) {
			ngrams.push(str.slice(i, i + n));
		}
		return ngrams;
	}

	/**
	 * Calculates normalized edit distance score
	 */
	static calculateNormalizedEditDistance(str1: string, str2: string): number {
		const distance = this.calculateLevenshteinDistance(str1, str2);
		const maxLength = Math.max(str1.length, str2.length);
		return 1 - distance / maxLength;
	}

	/**
	 * Calculates Levenshtein distance between two strings
	 */
	private static calculateLevenshteinDistance(str1: string, str2: string): number {
		const m = str1.length;
		const n = str2.length;
		const dp: number[][] = Array(m + 1)
			.fill(0)
			.map(() => Array(n + 1).fill(0));

		for (let i = 0; i <= m; i++) dp[i][0] = i;
		for (let j = 0; j <= n; j++) dp[0][j] = j;

		for (let i = 1; i <= m; i++) {
			for (let j = 1; j <= n; j++) {
				if (str1[i - 1] === str2[j - 1]) {
					dp[i][j] = dp[i - 1][j - 1];
				} else {
					dp[i][j] = Math.min(
						dp[i - 1][j] + 1, // deletion
						dp[i][j - 1] + 1, // insertion
						dp[i - 1][j - 1] + 1 // substitution
					);
				}
			}
		}

		return dp[m][n];
	}
}

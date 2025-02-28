import { SEMANTIC_GROUPS } from '../config';
import { SemanticGroup } from '../types';
import { TextProcessor } from '../utils';

/**
 * Helper class for semantic group operations
 */
export class SemanticService {
	/**
	 * Check if a word belongs to a semantic group
	 */
	static hasWord(group: SemanticGroup, word: string): boolean {
		return group.words.some((w) => (typeof w === 'string' ? w === word : w.word === word || w.aliases?.includes(word)));
	}

	/**
	 * Find semantic group for a word with enhanced matching
	 */
	static findSemanticGroup(word: string): string | null {
		const lowerWord = word.toLowerCase();

		for (const [group, config] of Object.entries(SEMANTIC_GROUPS)) {
			// Check direct matches
			if (config.words.some((w) => (typeof w === 'string' ? w === lowerWord : w.word === lowerWord))) {
				return group;
			}

			// Check for partial matches with similarity threshold
			for (const wordObj of config.words) {
				const wordText = typeof wordObj === 'string' ? wordObj : wordObj.word;
				if (this.calculateWordSimilarity(lowerWord, wordText) > 0.85) {
					return group;
				}
			}
		}

		return null;
	}

	/**
	 * Calculate word similarity with enhanced matching algorithms
	 */
	private static calculateWordSimilarity(word1: string, word2: string): number {
		word1 = word1.toLowerCase();
		word2 = word2.toLowerCase();

		// Exact match check
		if (word1 === word2) return 1.0;

		// Word stem match
		const stem1 = TextProcessor.getWordStem(word1);
		const stem2 = TextProcessor.getWordStem(word2);
		if (stem1 === stem2) {
			return word1.length === word2.length ? 1.0 : 0.95;
		}

		// Calculate similarity based on length and common characters
		const commonLength = this.commonPrefixLength(word1, word2);
		const maxLength = Math.max(word1.length, word2.length);

		return commonLength / maxLength;
	}

	/**
	 * Calculate length of common prefix between two strings
	 */
	private static commonPrefixLength(str1: string, str2: string): number {
		let i = 0;
		while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
			i++;
		}
		return i;
	}
}

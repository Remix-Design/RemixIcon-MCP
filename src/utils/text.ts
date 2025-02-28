/**
 * Utility functions for text processing and normalization
 */
export class TextProcessor {
	/**
	 * Normalizes input string by converting to lowercase and removing special characters
	 * @param input - String to normalize
	 * @returns Normalized string
	 */
	static normalizeInput(input: string): string {
		return input
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, '');
	}

	/**
	 * Splits text into words
	 * @param text - Text to split
	 * @returns Array of words
	 */
	static splitWords(text: string): string[] {
		return text
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.split(/[\s-]+/)
			.filter((word) => word.length > 0);
	}

	/**
	 * Gets word stem (basic implementation)
	 * @param word - Word to get stem for
	 * @returns Word stem
	 */
	static getWordStem(word: string): string {
		const suffixes = ['ing', 'ed', 'er', 'ers', 'tion', 'ions', 'ies', 'es', 's'];
		let stem = word.toLowerCase();

		for (const suffix of suffixes) {
			if (stem.endsWith(suffix)) {
				const newStem = stem.slice(0, -suffix.length);
				if (newStem.length >= 3) {
					stem = newStem;
					break;
				}
			}
		}
		return stem;
	}
}

/**
 * Text processor utility
 * Provides text normalization and processing functions
 */
export class TextProcessor {
	/**
	 * Normalizes input text by converting to lowercase, trimming, and removing extra spaces
	 * @param input - Text to normalize
	 * @returns Normalized text
	 */
	static normalizeInput(input: string): string {
		if (!input || typeof input !== 'string') {
			return '';
		}

		return input.toLowerCase().trim().replace(/\s+/g, ' ');
	}

	/**
	 * Removes special characters from text
	 * @param input - Text to process
	 * @returns Text without special characters
	 */
	static removeSpecialChars(input: string): string {
		if (!input || typeof input !== 'string') {
			return '';
		}

		return input.replace(/[^\w\s]/gi, '');
	}

	/**
	 * Splits text into words
	 * @param input - Text to split
	 * @returns Array of words
	 */
	static splitIntoWords(input: string): string[] {
		if (!input || typeof input !== 'string') {
			return [];
		}

		return this.normalizeInput(input)
			.split(/\s+/)
			.filter((word) => word.length > 0);
	}

	/**
	 * Checks if a text contains a specific word
	 * @param text - Text to check
	 * @param word - Word to find
	 * @returns True if the text contains the word, false otherwise
	 */
	static containsWord(text: string, word: string): boolean {
		if (!text || !word || typeof text !== 'string' || typeof word !== 'string') {
			return false;
		}

		const normalizedText = this.normalizeInput(text);
		const normalizedWord = this.normalizeInput(word);
		const words = normalizedText.split(/\s+/);

		return words.includes(normalizedWord);
	}

	/**
	 * Calculates word frequency in text
	 * @param text - Text to analyze
	 * @returns Map of words to their frequency
	 */
	static calculateWordFrequency(text: string): Map<string, number> {
		if (!text || typeof text !== 'string') {
			return new Map();
		}

		const words = this.splitIntoWords(text);
		const frequency = new Map<string, number>();

		for (const word of words) {
			const count = frequency.get(word) || 0;
			frequency.set(word, count + 1);
		}

		return frequency;
	}

	/**
	 * Gets word stem (basic implementation)
	 * @param word - Word to get stem for
	 * @returns Word stem
	 */
	static getWordStem(word: string): string {
		if (!word || typeof word !== 'string') {
			return '';
		}

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

	/**
	 * Removes stopwords from text
	 * @param text - Text to process
	 * @returns Text with stopwords removed
	 */
	static removeStopwords(text: string): string {
		if (!text || typeof text !== 'string') {
			return '';
		}

		const stopwords = new Set([
			'a',
			'an',
			'the',
			'and',
			'or',
			'but',
			'is',
			'are',
			'was',
			'were',
			'be',
			'been',
			'being',
			'in',
			'on',
			'at',
			'to',
			'for',
			'with',
			'by',
			'about',
			'against',
			'between',
			'into',
			'through',
			'during',
			'before',
			'after',
			'above',
			'below',
			'from',
			'up',
			'down',
			'of',
			'off',
			'over',
			'under',
			'again',
			'further',
			'then',
			'once',
			'here',
			'there',
			'when',
			'where',
			'why',
			'how',
			'all',
			'any',
			'both',
			'each',
			'few',
			'more',
			'most',
			'other',
			'some',
			'such',
			'no',
			'nor',
			'not',
			'only',
			'own',
			'same',
			'so',
			'than',
			'too',
			'very',
			'can',
			'will',
			'just',
			'should',
			'now',
		]);

		return this.splitIntoWords(text)
			.filter((word) => !stopwords.has(word))
			.join(' ');
	}
}

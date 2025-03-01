import { ILogger } from '../../../infrastructure/logging/logger';
import { SEMANTIC_GROUPS, SYNONYM_GROUPS, SYNONYM_MAP } from '../config/semantic.config';
import { SearchConfig } from '../types/search.types';

/**
 * Query processor interface
 * Defines the contract for query processing implementations
 */
export interface IQueryProcessor {
	/**
	 * Processes a search query to enhance search results
	 * @param query - The original search query
	 * @returns The processed query with expansions and normalizations
	 */
	processQuery(query: string): string;

	/**
	 * Splits a complex query into meaningful parts
	 * @param query - The query to split
	 * @returns Array of query parts
	 */
	splitComplexQuery(query: string): string[];
}

/**
 * Query processor service
 * Handles query normalization, expansion, and splitting
 */
export class QueryService implements IQueryProcessor {
	/**
	 * Creates a new query processor
	 * @param config - Search configuration
	 * @param logger - Logger instance
	 */
	constructor(private readonly config: SearchConfig, private readonly logger: ILogger) {}

	/**
	 * Processes a search query to enhance search results
	 * @param query - The original search query
	 * @returns The processed query with expansions and normalizations
	 */
	processQuery(query: string): string {
		try {
			if (!query || typeof query !== 'string') {
				return '';
			}

			const normalizedQuery = this.normalizeQuery(query);
			const expandedQuery = this.expandWithSynonyms(normalizedQuery);
			return expandedQuery;
		} catch (error) {
			this.logger.error('Error processing query', { error, query });
			return query;
		}
	}

	/**
	 * Splits a complex query into meaningful parts
	 * @param query - The query to split
	 * @returns Array of query parts
	 */
	splitComplexQuery(query: string): string[] {
		if (!query || typeof query !== 'string') {
			return [];
		}

		// Split by explicit conjunctions
		if (query.includes(' and ') || query.includes(' or ')) {
			return query
				.toLowerCase()
				.split(/\s+(?:and|or)\s+/)
				.map((part) => part.trim())
				.filter((part) => part.length > 0);
		}

		// Split into meaningful phrases based on semantic groups
		return this.splitIntoMeaningfulPhrases(query);
	}

	/**
	 * Normalizes a query by converting to lowercase and trimming
	 * @param query - The query to normalize
	 * @returns Normalized query
	 * @private
	 */
	private normalizeQuery(query: string): string {
		return query.toLowerCase().trim();
	}

	/**
	 * Expands a query with synonyms and related terms
	 * @param query - The normalized query
	 * @returns Expanded query with synonyms
	 * @private
	 */
	private expandWithSynonyms(query: string): string {
		const words = query.split(/\s+/);
		const expandedWords = new Set<string>();

		// Add original words to ensure they're included
		words.forEach((word) => expandedWords.add(word));

		for (const word of words) {
			// 1. Check semantic group matches
			for (const group of Object.values(SEMANTIC_GROUPS)) {
				// Check if word is in group words with high similarity
				const matchedWord = group.words.find((w) => this.calculateWordSimilarity(w.word, word) > 0.8);

				if (matchedWord) {
					// Add related terms from the group
					group.related.forEach((r) => expandedWords.add(r));

					// Add other high-weight words from the group
					group.words.filter((w) => w.weight && w.weight >= 1.5).forEach((w) => expandedWords.add(w.word));

					// Add icon types if available
					group.iconTypes?.forEach((t) => expandedWords.add(t));
				}
			}

			// 2. Check direct synonym mappings
			if (SYNONYM_MAP[word]) {
				SYNONYM_MAP[word].forEach((synonym) => expandedWords.add(synonym));
			}

			// 3. Check synonym groups
			for (const [groupKey, synonyms] of Object.entries(SYNONYM_GROUPS)) {
				if (synonyms.includes(word)) {
					synonyms.forEach((s) => expandedWords.add(s));
				}
			}
		}

		return Array.from(expandedWords).join(' ');
	}

	/**
	 * Splits a query into meaningful phrases based on semantic groups
	 * @param query - The query to split
	 * @returns Array of meaningful phrases
	 * @private
	 */
	private splitIntoMeaningfulPhrases(query: string): string[] {
		const words = query.toLowerCase().split(/\s+/);
		const phrases: string[] = [];
		let currentPhrase: string[] = [];

		for (let i = 0; i < words.length; i++) {
			const word = words[i];
			currentPhrase.push(word);

			// Check if current phrase matches a semantic group
			const phraseStr = currentPhrase.join(' ');
			let foundMatch = false;

			// Check against semantic groups
			for (const group of Object.values(SEMANTIC_GROUPS)) {
				if (group.words.some((w) => w.word.includes(phraseStr))) {
					phrases.push(currentPhrase.join(' '));
					currentPhrase = [];
					foundMatch = true;
					break;
				}
			}

			// Handle the last word
			if (i === words.length - 1 && currentPhrase.length > 0) {
				phrases.push(currentPhrase.join(' '));
			}
		}

		return phrases.length > 0 ? phrases : [query];
	}

	/**
	 * Calculates similarity between two words
	 * @param word1 - First word
	 * @param word2 - Second word
	 * @returns Similarity score between 0 and 1
	 * @private
	 */
	private calculateWordSimilarity(word1: string, word2: string): number {
		if (!word1 || !word2) {
			return 0;
		}

		if (word1 === word2) return 1;
		if (word1.includes(word2) || word2.includes(word1)) return 0.8;

		// Calculate Levenshtein distance
		const len1 = word1.length;
		const len2 = word2.length;
		const matrix: number[][] = Array(len1 + 1)
			.fill(0)
			.map(() => Array(len2 + 1).fill(0));

		// Initialize first row and column
		for (let i = 0; i <= len1; i++) matrix[i][0] = i;
		for (let j = 0; j <= len2; j++) matrix[0][j] = j;

		// Fill the matrix
		for (let i = 1; i <= len1; i++) {
			for (let j = 1; j <= len2; j++) {
				const cost = word1[i - 1] === word2[j - 1] ? 0 : 1;
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
}

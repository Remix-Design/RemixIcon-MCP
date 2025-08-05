/**
 * Inverted index service
 * Provides efficient search capabilities through pre-built indexes
 */

import { ILogger } from '../../../infrastructure/logging/logger';
import { TextProcessor } from '../../../utils/text/text-processor';
import { IconMetadata } from '../../icon/types/icon.types';
import { SearchConfig } from '../types/search.types';

/**
 * Interface for inverted index operations
 */
export interface IInvertedIndex {
	/**
	 * Builds the index from icon metadata
	 * @param icons - Array of icon metadata to index
	 */
	buildIndex(icons: IconMetadata[]): void;

	/**
	 * Searches the index for matching icons
	 * @param query - Search query
	 * @returns Array of matching icon IDs with their relevance scores
	 */
	search(query: string): Map<string, number>;

	/**
	 * Searches within a specific category
	 * @param query - Search query
	 * @param category - Category to search within
	 * @returns Array of matching icon IDs with their relevance scores
	 */
	searchByCategory(query: string, category: string): Map<string, number>;

	/**
	 * Gets the complete search index for serialization
	 * @returns Combined search index
	 */
	getIndex(): Map<string, string[]>;
}

/**
 * Term frequency data structure
 */
interface TermFrequency {
	[iconName: string]: number;
}

/**
 * Inverted index implementation
 * Uses pre-built indexes for efficient searching
 */
export class InvertedIndexService implements IInvertedIndex {
	// Main inverted index: term -> {iconName -> frequency}
	private nameIndex: Map<string, TermFrequency> = new Map();
	private categoryIndex: Map<string, TermFrequency> = new Map();
	private tagIndex: Map<string, TermFrequency> = new Map();
	private usageIndex: Map<string, TermFrequency> = new Map();

	// Category mapping for faster filtering
	private categoryMap: Map<string, Set<string>> = new Map();

	// Icon metadata cache for quick access
	private iconMetadataMap: Map<string, IconMetadata> = new Map();

	/**
	 * Creates a new inverted index service
	 * @param config - Search configuration
	 * @param logger - Logger instance
	 */
	constructor(private readonly config: SearchConfig, private readonly logger: ILogger) {}

	/**
	 * Builds the index from icon metadata
	 * @param icons - Array of icon metadata to index
	 */
	buildIndex(icons: IconMetadata[]): void {
		this.logger.debug('Building inverted index', { iconCount: icons.length });

		// Clear existing indexes
		this.nameIndex.clear();
		this.categoryIndex.clear();
		this.tagIndex.clear();
		this.usageIndex.clear();
		this.categoryMap.clear();
		this.iconMetadataMap.clear();

		// Process each icon
		for (const icon of icons) {
			// Store icon metadata for quick access
			this.iconMetadataMap.set(icon.name, icon);

			// Add to category map
			const normalizedCategory = TextProcessor.normalizeInput(icon.category);
			if (!this.categoryMap.has(normalizedCategory)) {
				this.categoryMap.set(normalizedCategory, new Set());
			}
			this.categoryMap.get(normalizedCategory)?.add(icon.name);

			// Index name
			this.indexField(icon.name, icon.name, this.nameIndex);

			// Index category
			this.indexField(icon.category, icon.name, this.categoryIndex);

			// Index usage
			this.indexField(icon.usage, icon.name, this.usageIndex);

			// Index tags
			this.indexTags(icon.tags, icon.name);
		}

		this.logger.debug('Inverted index built successfully', {
			nameTerms: this.nameIndex.size,
			categoryTerms: this.categoryIndex.size,
			tagTerms: this.tagIndex.size,
			usageTerms: this.usageIndex.size,
		});
	}

	/**
	 * Searches the index for matching icons
	 * @param query - Search query
	 * @returns Map of icon names to relevance scores
	 */
	search(query: string): Map<string, number> {
		try {
			const normalizedQuery = TextProcessor.normalizeInput(query);
			const queryTerms = TextProcessor.splitIntoWords(normalizedQuery);

			if (queryTerms.length === 0) {
				return new Map();
			}

			// Calculate scores for each icon
			const scores = new Map<string, number>();

			// Search in each index with different weights
			this.searchInIndex(queryTerms, this.nameIndex, scores, this.config.weights.nameMatch);
			this.searchInIndex(queryTerms, this.categoryIndex, scores, this.config.weights.category);
			this.searchInIndex(queryTerms, this.tagIndex, scores, this.config.weights.tags);
			this.searchInIndex(queryTerms, this.usageIndex, scores, this.config.weights.cosine);

			// Filter out low scores
			for (const [iconName, score] of scores.entries()) {
				if (score < this.config.thresholds.minScore) {
					scores.delete(iconName);
				}
			}

			return scores;
		} catch (error) {
			this.logger.error('Error searching inverted index', { error, query });
			return new Map();
		}
	}

	/**
	 * Searches within a specific category
	 * @param query - Search query
	 * @param category - Category to search within
	 * @returns Map of icon names to relevance scores
	 */
	searchByCategory(query: string, category: string): Map<string, number> {
		try {
			const normalizedQuery = TextProcessor.normalizeInput(query);
			const normalizedCategory = TextProcessor.normalizeInput(category);
			const queryTerms = TextProcessor.splitIntoWords(normalizedQuery);

			if (queryTerms.length === 0) {
				return new Map();
			}

			// Get icons in the specified category
			const categoryIcons = this.categoryMap.get(normalizedCategory);
			if (!categoryIcons || categoryIcons.size === 0) {
				return new Map();
			}

			// Calculate scores for each icon
			const scores = new Map<string, number>();

			// Search in each index with different weights
			this.searchInIndexFiltered(queryTerms, this.nameIndex, scores, this.config.weights.nameMatch, categoryIcons);
			this.searchInIndexFiltered(queryTerms, this.tagIndex, scores, this.config.weights.tags, categoryIcons);
			this.searchInIndexFiltered(queryTerms, this.usageIndex, scores, this.config.weights.cosine, categoryIcons);

			// Filter out low scores
			for (const [iconName, score] of scores.entries()) {
				if (score < this.config.thresholds.minScore) {
					scores.delete(iconName);
				}
			}

			return scores;
		} catch (error) {
			this.logger.error('Error searching inverted index by category', { error, query, category });
			return new Map();
		}
	}

	/**
	 * Indexes a field into the specified index
	 * @param field - Field value to index
	 * @param iconName - Icon name
	 * @param index - Target index
	 * @private
	 */
	private indexField(field: string, iconName: string, index: Map<string, TermFrequency>): void {
		const normalizedField = TextProcessor.normalizeInput(field);
		const terms = TextProcessor.splitIntoWords(normalizedField);

		// Add each term to the index
		for (const term of terms) {
			if (!index.has(term)) {
				index.set(term, {});
			}

			const termFreq = index.get(term)!;
			termFreq[iconName] = (termFreq[iconName] || 0) + 1;
		}
	}

	/**
	 * Indexes tags with enhanced processing
	 * @param tags - Array of tags to index
	 * @param iconName - Icon name
	 * @private
	 */
	private indexTags(tags: string[], iconName: string): void {
		// Process each tag
		for (const tag of tags) {
			// Index the original tag
			this.indexField(tag, iconName, this.tagIndex);

			// Split compound tags and index individual parts
			const normalizedTag = TextProcessor.normalizeInput(tag);
			const tagParts = normalizedTag.split(/[-_\s]+/);

			if (tagParts.length > 1) {
				for (const part of tagParts) {
					if (part.length > 2) {
						// Only index meaningful parts
						if (!this.tagIndex.has(part)) {
							this.tagIndex.set(part, {});
						}

						const termFreq = this.tagIndex.get(part)!;
						termFreq[iconName] = (termFreq[iconName] || 0) + 0.7; // Lower weight for parts
					}
				}
			}

			// Add common synonyms for certain tags
			const synonyms = this.getSynonymsForTag(tag);
			for (const synonym of synonyms) {
				if (!this.tagIndex.has(synonym)) {
					this.tagIndex.set(synonym, {});
				}

				const termFreq = this.tagIndex.get(synonym)!;
				termFreq[iconName] = (termFreq[iconName] || 0) + 0.8; // Slightly lower weight for synonyms
			}
		}
	}

	/**
	 * Gets common synonyms for a tag
	 * @param tag - Original tag
	 * @returns Array of synonyms
	 * @private
	 */
	private getSynonymsForTag(tag: string): string[] {
		const normalizedTag = TextProcessor.normalizeInput(tag);
		const synonyms: string[] = [];

		// Common synonym mappings
		const synonymMap: Record<string, string[]> = {
			user: ['profile', 'account', 'person'],
			profile: ['user', 'account', 'person'],
			account: ['user', 'profile'],
			settings: ['preferences', 'options', 'configuration', 'gear'],
			preferences: ['settings', 'options', 'configuration'],
			options: ['settings', 'preferences', 'configuration'],
			configuration: ['settings', 'preferences', 'options'],
			gear: ['settings', 'configuration'],
			cart: ['shopping', 'basket', 'purchase'],
			shopping: ['cart', 'basket', 'purchase', 'buy'],
			basket: ['cart', 'shopping'],
			purchase: ['buy', 'shopping', 'cart'],
			buy: ['purchase', 'shopping'],
			play: ['start', 'begin', 'media', 'player', 'playback', 'stream', 'video'],
			button: ['control', 'ui', 'interface', 'element', 'component', 'trigger'],
			document: ['file', 'paper', 'text'],
			file: ['document', 'paper'],
			trash: ['delete', 'remove', 'bin', 'garbage'],
			delete: ['trash', 'remove'],
			remove: ['delete', 'trash'],
			download: ['save', 'get'],
			save: ['download', 'store'],
			warning: ['alert', 'caution', 'danger'],
			alert: ['warning', 'caution', 'notification'],
			caution: ['warning', 'alert'],
			danger: ['warning', 'alert'],
			communication: ['message', 'chat', 'talk', 'conversation', 'dialogue', 'speak', 'discuss', 'mail', 'email'],
			message: ['communication', 'chat', 'talk', 'mail', 'email', 'conversation'],
			chat: ['communication', 'message', 'talk', 'conversation', 'dialogue'],
			talk: ['communication', 'message', 'chat', 'speak', 'voice', 'conversation'],
			mail: ['email', 'message', 'communication', 'envelope', 'inbox', 'correspondence'],
			email: ['mail', 'message', 'communication', 'envelope', 'inbox'],
			media: ['play', 'video', 'audio', 'music', 'sound', 'player', 'stream'],
			video: ['media', 'play', 'player', 'stream', 'movie', 'film'],
			audio: ['media', 'sound', 'music', 'play', 'player'],
		};

		// Compound term mappings
		const compoundMap: Record<string, string[]> = {
			'play button': ['play', 'start', 'media', 'control', 'player', 'video', 'audio', 'stream'],
			'media player': ['play', 'video', 'audio', 'control', 'stream', 'playback'],
			'video player': ['play', 'media', 'stream', 'movie', 'film'],
			'communication tool': ['message', 'chat', 'mail', 'email', 'talk', 'conversation'],
			'chat message': ['communication', 'talk', 'conversation', 'dialogue'],
			'mail message': ['email', 'communication', 'inbox', 'correspondence'],
		};

		// Check for compound terms first
		for (const [compound, compoundSynonyms] of Object.entries(compoundMap)) {
			if (normalizedTag.includes(compound)) {
				synonyms.push(...compoundSynonyms);
			}
		}

		// Check for direct matches in the synonym map
		if (synonymMap[normalizedTag]) {
			synonyms.push(...synonymMap[normalizedTag]);
		}

		// Check for partial matches
		for (const [key, values] of Object.entries(synonymMap)) {
			if (normalizedTag.includes(key) || key.includes(normalizedTag)) {
				synonyms.push(...values);
			}
		}

		return [...new Set(synonyms)]; // Remove duplicates
	}

	/**
	 * Gets the complete search index for serialization
	 * @returns Combined search index as term -> icon names mapping
	 */
	getIndex(): Map<string, string[]> {
		const combinedIndex = new Map<string, string[]>();

		// Combine all indexes
		const allIndexes = [
			{ index: this.nameIndex, prefix: 'name:' },
			{ index: this.categoryIndex, prefix: 'category:' },
			{ index: this.tagIndex, prefix: 'tag:' },
			{ index: this.usageIndex, prefix: 'usage:' }
		];

		for (const { index, prefix } of allIndexes) {
			for (const [term, termFreq] of index.entries()) {
				const iconNames = Object.keys(termFreq);
				if (iconNames.length > 0) {
					combinedIndex.set(`${prefix}${term}`, iconNames);
				}
			}
		}

		return combinedIndex;
	}

	/**
	 * Searches in a specific index
	 * @param queryTerms - Query terms
	 * @param index - Index to search in
	 * @param scores - Scores map to update
	 * @param weight - Weight for this index
	 * @private
	 */
	private searchInIndex(queryTerms: string[], index: Map<string, TermFrequency>, scores: Map<string, number>, weight: number): void {
		for (const term of queryTerms) {
			const termFreq = index.get(term);
			if (!termFreq) continue;

			for (const [iconName, freq] of Object.entries(termFreq)) {
				const currentScore = scores.get(iconName) || 0;
				// TF-IDF inspired scoring: term frequency * inverse document frequency
				const idf = Math.log(this.iconMetadataMap.size / Object.keys(termFreq).length);
				const termScore = freq * idf * weight;
				scores.set(iconName, currentScore + termScore);
			}
		}
	}

	/**
	 * Searches in a specific index with category filtering
	 * @param queryTerms - Query terms
	 * @param index - Index to search in
	 * @param scores - Scores map to update
	 * @param weight - Weight for this index
	 * @param allowedIcons - Set of allowed icon names
	 * @private
	 */
	private searchInIndexFiltered(
		queryTerms: string[],
		index: Map<string, TermFrequency>,
		scores: Map<string, number>,
		weight: number,
		allowedIcons: Set<string>
	): void {
		for (const term of queryTerms) {
			const termFreq = index.get(term);
			if (!termFreq) continue;

			for (const [iconName, freq] of Object.entries(termFreq)) {
				if (!allowedIcons.has(iconName)) continue;

				const currentScore = scores.get(iconName) || 0;
				const idf = Math.log(allowedIcons.size / Object.keys(termFreq).length);
				const termScore = freq * idf * weight;
				scores.set(iconName, currentScore + termScore);
			}
		}
	}
}

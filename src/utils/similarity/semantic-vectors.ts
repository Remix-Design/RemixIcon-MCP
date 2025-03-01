/**
 * Semantic vector utilities
 * Provides lightweight semantic vector operations for text similarity
 */

import { TextProcessor } from '../text/text-processor';

/**
 * Word vector representation
 */
interface WordVector {
	[dimension: string]: number;
}

/**
 * Semantic vector model
 * Provides methods for semantic similarity using lightweight vector representations
 */
export class SemanticVectors {
	// Pre-defined semantic dimensions with related terms
	private static readonly DIMENSIONS: Record<string, string[]> = {
		// UI/Design dimensions
		visual: ['icon', 'image', 'picture', 'graphic', 'logo', 'symbol', 'design', 'ui', 'interface', 'visual'],
		shape: ['circle', 'square', 'triangle', 'rectangle', 'oval', 'polygon', 'star', 'heart', 'arrow', 'line'],
		action: ['button', 'click', 'tap', 'press', 'select', 'choose', 'activate', 'toggle', 'switch', 'trigger'],
		navigation: ['menu', 'home', 'back', 'forward', 'up', 'down', 'left', 'right', 'next', 'previous'],
		state: ['on', 'off', 'active', 'inactive', 'enabled', 'disabled', 'selected', 'unselected', 'checked', 'unchecked'],
		feedback: ['alert', 'notification', 'message', 'error', 'warning', 'success', 'info', 'help', 'hint', 'tooltip'],
		data: ['file', 'document', 'folder', 'save', 'load', 'import', 'export', 'upload', 'download', 'sync'],
		media: [
			'play',
			'pause',
			'stop',
			'record',
			'volume',
			'mute',
			'audio',
			'video',
			'music',
			'sound',
			'start',
			'player',
			'media',
			'playback',
			'stream',
			'movie',
		],
		communication: [
			'mail',
			'email',
			'message',
			'chat',
			'comment',
			'share',
			'send',
			'receive',
			'call',
			'contact',
			'conversation',
			'discuss',
			'feedback',
			'reply',
			'talk',
			'voice',
			'speak',
			'dialogue',
		],
		social: ['user', 'profile', 'account', 'person', 'people', 'group', 'team', 'community', 'network', 'friend'],
		commerce: ['cart', 'shop', 'store', 'buy', 'sell', 'price', 'payment', 'money', 'currency', 'credit'],
		time: ['clock', 'calendar', 'date', 'time', 'schedule', 'event', 'reminder', 'alarm', 'timer', 'history'],
		weather: ['sun', 'moon', 'cloud', 'rain', 'snow', 'wind', 'storm', 'temperature', 'climate', 'forecast'],
		device: ['phone', 'mobile', 'tablet', 'desktop', 'laptop', 'computer', 'hardware', 'device', 'screen', 'display'],
		security: ['lock', 'unlock', 'password', 'key', 'secure', 'protect', 'privacy', 'shield', 'guard', 'safe'],

		// Semantic dimensions
		positive: ['good', 'great', 'excellent', 'awesome', 'nice', 'wonderful', 'amazing', 'fantastic', 'best', 'perfect'],
		negative: ['bad', 'poor', 'terrible', 'awful', 'horrible', 'worst', 'ugly', 'nasty', 'wrong', 'broken'],
		size: ['big', 'small', 'large', 'tiny', 'huge', 'little', 'massive', 'giant', 'miniature', 'enormous'],
		speed: ['fast', 'slow', 'quick', 'rapid', 'swift', 'speedy', 'sluggish', 'crawling', 'instant', 'delay'],
		importance: ['important', 'critical', 'essential', 'vital', 'key', 'central', 'core', 'fundamental', 'crucial', 'significant'],
	};

	// Synonyms mapping for common terms
	private static readonly SYNONYMS: Record<string, string[]> = {
		delete: ['remove', 'trash', 'erase', 'clear', 'destroy'],
		add: ['create', 'new', 'plus', 'insert', 'append'],
		settings: ['preferences', 'options', 'configuration', 'setup', 'customize'],
		search: ['find', 'lookup', 'query', 'seek', 'explore'],
		edit: ['modify', 'change', 'update', 'alter', 'revise'],
		view: ['see', 'look', 'display', 'show', 'preview'],
		refresh: ['reload', 'update', 'renew', 'sync', 'synchronize'],
		close: ['exit', 'quit', 'end', 'terminate', 'shut'],
		help: ['support', 'assistance', 'guide', 'aid', 'info'],
		favorite: ['bookmark', 'like', 'star', 'save', 'prefer'],
		play: ['start', 'begin', 'run', 'activate', 'launch', 'initiate', 'stream', 'playback'],
		button: ['control', 'switch', 'trigger', 'toggle', 'interface', 'element', 'component'],
		communication: ['message', 'chat', 'talk', 'speak', 'discuss', 'converse', 'dialogue', 'conversation', 'contact'],
		mail: ['email', 'message', 'letter', 'correspondence', 'inbox', 'envelope'],
	};

	/**
	 * Converts text to a semantic vector
	 * @param text - Input text
	 * @returns Semantic vector representation
	 */
	static textToVector(text: string): WordVector {
		if (!text) return {};

		const normalizedText = TextProcessor.normalizeInput(text);
		const words = TextProcessor.splitIntoWords(normalizedText);

		if (words.length === 0) return {};

		const vector: WordVector = {};

		// Initialize dimensions
		for (const dimension of Object.keys(this.DIMENSIONS)) {
			vector[dimension] = 0;
		}

		// Process each word
		for (const word of words) {
			// Check direct dimension matches
			for (const [dimension, relatedTerms] of Object.entries(this.DIMENSIONS)) {
				if (word === dimension) {
					vector[dimension] += 1.0;
					continue;
				}

				// Check related terms
				for (const term of relatedTerms) {
					if (word === term) {
						vector[dimension] += 0.8;
						break;
					}

					// Partial matches
					if (term.includes(word) || word.includes(term)) {
						const matchRatio = Math.min(word.length, term.length) / Math.max(word.length, term.length);
						if (matchRatio > 0.5) {
							vector[dimension] += 0.5 * matchRatio;
						}
					}
				}
			}

			// Check synonyms
			for (const [mainTerm, synonyms] of Object.entries(this.SYNONYMS)) {
				if (word === mainTerm) {
					// Find dimensions that contain this term
					for (const [dimension, terms] of Object.entries(this.DIMENSIONS)) {
						if (terms.includes(mainTerm)) {
							vector[dimension] += 0.9;
						}
					}
				}

				for (const synonym of synonyms) {
					if (word === synonym) {
						// Find dimensions that contain the main term
						for (const [dimension, terms] of Object.entries(this.DIMENSIONS)) {
							if (terms.includes(mainTerm)) {
								vector[dimension] += 0.7;
							}
						}
					}
				}
			}
		}

		// Normalize vector
		return this.normalizeVector(vector);
	}

	/**
	 * Calculates cosine similarity between two semantic vectors
	 * @param vec1 - First vector
	 * @param vec2 - Second vector
	 * @returns Similarity score between 0 and 1
	 */
	static cosineSimilarity(vec1: WordVector, vec2: WordVector): number {
		if (Object.keys(vec1).length === 0 || Object.keys(vec2).length === 0) {
			return 0;
		}

		let dotProduct = 0;
		let magnitude1 = 0;
		let magnitude2 = 0;

		// Calculate dot product and magnitudes
		for (const dimension of Object.keys(this.DIMENSIONS)) {
			const value1 = vec1[dimension] || 0;
			const value2 = vec2[dimension] || 0;

			dotProduct += value1 * value2;
			magnitude1 += value1 * value1;
			magnitude2 += value2 * value2;
		}

		magnitude1 = Math.sqrt(magnitude1);
		magnitude2 = Math.sqrt(magnitude2);

		if (magnitude1 === 0 || magnitude2 === 0) {
			return 0;
		}

		return dotProduct / (magnitude1 * magnitude2);
	}

	/**
	 * Calculates semantic similarity between two texts
	 * @param text1 - First text
	 * @param text2 - Second text
	 * @returns Similarity score between 0 and 1
	 */
	static calculateSemanticSimilarity(text1: string, text2: string): number {
		if (!text1 || !text2) {
			return 0;
		}

		// Check for compound terms with special handling
		const compoundTerms: Record<string, string[]> = {
			'play button': ['play', 'start', 'media', 'control', 'player'],
			communication: ['message', 'chat', 'conversation', 'dialogue', 'talk', 'speak', 'discuss'],
		};

		// Check if text1 or text2 matches any compound term
		for (const [term, relatedTerms] of Object.entries(compoundTerms)) {
			if (text1.toLowerCase().includes(term) || text2.toLowerCase().includes(term)) {
				// Enrich both texts with related terms
				text1 = `${text1} ${relatedTerms.join(' ')}`;
				text2 = `${text2} ${relatedTerms.join(' ')}`;
				break;
			}
		}

		const vec1 = this.textToVector(text1);
		const vec2 = this.textToVector(text2);

		return this.cosineSimilarity(vec1, vec2);
	}

	/**
	 * Normalizes a vector to unit length
	 * @param vector - Vector to normalize
	 * @returns Normalized vector
	 * @private
	 */
	private static normalizeVector(vector: WordVector): WordVector {
		const result: WordVector = {};

		// Calculate magnitude
		let magnitude = 0;
		for (const dimension in vector) {
			magnitude += vector[dimension] * vector[dimension];
		}

		magnitude = Math.sqrt(magnitude);

		// Normalize
		if (magnitude > 0) {
			for (const dimension in vector) {
				result[dimension] = vector[dimension] / magnitude;
			}
		} else {
			// Copy as is if magnitude is 0
			for (const dimension in vector) {
				result[dimension] = vector[dimension];
			}
		}

		return result;
	}

	/**
	 * Enriches a text with semantic information
	 * @param text - Input text
	 * @returns Enriched text with expanded semantic terms
	 */
	static enrichText(text: string): string {
		if (!text) return '';

		const normalizedText = TextProcessor.normalizeInput(text);
		const words = TextProcessor.splitIntoWords(normalizedText);
		const enrichedWords = new Set<string>(words);

		// Add synonyms
		for (const word of words) {
			// Check main terms
			for (const [mainTerm, synonyms] of Object.entries(this.SYNONYMS)) {
				if (word === mainTerm) {
					// Add all synonyms
					for (const synonym of synonyms) {
						enrichedWords.add(synonym);
					}
				}

				// Check if word is a synonym
				if (synonyms.includes(word)) {
					enrichedWords.add(mainTerm);
					// Add other synonyms
					for (const synonym of synonyms) {
						if (synonym !== word) {
							enrichedWords.add(synonym);
						}
					}
				}
			}

			// Check dimensions
			for (const [dimension, relatedTerms] of Object.entries(this.DIMENSIONS)) {
				// If word matches dimension or related terms
				if (word === dimension || relatedTerms.includes(word)) {
					// Add dimension and top related terms
					enrichedWords.add(dimension);
					for (const term of relatedTerms.slice(0, 3)) {
						enrichedWords.add(term);
					}
				}
			}
		}

		return Array.from(enrichedWords).join(' ');
	}
}

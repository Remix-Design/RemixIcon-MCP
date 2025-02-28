import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';
import iconCatalog from './icon-catalog.json';

// MARK: - Core Types & Interfaces

/**
 * Standard response format for icon search results
 */
interface ResponseContent {
	type: 'text';
	text: string;
}

/**
 * Weights configuration for different similarity metrics
 */
interface SimilarityWeights {
	cosine: number; // Weight for cosine similarity
	category: number; // Weight for category matching
	tags: number; // Weight for tag matching
	nameMatch: number; // Weight for name matching
	semantic: number; // Weight for semantic similarity
	contextual: number; // Weight for contextual relevance
}

/**
 * Search options for icon scoring
 */
interface IconSearchOptions {
	isNotificationQuery: boolean;
	notificationCategories: Set<string>;
}

/**
 * Scored icon result with metadata
 */
interface ScoredIcon {
	name: string;
	score: number;
	termFrequency: number;
	category: string;
	relevanceBoost: number;
}

// Add these type definitions at the top of the file, after the imports
interface SemanticWord {
	word: string;
	weight?: number;
	aliases?: string[];
}

interface SemanticGroup {
	words: SemanticWord[];
	weight: number;
	related: string[];
	iconTypes?: string[];
	metadata?: {
		description?: string;
		category?: string;
		priority?: number;
	};
}

interface SemanticGroupConfig {
	[key: string]: SemanticGroup;
}

interface CategoryWeight {
	weight: number;
	priority: number;
}

// MARK: - Constants

/**
 * Core search engine configuration constants
 */
const SEARCH_ENGINE_CONFIG = {
	MAX_CACHE_SIZE: 2000, // Maximum number of cached similarity scores
	MIN_SCORE_THRESHOLD: 0.15, // Minimum score threshold for results

	// Similarity calculation weights
	WEIGHTS: {
		cosine: 0.05, // Basic text similarity
		category: 0.2, // Category matching
		tags: 0.3, // Tag relevance
		nameMatch: 0.25, // Icon name matching
		semantic: 0.15, // Semantic understanding
		contextual: 0.05, // Context relevance
	},

	// Search tuning parameters
	SEARCH_PARAMS: {
		MATCH_BOOST: 2.4,
		SCORE_THRESHOLD: 0.2,
		MAX_WORD_DISTANCE: 3,
		PRIORITY_BOOST: 2.0,
		SEMANTIC_THRESHOLD: 0.35,
		EXACT_MATCH_BOOST: 2.0,
		HIGH_SCORE_THRESHOLD: 0.65,
		CATEGORY_BOOST: 1.3,
		MULTI_TERM_BOOST: 1.45,
		CONTEXT_BOOST: 1.35,
		NAME_MATCH_BOOST: 1.35,
		PRIORITY_TERM_BASE: 1.25,
		COMPOUND_MATCH_BOOST: 2.0,
		MULTI_CATEGORY_BOOST: 1.6,
		SEMANTIC_GROUP_BOOST: 1.5,
		IMPORTANCE_BOOST: 1.8,
		FEEDBACK_BOOST: 1.6,
		FORM_BOOST: 1.6,
	},
};

// Constants for semantic configuration
const SEMANTIC_WEIGHTS = {
	PRIMARY: 1.4,
	HIGH: 1.2,
	MEDIUM: 0.95,
	NORMAL: 0.9,
	LOW: 0.85,
};

// MARK: - String Processing Utilities

/**
 * Utility functions for text processing and normalization
 */
class TextProcessor {
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

// MARK: - Similarity Calculation Engine

/**
 * Core similarity calculation engine
 */
class SimilarityEngine {
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

// MARK: - Main Icon Search Implementation

export default class RemixIconMCP extends WorkerEntrypoint<Env> {
	// Core configuration
	private readonly config = {
		MAX_CACHE_SIZE: 2000,
		MIN_SCORE_THRESHOLD: 0.15,

		// Enhanced weights with optimized distribution for web development
		WEIGHTS: {
			semantic: 0.35, // Further increased for better semantic understanding
			contextual: 0.15, // Maintained for context relevance
			tags: 0.25, // Maintained for tag relevance
			nameMatch: 0.15, // Slightly reduced
			category: 0.1, // Maintained for category relevance
		},

		// Enhanced search parameters with improved boosts
		SEARCH_PARAMS: {
			MATCH_BOOST: 2.4,
			SCORE_THRESHOLD: 0.2,
			MAX_WORD_DISTANCE: 3,
			PRIORITY_BOOST: 2.0,
			SEMANTIC_THRESHOLD: 0.35,
			EXACT_MATCH_BOOST: 2.0,
			HIGH_SCORE_THRESHOLD: 0.65,
			CATEGORY_BOOST: 1.3,
			MULTI_TERM_BOOST: 1.45,
			CONTEXT_BOOST: 1.35,
			NAME_MATCH_BOOST: 1.35,
			PRIORITY_TERM_BASE: 1.25,
			COMPOUND_MATCH_BOOST: 2.0,
			MULTI_CATEGORY_BOOST: 1.6,
			SEMANTIC_GROUP_BOOST: 1.5,
			IMPORTANCE_BOOST: 1.8,
			FEEDBACK_BOOST: 1.6,
			FORM_BOOST: 1.6,
		},

		// Enhanced semantic groups with improved web development focus
		SEMANTIC_GROUPS: {
			notification: {
				words: [
					{ word: 'notification', weight: 1.2 },
					{ word: 'alert', weight: 1.2 },
					{ word: 'message', weight: 1.1 },
					{ word: 'bell', weight: 1.0 },
					{ word: 'warning', weight: 1.1 },
					{ word: 'notice', weight: 1.0 },
					{ word: 'notify', weight: 1.0 },
					{ word: 'alarm', weight: 1.1 },
					{ word: 'badge', weight: 1.0 },
				],
				weight: 1.0,
				related: ['alert', 'communication', 'status'],
			},
			form: {
				words: [
					{ word: 'form', weight: 1.4 }, // Increased from 1.3
					{ word: 'input', weight: 1.4 }, // Increased from 1.3
					{ word: 'field', weight: 1.3 }, // Increased from 1.2
					{ word: 'validation', weight: 1.4 }, // Increased from 1.3
					{ word: 'submit', weight: 1.3 }, // Increased from 1.2
					{ word: 'checkbox', weight: 1.2 },
					{ word: 'radio', weight: 1.2 },
					{ word: 'select', weight: 1.2 },
					{ word: 'textbox', weight: 1.2 },
					{ word: 'required', weight: 1.3 }, // Increased from 1.2
					{ word: 'optional', weight: 1.2 },
					{ word: 'invalid', weight: 1.3 }, // Increased from 1.2
					{ word: 'valid', weight: 1.3 }, // Increased from 1.2
				],
				weight: 1.3, // Increased from 1.2
				related: ['system', 'editor', 'feedback', 'validation'], // Added validation
				iconTypes: ['form', 'input', 'checkbox', 'survey', 'text-box'], // Added text-box
			},
			responsive: {
				words: [
					{ word: 'responsive', weight: 1.2 },
					{ word: 'mobile', weight: 1.2 },
					{ word: 'tablet', weight: 1.1 },
					{ word: 'desktop', weight: 1.1 },
					{ word: 'screen', weight: 1.0 },
					{ word: 'device', weight: 1.0 },
					{ word: 'viewport', weight: 1.1 },
					{ word: 'layout', weight: 1.0 },
				],
				weight: 1.0,
				related: ['device', 'system'],
			},
			theme: {
				words: [
					{ word: 'theme', weight: 1.2 },
					{ word: 'dark', weight: 1.2 },
					{ word: 'light', weight: 1.2 },
					{ word: 'mode', weight: 1.1 },
					{ word: 'color', weight: 1.1 },
					{ word: 'style', weight: 1.0 },
					{ word: 'scheme', weight: 1.0 },
				],
				weight: 1.0,
				related: ['system', 'design'],
			},
			ui: {
				words: [
					{ word: 'loading', weight: 1.2 },
					{ word: 'spinner', weight: 1.2 },
					{ word: 'progress', weight: 1.2 },
					{ word: 'state', weight: 1.1 },
					{ word: 'animation', weight: 1.1 },
					{ word: 'transition', weight: 1.0 },
					{ word: 'interface', weight: 1.0 },
				],
				weight: 1.1,
				related: ['system', 'design'],
			},
			navigation: {
				words: [
					{ word: 'menu', weight: 1.2 },
					{ word: 'navigation', weight: 1.2 },
					{ word: 'hamburger', weight: 1.2 },
					{ word: 'sidebar', weight: 1.1 },
					{ word: 'drawer', weight: 1.1 },
					{ word: 'navbar', weight: 1.1 },
					{ word: 'header', weight: 1.0 },
					{ word: 'footer', weight: 1.0 },
				],
				weight: 1.1,
				related: ['system', 'design'],
			},
			data: {
				words: [
					{ word: 'chart', weight: 1.2 },
					{ word: 'graph', weight: 1.2 },
					{ word: 'analytics', weight: 1.2 },
					{ word: 'dashboard', weight: 1.1 },
					{ word: 'statistics', weight: 1.1 },
					{ word: 'data', weight: 1.1 },
					{ word: 'visualization', weight: 1.0 },
				],
				weight: 1.1,
				related: ['business', 'system'],
			},
			development: {
				words: [
					{ word: 'code', weight: 1.2 },
					{ word: 'development', weight: 1.2 },
					{ word: 'git', weight: 1.2 },
					{ word: 'terminal', weight: 1.1 },
					{ word: 'console', weight: 1.1 },
					{ word: 'debug', weight: 1.1 },
					{ word: 'programming', weight: 1.0 },
				],
				weight: 1.1,
				related: ['system', 'editor'],
			},
			status: {
				words: [
					{ word: 'status', weight: 1.1 },
					{ word: 'state', weight: 1.0 },
					{ word: 'condition', weight: 1.0 },
					{ word: 'health', weight: 1.1 },
					{ word: 'indicator', weight: 1.0 },
					{ word: 'progress', weight: 1.0 },
					{ word: 'monitor', weight: 1.1 },
					{ word: 'track', weight: 1.0 },
					{ word: 'info', weight: 0.9 },
				],
				weight: 0.95,
				related: ['system', 'alert', 'monitoring', 'notification'],
			},
			communication: {
				words: ['message', 'chat', 'mail', 'notification', 'communication', 'inbox', 'unread', 'send', 'receive'],
				weight: 0.95,
				related: ['notification', 'status'],
			},
			alert: {
				words: ['alert', 'warning', 'error', 'danger', 'caution', 'critical', 'urgent', 'important', 'attention', 'priority', 'emergency'],
				weight: 1.2, // Increased weight
				related: ['notification', 'status', 'system', 'importance'],
				iconTypes: ['error-warning', 'alert', 'alarm', 'notification'],
			},
			action: {
				words: ['new', 'update', 'change', 'modify', 'edit', 'create', 'refresh', 'sync'],
				weight: 0.85,
				related: ['status', 'system'],
			},
			system: {
				words: ['system', 'settings', 'config', 'control', 'admin', 'manage', 'monitor', 'process'],
				weight: 0.9,
				related: ['status', 'monitoring'],
			},
			importance: {
				words: ['important', 'critical', 'urgent', 'priority', 'essential', 'key', 'vital', 'crucial', 'emergency', 'severe'],
				weight: 1.4, // Further increased weight
				related: ['alert', 'notification', 'status', 'warning'],
				iconTypes: ['error-warning', 'alert', 'alarm', 'notification'], // Added specific icon types
			},
			monitoring: {
				words: ['monitor', 'track', 'observe', 'watch', 'check', 'inspect', 'supervise'],
				weight: 0.9,
				related: ['status', 'system', 'alert'],
			},
			feedback: {
				// New semantic group for feedback
				words: [
					{ word: 'feedback', weight: 1.3 },
					{ word: 'success', weight: 1.3 },
					{ word: 'error', weight: 1.3 },
					{ word: 'warning', weight: 1.3 },
					{ word: 'info', weight: 1.2 },
					{ word: 'toast', weight: 1.2 },
					{ word: 'notification', weight: 1.2 },
					{ word: 'message', weight: 1.2 },
					{ word: 'alert', weight: 1.2 },
					{ word: 'status', weight: 1.1 },
					{ word: 'response', weight: 1.1 },
					{ word: 'result', weight: 1.1 },
				],
				weight: 1.2,
				related: ['system', 'alert', 'notification'],
				iconTypes: ['error-warning', 'alert', 'check', 'information'],
			},
			validation: {
				// New semantic group for validation
				words: [
					{ word: 'validation', weight: 1.4 },
					{ word: 'valid', weight: 1.4 },
					{ word: 'invalid', weight: 1.4 },
					{ word: 'error', weight: 1.3 },
					{ word: 'success', weight: 1.3 },
					{ word: 'check', weight: 1.3 },
					{ word: 'required', weight: 1.3 },
					{ word: 'optional', weight: 1.2 },
					{ word: 'verify', weight: 1.3 },
					{ word: 'confirm', weight: 1.3 },
					{ word: 'status', weight: 1.2 },
					{ word: 'result', weight: 1.2 },
				],
				weight: 1.3,
				related: ['form', 'feedback', 'system', 'status'],
				iconTypes: ['check', 'error-warning', 'information', 'success', 'alert'],
			},
		},

		// Enhanced priority terms with refined weights and priorities
		PRIORITY_TERMS: new Map([
			['important', { weight: 2.0, boost: 1.8, priority: 1 }], // Further increased
			['urgent', { weight: 2.0, boost: 1.8, priority: 1 }], // Further increased
			['critical', { weight: 2.0, boost: 1.8, priority: 1 }], // Further increased
			['priority', { weight: 1.9, boost: 1.7, priority: 1 }], // Further increased
			['essential', { weight: 1.9, boost: 1.7, priority: 1 }], // Further increased
			['emergency', { weight: 1.9, boost: 1.7, priority: 1 }], // Added emergency term
			['notification', { weight: 1.6, boost: 1.45, priority: 1 }],
			['alert', { weight: 1.5, boost: 1.4, priority: 1 }],
			['warning', { weight: 1.5, boost: 1.4, priority: 1 }],
			['error', { weight: 1.5, boost: 1.4, priority: 1 }],
			['message', { weight: 1.4, boost: 1.35, priority: 2 }],
			['status', { weight: 1.35, boost: 1.3, priority: 2 }],
			['system', { weight: 1.35, boost: 1.3, priority: 2 }],
			['bell', { weight: 1.3, boost: 1.3, priority: 2 }],
			['notice', { weight: 1.3, boost: 1.3, priority: 2 }],
			['notify', { weight: 1.3, boost: 1.3, priority: 2 }],
			['alarm', { weight: 1.3, boost: 1.3, priority: 2 }],
			['reminder', { weight: 1.3, boost: 1.3, priority: 2 }],
			['monitor', { weight: 1.3, boost: 1.25, priority: 2 }],
			['health', { weight: 1.3, boost: 1.25, priority: 2 }],
			['indicator', { weight: 1.25, boost: 1.25, priority: 3 }],
			['new', { weight: 1.2, boost: 1.2, priority: 3 }],
			['unread', { weight: 1.2, boost: 1.2, priority: 3 }],
			['info', { weight: 1.2, boost: 1.2, priority: 3 }],
			['success', { weight: 1.2, boost: 1.2, priority: 3 }],
			['update', { weight: 1.2, boost: 1.2, priority: 3 }],
			['track', { weight: 1.2, boost: 1.2, priority: 3 }],
			['validation', { weight: 1.8, boost: 1.6, priority: 1 }], // Added
			['feedback', { weight: 1.8, boost: 1.6, priority: 1 }], // Added
			['form', { weight: 1.8, boost: 1.6, priority: 1 }], // Added
			['input', { weight: 1.7, boost: 1.5, priority: 1 }], // Added
			['valid', { weight: 1.7, boost: 1.5, priority: 1 }], // Added
			['invalid', { weight: 1.7, boost: 1.5, priority: 1 }], // Added
			['success', { weight: 1.7, boost: 1.5, priority: 1 }], // Added
			['error', { weight: 1.7, boost: 1.5, priority: 1 }], // Added
			['required', { weight: 1.6, boost: 1.4, priority: 2 }], // Added
			['optional', { weight: 1.5, boost: 1.3, priority: 2 }], // Added
			['verify', { weight: 1.5, boost: 1.3, priority: 2 }], // Added
			['confirm', { weight: 1.5, boost: 1.3, priority: 2 }], // Added
			['toast', { weight: 1.6, boost: 1.4, priority: 2 }], // Added
			['response', { weight: 1.5, boost: 1.3, priority: 2 }], // Added
			['result', { weight: 1.5, boost: 1.3, priority: 2 }], // Added
		]),
	};

	// LRU Cache for similarity calculations
	private similarityCache: Map<string, number> = new Map();
	private cacheAccessOrder: string[] = [];

	// Search-specific constants
	private readonly SEARCH_CONSTANTS = {
		MATCH_BOOST: 2.0,
		SCORE_THRESHOLD: 0.2,
		MAX_WORD_DISTANCE: 3,
		PRIORITY_BOOST: 1.5,
		SEMANTIC_THRESHOLD: 0.5,
		EXACT_MATCH_BOOST: 1.8,
		HIGH_SCORE_THRESHOLD: 0.7,
		CATEGORY_BOOST: 1.3,
		MULTI_TERM_BOOST: 1.2,
	};

	/**
	 * Normalize input string
	 * @private
	 */
	private normalizeInput(input: string): string {
		return input.toLowerCase().trim();
	}

	/**
	 * Split text into words
	 * @private
	 */
	private splitWords(text: string): string[] {
		return text
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.split(/[\s-]+/)
			.filter((word) => word.length > 0);
	}

	/**
	 * Calculate term frequency
	 * @private
	 */
	private calculateTermFrequency(searchTerms: string[], targetTerms: string[]): number {
		const searchSet = new Set(searchTerms);
		return targetTerms.filter((term) => searchSet.has(term)).length;
	}

	/**
	 * Get cached similarity score
	 * @private
	 */
	private getCachedScore(key: string): number | undefined {
		const score = this.similarityCache.get(key);
		if (score !== undefined) {
			// Update access order for LRU
			const index = this.cacheAccessOrder.indexOf(key);
			if (index > -1) {
				this.cacheAccessOrder.splice(index, 1);
			}
			this.cacheAccessOrder.push(key);
		}
		return score;
	}

	/**
	 * Set cached similarity score
	 * @private
	 */
	private setCachedScore(key: string, score: number): void {
		// Implement LRU cache eviction
		if (this.similarityCache.size >= this.config.MAX_CACHE_SIZE) {
			const oldestKey = this.cacheAccessOrder.shift();
			if (oldestKey) {
				this.similarityCache.delete(oldestKey);
			}
		}
		this.similarityCache.set(key, score);
		this.cacheAccessOrder.push(key);
	}

	/**
	 * Validates the input description
	 * @private
	 * @param description - Description to validate
	 * @throws Error if description is invalid
	 */
	private validateInput(description: string): void {
		if (!description || typeof description !== 'string') {
			throw new Error('Invalid description provided');
		}
	}

	/**
	 * Checks if a query is notification-related
	 * @private
	 * @param description - Query to check
	 * @returns True if query is notification-related
	 */
	private isNotificationRelatedQuery(description: string): boolean {
		return /notification|alert|message|bell|warning|notice|notify|alarm|reminder/i.test(description);
	}

	/**
	 * Scores and ranks icons based on search criteria
	 * @private
	 * @param description - Normalized description
	 * @param searchTerms - Split search terms
	 * @param options - Search options
	 * @returns Scored and ranked icons
	 */
	private scoreIcons(
		description: string,
		searchTerms: string[],
		options: {
			isNotificationQuery: boolean;
			notificationCategories: Set<string>;
		}
	) {
		return iconCatalog.icons
			.map((icon) => {
				const usage = TextProcessor.normalizeInput(icon.usage);
				const category = TextProcessor.normalizeInput(icon.category);
				const name = TextProcessor.normalizeInput(icon.name);

				// Generate cache key
				const cacheKey = `${description}_${usage}_${category}_${name}`;

				// Check cache first
				let score = this.getCachedScore(cacheKey);
				if (score === undefined) {
					score = this.calculateSimilarityScore(description, usage, category, name, icon.tags);
					this.setCachedScore(cacheKey, score);
				}

				const termFrequency = this.calculateTermFrequency(searchTerms, [...TextProcessor.splitWords(name), ...icon.tags]);

				// Calculate relevance boost
				let relevanceBoost = 1.0;

				if (options.isNotificationQuery && options.notificationCategories.has(icon.category)) {
					relevanceBoost *= 1.3;
				}

				const priorityTerms = new Set(['notification', 'alert', 'message', 'bell', 'warning', 'notice', 'notify', 'alarm']);
				const hasExactMatch = searchTerms.some((term) => name.includes(term) && priorityTerms.has(term));
				if (hasExactMatch) {
					relevanceBoost *= 1.4;
				}

				if (termFrequency > 1) {
					relevanceBoost *= 1 + 0.1 * Math.min(termFrequency, 3);
				}

				return {
					name: icon.name,
					score: score * relevanceBoost,
					termFrequency,
					category: icon.category,
					relevanceBoost,
				};
			})
			.filter((icon) => icon.score >= this.config.MIN_SCORE_THRESHOLD)
			.sort((a, b) => {
				// Primary sort by adjusted score
				const scoreDiff = b.score - a.score;
				if (Math.abs(scoreDiff) > 0.1) {
					return scoreDiff;
				}

				// Secondary sort by category priority
				const aCategoryPriority = options.notificationCategories.has(a.category) ? 1 : 0;
				const bCategoryPriority = options.notificationCategories.has(b.category) ? 1 : 0;
				if (aCategoryPriority !== bCategoryPriority) {
					return bCategoryPriority - aCategoryPriority;
				}

				// Tertiary sort by term frequency
				const freqDiff = b.termFrequency - a.termFrequency;
				if (freqDiff !== 0) {
					return freqDiff;
				}

				// Final sort by name length (prefer shorter names)
				return a.name.length - b.name.length;
			});
	}

	/**
	 * Formats scored icons into response format
	 * @private
	 * @param icons - Scored icons to format
	 * @returns Formatted response content
	 */
	private formatResults(icons: Array<{ name: string; score: number; category: string }>): ResponseContent[] {
		return icons.map((icon) => ({
			type: 'text' as const,
			text: `${icon.name} (Score: ${icon.score.toFixed(2)}, Category: ${icon.category})`,
		}));
	}

	/**
	 * Find icons based on user description with enhanced matching
	 */
	findIcons(description: string): ResponseContent[] {
		if (!description || typeof description !== 'string') {
			throw new Error('Invalid description provided');
		}

		const lowerDescription = this.normalizeInput(description);
		const searchTerms = this.splitWords(lowerDescription);

		// Enhanced category matching
		const categoryMatches = new Map<string, number>();
		const notificationCategories = new Set(['Alert', 'Communication', 'System']);
		const isNotificationQuery = /notification|alert|message|bell|warning|notice|notify|alarm|reminder/i.test(description);
		const isStatusQuery = /status|state|condition|health|indicator/i.test(description);
		const isMessageQuery = /message|chat|inbox|mail|communication/i.test(description);

		// Calculate similarity scores with enhanced priority matching
		const scoredIcons = iconCatalog.icons.map((icon) => {
			const usage = this.normalizeInput(icon.usage);
			const category = this.normalizeInput(icon.category);
			const name = this.normalizeInput(icon.name);
			const cacheKey = `${lowerDescription}_${usage}_${category}_${name}`;

			let score = this.getCachedScore(cacheKey);
			if (score === undefined) {
				score = this.calculateSimilarityScore(lowerDescription, usage, category, name, icon.tags);
				this.setCachedScore(cacheKey, score);
			}

			// Enhanced term frequency calculation
			const termFrequency = this.calculateTermFrequency(searchTerms, [...this.splitWords(name), ...icon.tags]);

			// Track category matches for global ranking
			categoryMatches.set(icon.category, (categoryMatches.get(icon.category) || 0) + score);

			// Enhanced relevance scoring
			let relevanceBoost = 1.0;

			// Category-specific boosts
			if (isNotificationQuery && notificationCategories.has(icon.category)) {
				relevanceBoost *= this.SEARCH_CONSTANTS.CATEGORY_BOOST;
			}
			if (isStatusQuery && icon.category === 'System') {
				relevanceBoost *= 1.2;
			}
			if (isMessageQuery && icon.category === 'Communication') {
				relevanceBoost *= 1.2;
			}

			// Priority term matching
			const priorityTerms = new Map([
				['notification', 1.5],
				['alert', 1.4],
				['warning', 1.4],
				['message', 1.3],
				['bell', 1.3],
				['notice', 1.2],
				['notify', 1.2],
				['alarm', 1.2],
				['reminder', 1.2],
				['status', 1.2],
				['important', 1.3],
				['critical', 1.3],
				['urgent', 1.3],
				['new', 1.1],
				['unread', 1.1],
			]);

			// Calculate priority term matches
			let priorityMatchCount = 0;
			let priorityMatchScore = 0;
			for (const term of searchTerms) {
				if (priorityTerms.has(term)) {
					priorityMatchCount++;
					priorityMatchScore += priorityTerms.get(term) || 1.0;
				}
			}

			// Apply priority term boosts
			if (priorityMatchCount > 0) {
				relevanceBoost *= 1 + (priorityMatchScore / priorityMatchCount - 1) * 0.5;
			}

			// Multi-term match boost
			if (termFrequency > 1) {
				relevanceBoost *= this.SEARCH_CONSTANTS.MULTI_TERM_BOOST;
			}

			// Name-specific boosts
			const nameWords = this.splitWords(name);
			const exactNameMatches = searchTerms.filter((term) => nameWords.includes(term));
			if (exactNameMatches.length > 0) {
				relevanceBoost *= 1 + 0.1 * exactNameMatches.length;
			}

			return {
				name: icon.name,
				score: score * relevanceBoost,
				termFrequency,
				category: icon.category,
				relevanceBoost,
				priorityMatchCount,
				exactNameMatches: exactNameMatches.length,
			};
		});

		// Calculate category relevance scores
		const totalCategoryScore = Array.from(categoryMatches.values()).reduce((a, b) => a + b, 0);
		const categoryRelevance = new Map(
			Array.from(categoryMatches.entries()).map(([category, score]) => [category, score / totalCategoryScore])
		);

		// Enhanced filtering and sorting
		const topIcons = scoredIcons
			.filter((icon) => icon.score >= this.config.MIN_SCORE_THRESHOLD)
			.sort((a, b) => {
				// Primary sort by adjusted score
				const scoreDiff = b.score - a.score;
				if (Math.abs(scoreDiff) > 0.1) {
					return scoreDiff;
				}

				// Secondary sort by category relevance
				const categoryDiff = (categoryRelevance.get(b.category) || 0) - (categoryRelevance.get(a.category) || 0);
				if (Math.abs(categoryDiff) > 0.1) {
					return categoryDiff;
				}

				// Tertiary sort by priority match count
				if (b.priorityMatchCount !== a.priorityMatchCount) {
					return b.priorityMatchCount - a.priorityMatchCount;
				}

				// Quaternary sort by exact name matches
				if (b.exactNameMatches !== a.exactNameMatches) {
					return b.exactNameMatches - a.exactNameMatches;
				}

				// Final sort by name length
				return a.name.length - b.name.length;
			})
			.slice(0, 3);

		return topIcons.map((icon) => ({
			type: 'text' as const,
			text: `${icon.name} (Score: ${icon.score.toFixed(2)}, Category: ${icon.category})`,
		}));
	}

	/**
	 * Calculate similarity score between user description and icon metadata
	 * @private
	 */
	private calculateSimilarityScore(description: string, usage: string, category: string, name: string, tags: string[]): number {
		const scores: { [key: string]: number } = {
			cosine: this.calculateCosineSimilarity(description, usage),
			category: this.calculateCategoryScore(description, category),
			tags: this.calculateTagsScore(description, tags || []),
			nameMatch: this.calculateNameMatchScore(description, name),
			semantic: this.calculateSemanticScore(description, usage, tags),
			contextual: this.calculateContextualScore(description, category, tags),
		};

		// Calculate weighted average with dynamic weights
		let weightedSum = 0;
		let totalWeight = 0;

		const isImportanceQuery = this.isImportanceQuery(description);
		const isNotificationQuery = this.isNotificationRelatedQuery(description);

		for (const [key, weight] of Object.entries(this.config.WEIGHTS)) {
			const score = scores[key];
			let adjustedWeight = weight;

			// Enhanced weight adjustment for importance queries
			if (isImportanceQuery) {
				if (key === 'semantic' || key === 'tags') {
					adjustedWeight *= this.config.SEARCH_PARAMS.IMPORTANCE_BOOST;
				}
				if (key === 'nameMatch' && this.hasImportanceRelatedName(name)) {
					adjustedWeight *= 1.5;
				}
				if (key === 'contextual' && (category === 'Alert' || category === 'System')) {
					adjustedWeight *= 1.4;
				}
			} else if (isNotificationQuery) {
				if (key === 'semantic' || key === 'tags') {
					if (
						scores.semantic > this.config.SEARCH_PARAMS.SEMANTIC_THRESHOLD ||
						scores.tags > this.config.SEARCH_PARAMS.SEMANTIC_THRESHOLD
					) {
						adjustedWeight *= this.config.SEARCH_PARAMS.PRIORITY_BOOST;
					}
				}
				if (key === 'nameMatch' && scores.nameMatch > 0.7) {
					adjustedWeight *= 1.3;
				}
				if (key === 'contextual' && (category === 'Alert' || category === 'Communication')) {
					adjustedWeight *= 1.5;
				}
			}

			weightedSum += score * adjustedWeight;
			totalWeight += adjustedWeight;
		}

		const baseScore = weightedSum / totalWeight;

		// Enhanced score boosting for importance-related matches
		if (isImportanceQuery) {
			const importanceGroup = this.config.SEMANTIC_GROUPS.importance;
			if (importanceGroup.iconTypes.some((type) => name.includes(type))) {
				return Math.min(1, baseScore * this.config.SEARCH_PARAMS.IMPORTANCE_BOOST);
			}
		}

		// ... rest of the existing conditions ...

		return baseScore;
	}

	/**
	 * Check if a query is importance/urgency related
	 * @private
	 */
	private isImportanceQuery(description: string): boolean {
		return /important|urgent|critical|priority|essential|emergency|severe/i.test(description);
	}

	/**
	 * Check if an icon name is related to importance/urgency
	 * @private
	 */
	private hasImportanceRelatedName(name: string): boolean {
		return /error|warning|alert|alarm|notification|attention/i.test(name);
	}

	/**
	 * Calculate semantic similarity using enhanced word relationships
	 * @private
	 */
	private calculateSemanticScore(description: string, usage: string, tags: string[]): number {
		const descWords = this.splitWords(description);
		const usageWords = this.splitWords(usage);
		const allWords = [...new Set([...usageWords, ...tags])];

		let semanticScore = 0;
		let maxPossibleScore = descWords.length;
		let primaryMatchCount = 0;
		let contextMatchCount = 0;
		let groupMatchStrength = new Map<string, number>();
		let relatedGroupMatches = new Set<string>();
		let multiGroupBoost = 1.0;

		// Track semantic group matches with enhanced scoring
		const groupMatches = new Map<
			string,
			{
				count: number;
				strength: number;
				priority: number;
				related: number;
			}
		>();

		for (const descWord of descWords) {
			let wordScore = 0;
			const lowerWord = descWord.toLowerCase();

			// Enhanced priority term scoring with importance focus
			const priorityTerm = this.config.PRIORITY_TERMS.get(lowerWord);
			if (priorityTerm) {
				const importanceTerms = new Set(['important', 'critical', 'urgent', 'priority', 'essential']);
				const importanceBoost = importanceTerms.has(lowerWord) ? 1.3 : 1.0;
				wordScore = Math.max(wordScore, priorityTerm.weight * importanceBoost);
				primaryMatchCount++;
			}

			// Enhanced word similarity with context and semantic groups
			for (const targetWord of allWords) {
				const similarity = this.calculateWordSimilarity(descWord, targetWord);
				const targetPriority = this.config.PRIORITY_TERMS.get(targetWord.toLowerCase());

				// Progressive priority boost scaling
				if (targetPriority && similarity > 0.7) {
					const priorityBoost = 1 + (targetPriority.priority === 1 ? 0.45 : targetPriority.priority === 2 ? 0.35 : 0.25);
					wordScore = Math.max(wordScore, similarity * targetPriority.boost * priorityBoost);
					contextMatchCount++;
				} else {
					wordScore = Math.max(wordScore, similarity);
				}

				// Enhanced semantic group tracking with relationship strength
				if (similarity > 0.75) {
					const group = this.findSemanticGroup(targetWord);
					if (group) {
						const currentMatch = groupMatches.get(group) || {
							count: 0,
							strength: 0,
							priority: 0,
							related: 0,
						};

						const semanticGroup = this.config.SEMANTIC_GROUPS[group as keyof typeof this.config.SEMANTIC_GROUPS];
						if (semanticGroup) {
							groupMatches.set(group, {
								count: currentMatch.count + 1,
								strength: currentMatch.strength + similarity,
								priority: currentMatch.priority + (priorityTerm ? priorityTerm.priority : 0),
								related: currentMatch.related,
							});

							// Track and boost related groups
							if (semanticGroup.related) {
								semanticGroup.related.forEach((relatedGroup: string) => {
									relatedGroupMatches.add(relatedGroup);
									const relatedMatch = groupMatches.get(relatedGroup) || {
										count: 0,
										strength: 0,
										priority: 0,
										related: 0,
									};
									relatedMatch.related += 0.5;
									groupMatches.set(relatedGroup, relatedMatch);
								});
							}
						}
					}
				}
			}

			semanticScore += wordScore;
		}

		// Calculate base score with progressive scaling
		let finalScore = semanticScore / maxPossibleScore;

		// Apply enhanced semantic group bonuses with relationship consideration
		for (const [group, match] of groupMatches.entries()) {
			const semanticGroup = this.config.SEMANTIC_GROUPS[group as keyof typeof this.config.SEMANTIC_GROUPS];
			if (semanticGroup) {
				const groupBoost =
					semanticGroup.weight *
					(1 + Math.min(0.35, match.count * 0.12)) *
					(1 + Math.min(0.25, match.strength * 0.08)) *
					(1 + Math.min(0.2, match.priority * 0.1)) *
					(1 + Math.min(0.15, match.related * 0.1));

				finalScore *= 1 + (groupBoost - 1) * (relatedGroupMatches.has(group) ? 1.25 : 1.0);

				// Apply multi-group boost
				if (match.count > 1 && match.related > 0) {
					multiGroupBoost = Math.max(multiGroupBoost, 1 + Math.min(0.3, (match.count + match.related) * 0.1));
				}
			}
		}

		// Apply progressive match bonuses
		if (primaryMatchCount > 0) {
			finalScore *= 1 + 0.3 * primaryMatchCount * (1 + contextMatchCount * 0.18);
		}

		// Apply compound match bonus for multiple related matches
		if (relatedGroupMatches.size >= 2) {
			finalScore *= this.config.SEARCH_PARAMS.COMPOUND_MATCH_BOOST;
		}

		// Apply multi-group boost
		finalScore *= multiGroupBoost;

		return Math.min(1, finalScore);
	}

	/**
	 * Find semantic group for a word with enhanced matching
	 * @private
	 */
	private findSemanticGroup(word: string): string | null {
		const lowerWord = word.toLowerCase();

		for (const [group, config] of Object.entries(this.config.SEMANTIC_GROUPS)) {
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
	 * @private
	 */
	private calculateWordSimilarity(word1: string, word2: string): number {
		word1 = word1.toLowerCase();
		word2 = word2.toLowerCase();

		// Exact match check
		if (word1 === word2) return 1.0;

		// Word stem match with enhanced scoring
		const stem1 = TextProcessor.getWordStem(word1);
		const stem2 = TextProcessor.getWordStem(word2);
		if (stem1 === stem2) {
			return word1.length === word2.length ? 1.0 : 0.95;
		}

		// Enhanced n-gram similarity with length consideration
		const bigramScore = SimilarityEngine.calculateNGramSimilarity(word1, word2, 2);
		const trigramScore = SimilarityEngine.calculateNGramSimilarity(word1, word2, 3);
		const ngramScore = (0.6 * bigramScore + 0.4 * trigramScore) * (word1.length > 3 && word2.length > 3 ? 1.15 : 1.0);

		// Enhanced edit distance with progressive scaling
		const editScore =
			SimilarityEngine.calculateNormalizedEditDistance(word1, word2) * (Math.min(word1.length, word2.length) > 4 ? 1.15 : 1.0);

		// Enhanced prefix matching with position weighting
		const prefixLength = SimilarityEngine.commonPrefixLength(word1, word2);
		const prefixScore =
			prefixLength === 0
				? 0
				: (prefixLength / Math.min(word1.length, word2.length)) * (0.7 + 0.3 * (prefixLength / Math.max(word1.length, word2.length)));

		// Enhanced containment score with position and length consideration
		const containmentScore = this.calculateEnhancedContainmentScore(word1, word2);

		// Weighted combination with dynamic adjustment
		const baseScore = Math.max(containmentScore, 0.45 * ngramScore + 0.35 * editScore + 0.2 * prefixScore);

		// Apply progressive length penalty
		const lengthPenalty = Math.min(word1.length, word2.length) < 3 ? 0.75 : Math.min(word1.length, word2.length) < 4 ? 0.85 : 1.0;

		return baseScore * lengthPenalty;
	}

	/**
	 * Calculate enhanced containment score with position and length consideration
	 * @private
	 */
	private calculateEnhancedContainmentScore(str1: string, str2: string): number {
		if (str1.includes(str2)) {
			const position = str1.indexOf(str2);
			const positionFactor = position === 0 ? 1.0 : position <= 2 ? 0.95 : 0.9;
			const lengthFactor = str2.length >= 4 ? 1.1 : 1.0;
			return (0.8 + 0.2 * (str2.length / str1.length)) * positionFactor * lengthFactor;
		}
		if (str2.includes(str1)) {
			const position = str2.indexOf(str1);
			const positionFactor = position === 0 ? 1.0 : position <= 2 ? 0.95 : 0.9;
			const lengthFactor = str1.length >= 4 ? 1.1 : 1.0;
			return (0.8 + 0.2 * (str1.length / str2.length)) * positionFactor * lengthFactor;
		}
		return 0;
	}

	/**
	 * Calculate contextual similarity based on category and common usage patterns
	 * @private
	 */
	private calculateContextualScore(description: string, category: string, tags: string[]): number {
		const descWords = TextProcessor.splitWords(description);

		// Enhanced context groups with weighted relationships
		const contextGroups: { [key: string]: { words: string[]; weight: number } } = {
			Business: {
				words: ['chart', 'graph', 'analytics', 'office', 'work', 'report', 'finance', 'business', 'company'],
				weight: 0.7,
			},
			Communication: {
				words: [
					'message',
					'chat',
					'email',
					'notification',
					'alert',
					'bell',
					'warning',
					'info',
					'announcement',
					'notify',
					'reminder',
					'notice',
					'communication',
				],
				weight: 1.0,
			},
			Design: {
				words: ['edit', 'color', 'brush', 'style', 'theme', 'layout', 'design', 'art', 'creative'],
				weight: 0.7,
			},
			Development: {
				words: ['code', 'bug', 'terminal', 'git', 'debug', 'console', 'development', 'programming'],
				weight: 0.7,
			},
			Device: {
				words: ['phone', 'mobile', 'computer', 'hardware', 'tablet', 'screen', 'device', 'gadget'],
				weight: 0.7,
			},
			Document: {
				words: ['file', 'folder', 'paper', 'doc', 'pdf', 'attachment', 'document', 'text'],
				weight: 0.7,
			},
			Editor: {
				words: ['text', 'font', 'format', 'write', 'type', 'edit', 'editor', 'writing'],
				weight: 0.7,
			},
			Media: {
				words: ['video', 'audio', 'music', 'player', 'stream', 'sound', 'media', 'multimedia'],
				weight: 0.7,
			},
			System: {
				words: ['settings', 'user', 'search', 'home', 'config', 'admin', 'system', 'control'],
				weight: 0.8,
			},
			'User & Faces': {
				words: ['profile', 'avatar', 'person', 'account', 'user', 'contact', 'face', 'identity'],
				weight: 0.8,
			},
			Alert: {
				words: [
					'notification',
					'alert',
					'warning',
					'error',
					'info',
					'bell',
					'message',
					'reminder',
					'status',
					'update',
					'notice',
					'alarm',
					'danger',
					'caution',
					'announcement',
				],
				weight: 1.0,
			},
			Status: {
				words: ['notification', 'alert', 'status', 'state', 'health', 'info', 'warning', 'error', 'success', 'condition'],
				weight: 0.9,
			},
		};

		let contextScore = 0;
		const categoryGroup = contextGroups[category];
		const categoryWords = categoryGroup ? categoryGroup.words : [];
		const categoryWeight = categoryGroup ? categoryGroup.weight : 0.7;
		const allContextWords = [...categoryWords, ...tags];

		// Enhanced context scoring
		for (const descWord of descWords) {
			let wordScore = 0;
			const lowerWord = descWord.toLowerCase();

			// Direct category match with weighted boost
			if (categoryWords.includes(lowerWord)) {
				wordScore = Math.max(wordScore, this.config.SEARCH_PARAMS.MATCH_BOOST * categoryWeight);
			}

			// Check matches in all context groups
			for (const [groupName, group] of Object.entries(contextGroups)) {
				if (group.words.includes(lowerWord)) {
					const groupBoost = groupName === category ? 1.2 : 1.0;
					wordScore = Math.max(wordScore, group.weight * groupBoost);
				}
			}

			// Enhanced similarity check with context awareness
			for (const contextWord of allContextWords) {
				const similarity = this.calculateWordSimilarity(descWord, contextWord);
				const adjustedSimilarity = similarity * (categoryWords.includes(contextWord.toLowerCase()) ? categoryWeight : 0.8);
				wordScore = Math.max(wordScore, adjustedSimilarity);
			}

			contextScore += wordScore;
		}

		const baseScore = contextScore / Math.max(1, descWords.length);

		// Apply category-specific boosts
		if (category === 'Alert' || category === 'Communication') {
			return Math.min(1, baseScore * 1.2);
		}

		return baseScore;
	}

	/**
	 * Calculate cosine similarity between two strings
	 * Handles both English and Chinese text
	 * @private
	 */
	private calculateCosineSimilarity(str1: string, str2: string): number {
		// Get word vectors including Chinese characters
		const words1 = TextProcessor.splitWords(str1);
		const words2 = TextProcessor.splitWords(str2);

		// Create term frequency maps
		const tf1 = new Map<string, number>();
		const tf2 = new Map<string, number>();

		// Calculate term frequencies for str1
		words1.forEach((word) => {
			tf1.set(word, (tf1.get(word) || 0) + 1);
		});

		// Calculate term frequencies for str2
		words2.forEach((word) => {
			tf2.set(word, (tf2.get(word) || 0) + 1);
		});

		// Get unique terms
		const uniqueTerms = new Set([...tf1.keys(), ...tf2.keys()]);

		// Calculate dot product and magnitudes
		let dotProduct = 0;
		let magnitude1 = 0;
		let magnitude2 = 0;

		uniqueTerms.forEach((term) => {
			const freq1 = tf1.get(term) || 0;
			const freq2 = tf2.get(term) || 0;

			dotProduct += freq1 * freq2;
			magnitude1 += freq1 * freq1;
			magnitude2 += freq2 * freq2;
		});

		// Avoid division by zero
		if (magnitude1 === 0 || magnitude2 === 0) {
			return 0;
		}

		// Calculate cosine similarity
		return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
	}

	/**
	 * Get all available icon categories
	 * @returns List of all unique icon categories
	 */
	getIconCategories(): ResponseContent[] {
		const categories = new Set<string>();
		iconCatalog.icons.forEach((icon) => categories.add(icon.category));

		return Array.from(categories)
			.sort()
			.map((category) => ({
				type: 'text' as const,
				text: category,
			}));
	}

	/**
	 * Find icons in a specific category based on description
	 *
	 * @param description - User's description of the icon
	 * @param category - Category to search in
	 * @param limit - Maximum number of results (default: 3)
	 * @returns Top matching icons in the category
	 */
	findIconsByCategory(description: string, category: string, limit: number = 3): ResponseContent[] {
		this.validateInput(description);
		if (!category) throw new Error('Category must be provided');

		const normalizedDescription = TextProcessor.normalizeInput(description);
		const normalizedCategory = TextProcessor.normalizeInput(category);

		const scoredIcons = this.scoreIconsByCategory(normalizedDescription, normalizedCategory);
		return this.formatResults(scoredIcons.slice(0, limit));
	}

	/**
	 * Calculate tags score with enhanced matching
	 * @private
	 */
	private calculateTagsScore(description: string, tags: string[]): number {
		if (!tags || tags.length === 0) {
			return 0;
		}

		const descWords = new Set(TextProcessor.splitWords(description.toLowerCase()));
		let totalScore = 0;
		let maxTagScore = 0;
		let priorityMatchCount = 0;

		// Priority tags for notification-related searches
		const priorityTags = new Set([
			'notification',
			'alert',
			'message',
			'bell',
			'warning',
			'notice',
			'notify',
			'alarm',
			'reminder',
			'status',
		]);

		// Enhanced tag scoring with priority consideration
		for (const tag of tags) {
			const tagLower = tag.toLowerCase();
			const tagWords = TextProcessor.splitWords(tagLower);
			const isPriorityTag = tagWords.some((word) => priorityTags.has(word));

			// Word match with priority boost
			const wordMatchCount = tagWords.filter((word) => descWords.has(word)).length;
			let wordScore = wordMatchCount / Math.max(tagWords.length, 1);

			if (isPriorityTag && wordMatchCount > 0) {
				wordScore *= 1.4;
				priorityMatchCount++;
			}

			// Enhanced partial match with context awareness
			let partialMatchScore = 0;
			for (const tagWord of tagWords) {
				let wordBestScore = 0;
				for (const descWord of descWords) {
					const similarity = this.calculateWordSimilarity(tagWord, descWord);
					// Apply priority boost to partial matches
					const adjustedSimilarity = isPriorityTag && similarity > 0.7 ? similarity * 1.3 : similarity;
					wordBestScore = Math.max(wordBestScore, adjustedSimilarity);
				}
				partialMatchScore = Math.max(partialMatchScore, wordBestScore);
			}

			// Exact phrase match with high priority
			const exactMatchBoost = description.toLowerCase().includes(tagLower)
				? isPriorityTag
					? this.config.SEARCH_PARAMS.MATCH_BOOST * 1.2
					: this.config.SEARCH_PARAMS.MATCH_BOOST
				: 0;

			const tagScore = Math.max(wordScore, partialMatchScore, exactMatchBoost);
			totalScore += tagScore;
			maxTagScore = Math.max(maxTagScore, tagScore);
		}

		// Calculate base score with weighted average
		const avgScore = totalScore / tags.length;
		let finalScore = avgScore * 0.6 + maxTagScore * 0.4;

		// Apply bonus for multiple priority matches
		if (priorityMatchCount >= 2) {
			finalScore *= 1 + 0.2 * Math.min(priorityMatchCount, 3);
		}

		return Math.min(1, finalScore);
	}

	/**
	 * @ignore
	 **/
	async fetch(request: Request): Promise<Response> {
		return new ProxyToSelf(this).fetch(request);
	}

	/**
	 * Score icons in a specific category
	 * @private
	 * @param description - Normalized description
	 * @param category - Normalized category
	 * @returns Scored and ranked icons
	 */
	private scoreIconsByCategory(description: string, category: string): ScoredIcon[] {
		return iconCatalog.icons
			.filter((icon) => TextProcessor.normalizeInput(icon.category) === category)
			.map((icon) => {
				const usage = TextProcessor.normalizeInput(icon.usage);
				const name = TextProcessor.normalizeInput(icon.name);
				const tags = icon.tags.map((tag) => TextProcessor.normalizeInput(tag));

				// Generate cache key
				const cacheKey = `${description}_${usage}_${category}_${name}`;

				// Check cache first
				let score = this.getCachedScore(cacheKey);
				if (score === undefined) {
					score = this.calculateSimilarityScore(description, usage, category, name, tags);
					this.setCachedScore(cacheKey, score);
				}

				return {
					name: icon.name,
					score,
					termFrequency: 0, // Not used for category search
					category: icon.category,
					relevanceBoost: 1.0, // No boost for category search
				};
			})
			.filter((icon) => icon.score >= this.config.MIN_SCORE_THRESHOLD)
			.sort((a, b) => b.score - a.score);
	}

	/**
	 * Calculate category score with improved matching
	 * @private
	 */
	private calculateCategoryScore(description: string, category: string): number {
		const categoryConfig = this.config.SEMANTIC_GROUPS[category as keyof typeof this.config.SEMANTIC_GROUPS];
		const categoryWeight = categoryConfig?.weight || 0.7;
		const descWords = this.splitWords(description);
		const categoryWords = this.splitWords(category);

		// Quick exact match check
		if (description === category.toLowerCase()) {
			return categoryWeight;
		}

		// Check for full phrase matches
		const descPhrase = descWords.join(' ');
		const categoryPhrase = categoryWords.join(' ');
		if (descPhrase.includes(categoryPhrase) || categoryPhrase.includes(descPhrase)) {
			return Math.min(1, categoryWeight * this.config.SEARCH_PARAMS.EXACT_MATCH_BOOST);
		}

		// Calculate word-level matches
		let totalScore = 0;
		let bestWordScore = 0;
		let priorityMatchCount = 0;

		for (const descWord of descWords) {
			let wordBestScore = 0;
			const priorityTerm = this.config.PRIORITY_TERMS.get(descWord);

			for (const catWord of categoryWords) {
				const similarity = this.calculateWordSimilarity(descWord, catWord);
				if (similarity > 0.7) {
					priorityMatchCount++;
				}
				wordBestScore = Math.max(wordBestScore, similarity);
			}

			// Apply priority term boost if applicable
			if (priorityTerm && wordBestScore > 0.7) {
				wordBestScore *= priorityTerm.boost;
			}

			totalScore += wordBestScore;
			bestWordScore = Math.max(bestWordScore, wordBestScore);
		}

		// Calculate base score
		let score = totalScore / descWords.length;

		// Apply category-specific boosts
		if (priorityMatchCount >= 2) {
			score *= 1 + 0.2 * Math.min(priorityMatchCount, 3);
		}

		// Apply category weight
		score *= categoryWeight;

		// Combine scores with adjusted weights
		return Math.min(1, score * 0.7 + bestWordScore * 0.3);
	}

	/**
	 * Calculate name match score with enhanced matching
	 * @private
	 */
	private calculateNameMatchScore(description: string, name: string): number {
		const cleanName = name.replace(/-(?:fill|line|3-line)$/, '');
		const descWords = this.splitWords(description);
		const nameWords = this.splitWords(cleanName);

		// Exact match check
		if (description === cleanName) {
			const priorityTerm = this.config.PRIORITY_TERMS.get(cleanName);
			return priorityTerm ? Math.min(1, priorityTerm.weight) : 1.0;
		}

		// Enhanced word match scoring
		let totalScore = 0;
		let maxScore = 0;
		let priorityMatchCount = 0;
		let exactWordMatchCount = 0;

		for (const descWord of descWords) {
			let wordBestScore = 0;
			const priorityTerm = this.config.PRIORITY_TERMS.get(descWord);

			// Exact word matches
			if (nameWords.includes(descWord)) {
				wordBestScore = 1.0;
				exactWordMatchCount++;
				if (priorityTerm) {
					priorityMatchCount++;
					wordBestScore *= priorityTerm.boost;
				}
			} else {
				// Partial matches with priority consideration
				for (const nameWord of nameWords) {
					const similarity = this.calculateWordSimilarity(descWord, nameWord);
					let adjustedSimilarity = similarity;

					if (priorityTerm && similarity > 0.7) {
						adjustedSimilarity *= priorityTerm.boost;
					}

					wordBestScore = Math.max(wordBestScore, adjustedSimilarity);
				}
			}

			totalScore += wordBestScore;
			maxScore = Math.max(maxScore, wordBestScore);
		}

		// Calculate base score
		let score = totalScore / Math.max(descWords.length, nameWords.length);

		// Apply progressive boosts
		if (exactWordMatchCount > 0) {
			score *= 1 + 0.1 * exactWordMatchCount;
		}
		if (priorityMatchCount > 0) {
			score *= 1 + 0.2 * Math.min(priorityMatchCount, 3);
		}

		// Position boost for matches at start of name
		const firstDescWord = descWords[0];
		const firstNameWord = nameWords[0];
		if (firstDescWord === firstNameWord || this.calculateWordSimilarity(firstDescWord, firstNameWord) > 0.8) {
			score *= this.config.SEARCH_PARAMS.NAME_MATCH_BOOST;
		}

		// Combine with max score for better precision
		return Math.min(1, score * 0.7 + maxScore * 0.3);
	}
}

// Helper class for semantic group operations
class SemanticGroupHelper {
	/**
	 * Check if a word belongs to a semantic group
	 */
	static hasWord(group: SemanticGroup, word: string): boolean {
		return group.words.some((w) => (typeof w === 'string' ? w === word : w.word === word || w.aliases?.includes(word)));
	}
}

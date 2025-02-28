/**
 * Weights configuration for different similarity metrics
 */
export interface SimilarityWeights {
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
export interface IconSearchOptions {
	isNotificationQuery: boolean;
	notificationCategories: Set<string>;
}

/**
 * Scored icon result with metadata
 */
export interface ScoredIcon {
	name: string;
	score: number;
	termFrequency: number;
	category: string;
	relevanceBoost: number;
}

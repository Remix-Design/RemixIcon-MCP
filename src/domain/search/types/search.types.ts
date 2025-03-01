/**
 * Base weights configuration for similarity metrics
 * Defines the importance of different similarity measures
 */
export type Weights = {
	/**
	 * Weight for cosine similarity measure
	 */
	cosine: number;

	/**
	 * Weight for category matching
	 */
	category: number;

	/**
	 * Weight for tag matching
	 */
	tags: number;

	/**
	 * Weight for name matching
	 */
	nameMatch: number;

	/**
	 * Weight for semantic similarity
	 */
	semantic: number;

	/**
	 * Weight for contextual relevance
	 */
	contextual: number;
};

/**
 * Search configuration
 * Defines the parameters for search behavior
 */
export type SearchConfig = {
	/**
	 * Weights for different similarity measures
	 */
	weights: Weights;

	/**
	 * Threshold values for search decisions
	 */
	thresholds: {
		/**
		 * Minimum similarity score to consider a match
		 */
		similarity: number;

		/**
		 * Minimum semantic score to consider a match
		 */
		semantic: number;

		/**
		 * Score threshold for high-quality matches
		 */
		highScore: number;

		/**
		 * Minimum score to include in results
		 */
		minScore: number;

		/**
		 * Score threshold for secondary results
		 */
		secondaryResults: number;

		/**
		 * Minimum score for category matches
		 */
		categoryScore: number;
	};

	/**
	 * Boost factors for different match types
	 */
	boosts: {
		exactMatch: number;
		synonymMatch: number;
		conceptRelation: number;
		semanticGroup: number;
		categoryMatch: number;
		multiTerm: number;
		compoundMatch: number;
		semanticMatch: number;
		abstractConcept: number;
		nameMatch: number;
		context: number;
		multiCategory: number;
		relatedTerm: number;
		priority: number;
		importance: number;
		partialMatch: number;
		coherence: number;
		abstractWord: number;
		concreteWord: number;
	};

	/**
	 * Parameters controlling result presentation
	 */
	resultControl: {
		/**
		 * Maximum word distance for proximity matching
		 */
		maxWordDistance: number;

		/**
		 * Factor to penalize length differences
		 */
		lengthPenaltyFactor: number;

		/**
		 * Boost factor for word count matches
		 */
		wordCountBoost: number;
	};

	/**
	 * Cache time-to-live in milliseconds
	 */
	cacheTTL: number;

	/**
	 * Maximum cache size
	 */
	cacheMaxSize: number;

	/**
	 * Minimum score threshold for results
	 */
	minScoreThreshold: number;
};

/**
 * Search parameters for icon search
 */
export interface SearchParams {
	/**
	 * User's search description
	 */
	description: string;

	/**
	 * Icon usage description
	 */
	usage: string;

	/**
	 * Icon category
	 */
	category: string;

	/**
	 * Icon name
	 */
	name: string;

	/**
	 * Icon tags
	 */
	tags: string[];
}

/**
 * Search scores using the same structure as weights
 */
export type SearchScores = Weights;

/**
 * Icon search specific options
 */
export interface IconSearchOptions {
	/**
	 * Whether this is a notification-related query
	 */
	isNotificationQuery: boolean;

	/**
	 * Set of categories related to notifications
	 */
	notificationCategories: Set<string>;
}

/**
 * Icon search result with scoring metadata
 */
export type ScoredIcon = {
	/**
	 * Icon name
	 */
	name: string;

	/**
	 * Overall search score
	 */
	score: number;

	/**
	 * Term frequency in the search
	 */
	termFrequency: number;

	/**
	 * Icon category
	 */
	category: string;

	/**
	 * Relevance boost factor
	 */
	relevanceBoost: number;
};

/**
 * Synonym group mapping type
 * Maps concept keys to arrays of related terms
 */
export type SynonymGroupMap = Record<string, string[]>;

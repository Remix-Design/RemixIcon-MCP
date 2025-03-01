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
		nameMatch: number;
		categoryMatch: number;
		multiTerm: number;
		compoundMatch: number;
		context: number;
		multiCategory: number;
		priority: number;
		importance: number;
		partialMatch: number;
		coherence: number;
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
 * Search parameters
 */
export interface SearchParams {
	/**
	 * Search description
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
 * Search scores for different aspects
 */
export type SearchScores = {
	cosine: number;
	category: number;
	tags: number;
	nameMatch: number;
	contextual: number;
};

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

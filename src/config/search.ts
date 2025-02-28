/**
 * Core search engine configuration
 */
export const SEARCH_ENGINE_CONFIG = {
	MAX_CACHE_SIZE: 3000, // Increased cache size
	MIN_SCORE_THRESHOLD: 0.15, // Maintained minimum score threshold

	// Search tuning parameters
	SEARCH_PARAMS: {
		// Core matching boosts
		EXACT_MATCH_BOOST: 2.2, // Increased for precise matches
		SEMANTIC_MATCH_BOOST: 2.0, // New parameter for semantic matching
		ABSTRACT_CONCEPT_BOOST: 1.8, // New parameter for abstract concepts
		NAME_MATCH_BOOST: 1.8, // Added for name matching
		MULTI_TERM_BOOST: 1.7, // Added for multi-term queries

		// Category and context boosts
		CATEGORY_BOOST: 1.6, // Increased for better category matching
		CONTEXT_BOOST: 1.5, // Increased for context relevance
		MULTI_CATEGORY_BOOST: 1.7, // Adjusted for cross-category matches

		// Semantic relationship boosts
		SYNONYM_MATCH_BOOST: 1.6, // Increased for synonym matching
		RELATED_TERM_BOOST: 1.4, // Increased for related terms
		SEMANTIC_GROUP_BOOST: 1.6, // Increased for semantic groups

		// Priority and importance
		PRIORITY_BOOST: 2.0, // Increased for priority items
		IMPORTANCE_BOOST: 1.8, // Adjusted for important matches

		// Thresholds
		SEMANTIC_THRESHOLD: 0.3, // Adjusted semantic threshold
		HIGH_SCORE_THRESHOLD: 0.7, // Increased high score threshold
		SEMANTIC_SIMILARITY_THRESHOLD: 0.65,

		// Result control
		MAX_RESULTS: 5,
		SECONDARY_RESULTS_THRESHOLD: 0.4,
		MIN_CATEGORY_SCORE: 0.3,

		// Advanced matching parameters
		COMPOUND_MATCH_BOOST: 1.9, // Increased for compound matches
		PARTIAL_MATCH_BOOST: 1.3, // Adjusted partial matching
		COHERENCE_BOOST: 1.4, // Increased coherence importance

		// New parameters for abstract concept handling
		ABSTRACT_WORD_BOOST: 1.7, // Boost for abstract term matches
		CONCRETE_WORD_BOOST: 1.5, // Boost for concrete term matches
		CONCEPT_RELATION_BOOST: 1.6, // Boost for concept relationships

		// Length and complexity handling
		LENGTH_PENALTY_FACTOR: 0.04,
		WORD_COUNT_BOOST: 0.12,
		MAX_WORD_DISTANCE: 4,
	},
};

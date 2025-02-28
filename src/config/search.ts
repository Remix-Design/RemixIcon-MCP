/**
 * Core search engine configuration
 */
export const SEARCH_ENGINE_CONFIG = {
	MAX_CACHE_SIZE: 3000, // Increased cache size
	MIN_SCORE_THRESHOLD: 0.15, // Maintained minimum score threshold

	// Search tuning parameters
	SEARCH_PARAMS: {
		MATCH_BOOST: 2.0, // Adjusted match boost
		SCORE_THRESHOLD: 0.2, // Maintained score threshold
		MAX_WORD_DISTANCE: 4, // Maintained word distance
		PRIORITY_BOOST: 1.8, // Adjusted priority boost
		SEMANTIC_THRESHOLD: 0.25, // Maintained semantic threshold
		EXACT_MATCH_BOOST: 2.0, // Adjusted exact match boost
		HIGH_SCORE_THRESHOLD: 0.65, // Adjusted high score threshold
		CATEGORY_BOOST: 1.4, // Adjusted category boost
		MULTI_TERM_BOOST: 1.4, // Adjusted multi-term boost
		CONTEXT_BOOST: 1.3, // Adjusted context boost
		NAME_MATCH_BOOST: 1.4, // Adjusted name match boost
		PRIORITY_TERM_BASE: 1.2, // Adjusted priority term base
		COMPOUND_MATCH_BOOST: 1.8, // Adjusted compound match boost
		MULTI_CATEGORY_BOOST: 1.5, // Adjusted multi-category boost
		SEMANTIC_GROUP_BOOST: 1.4, // Adjusted semantic group boost
		IMPORTANCE_BOOST: 1.6, // Adjusted importance boost
		FEEDBACK_BOOST: 1.5, // Adjusted feedback boost
		FORM_BOOST: 1.5, // Adjusted form boost
		CROSS_CATEGORY_BOOST: 1.2, // Adjusted cross-category boost
		PARTIAL_MATCH_BOOST: 1.1, // Adjusted partial match boost
		RELATED_TERM_BOOST: 1.1, // Adjusted related term boost
		COMPOUND_WORD_BOOST: 1.3, // Adjusted compound word boost
		SEMANTIC_SIMILARITY_THRESHOLD: 0.6, // Adjusted semantic similarity threshold

		// Result control parameters
		MAX_RESULTS: 5, // Maintained max results
		SECONDARY_RESULTS_THRESHOLD: 0.35, // Adjusted secondary results threshold
		MIN_CATEGORY_SCORE: 0.25, // Adjusted minimum category score
		SIMILAR_ICON_THRESHOLD: 0.75, // Adjusted similar icon threshold
		MAX_SIMILAR_ICONS: 2, // Maintained max similar icons

		// New scoring parameters
		SYNONYM_MATCH_BOOST: 1.2, // Boost for synonym matches
		DIRECT_SYNONYM_BOOST: 1.3, // Boost for direct synonym matches
		GROUP_SYNONYM_BOOST: 1.1, // Boost for group synonym matches
		COHERENCE_BOOST: 1.2, // Boost for query coherence
		LENGTH_PENALTY_FACTOR: 0.05, // Factor for length penalty
		WORD_COUNT_BOOST: 0.1, // Boost per additional word
		CATEGORY_COHERENCE_BOOST: 1.2, // Boost for category coherence
		TERM_RELATION_BOOST: 1.1, // Boost for related terms
	},
};

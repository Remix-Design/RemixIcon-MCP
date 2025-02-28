/**
 * Similarity calculation weights with balanced categories
 */
export const SIMILARITY_WEIGHTS = {
	cosine: 0.15, // Increased text similarity weight
	category: 0.2, // Adjusted category weight
	tags: 0.25, // Maintained tag relevance
	nameMatch: 0.2, // Maintained name matching
	semantic: 0.15, // Maintained semantic understanding
	contextual: 0.05, // Maintained context relevance
};

/**
 * Category weight configuration for balanced matching
 */
export const CATEGORY_WEIGHTS = {
	Design: { weight: 1.0, priority: 1 },
	System: { weight: 0.9, priority: 1 },
	Development: { weight: 0.9, priority: 1 },
	Business: { weight: 0.9, priority: 1 },
	Document: { weight: 0.8, priority: 2 },
	Communication: { weight: 0.8, priority: 2 },
	Media: { weight: 0.8, priority: 2 },
	Device: { weight: 0.8, priority: 2 },
	Map: { weight: 0.7, priority: 3 },
	Finance: { weight: 0.7, priority: 3 },
	Weather: { weight: 0.7, priority: 3 },
	Health: { weight: 0.7, priority: 3 },
};

/**
 * Semantic weight constants with adjusted values
 */
export const SEMANTIC_WEIGHTS = {
	PRIMARY: 1.4,
	HIGH: 1.2,
	MEDIUM: 1.0,
	NORMAL: 0.9,
	LOW: 0.8,
};

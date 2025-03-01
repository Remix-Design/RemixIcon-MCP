import { SearchConfig } from '../types/search.types';

/**
 * Default search configuration
 * Contains default values for search parameters
 */
export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
	weights: {
		cosine: 0.25,
		category: 0.15,
		tags: 0.15,
		nameMatch: 0.15,
		semantic: 0.2,
		contextual: 0.1,
	},
	thresholds: {
		similarity: 0.15,
		semantic: 0.25,
		highScore: 0.75,
		minScore: 0.15,
		secondaryResults: 0.4,
		categoryScore: 0.3,
	},
	cacheTTL: 3600000, // 1 hour in milliseconds
	cacheMaxSize: 1000,
	boosts: {
		exactMatch: 2.0,
		synonymMatch: 1.5,
		conceptRelation: 1.3,
		semanticGroup: 1.4,
		categoryMatch: 1.3,
		multiTerm: 1.2,
		compoundMatch: 1.3,
		semanticMatch: 1.5,
		abstractConcept: 1.1,
		nameMatch: 1.4,
		context: 1.2,
		multiCategory: 1.1,
		relatedTerm: 1.2,
		priority: 1.3,
		importance: 1.2,
		partialMatch: 0.8,
		coherence: 1.1,
		abstractWord: 0.9,
		concreteWord: 1.1,
	},
	resultControl: {
		maxWordDistance: 3,
		lengthPenaltyFactor: 0.1,
		wordCountBoost: 1.2,
	},
	minScoreThreshold: 0.15,
};

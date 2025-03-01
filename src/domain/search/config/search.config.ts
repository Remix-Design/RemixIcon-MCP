import { SearchConfig } from '../types/search.types';

/**
 * Default search configuration
 * Contains default values for search parameters
 */
export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
	weights: {
		cosine: 0.15,
		category: 0.35,
		tags: 0.28,
		nameMatch: 0.37,
		contextual: 0.18,
	},
	thresholds: {
		similarity: 0.05,
		highScore: 0.3,
		minScore: 0.05,
		secondaryResults: 0.1,
		categoryScore: 0.1,
	},
	cacheTTL: 3600000, // 1 hour in milliseconds
	cacheMaxSize: 1000,
	boosts: {
		exactMatch: 2.4,
		nameMatch: 2.2,
		categoryMatch: 2.2,
		multiTerm: 1.7,
		compoundMatch: 1.9,
		context: 1.6,
		multiCategory: 1.5,
		priority: 1.7,
		importance: 1.6,
		partialMatch: 1.5,
		coherence: 1.5,
	},
	resultControl: {
		maxWordDistance: 5,
		lengthPenaltyFactor: 0.03,
		wordCountBoost: 2.0,
	},
	minScoreThreshold: 0.05,
};

import { SearchConfig } from '../types/search';

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
		similarity: 0.65,
		semantic: 0.55,
		highScore: 0.75,
		minScore: 0.15,
		secondaryResults: 0.4,
		categoryScore: 0.3,
	},
	cache: {
		maxSize: 3000,
		ttl: 3600000, // 1 hour
	},
	boosts: {
		exactMatch: 2.2,
		synonymMatch: 1.6,
		conceptRelation: 1.6,
		semanticGroup: 1.6,
		categoryMatch: 1.6,
		multiTerm: 1.7,
		compoundMatch: 1.9,
		semanticMatch: 2.0,
		abstractConcept: 1.8,
		nameMatch: 1.8,
		context: 1.5,
		multiCategory: 1.7,
		relatedTerm: 1.4,
		priority: 2.0,
		importance: 1.8,
		partialMatch: 1.3,
		coherence: 1.4,
		abstractWord: 1.7,
		concreteWord: 1.5,
	},
	resultControl: {
		maxWordDistance: 4,
		lengthPenaltyFactor: 0.04,
		wordCountBoost: 0.12,
	},
};

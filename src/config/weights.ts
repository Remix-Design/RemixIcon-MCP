import { WeightConfig } from '../types/weights';

/**
 * Core weight configuration for search and matching
 */
export const weights: WeightConfig = {
	// Similarity weights for core matching
	similarity: {
		cosine: 0.15,
		category: 0.2,
		tags: 0.25,
		nameMatch: 0.2,
		semantic: 0.15,
		contextual: 0.05,
	},

	// Category weights with priorities
	categories: {
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
	},

	// Semantic weights for different match types
	semantic: {
		primary: 1.4,
		high: 1.2,
		medium: 1.0,
		normal: 0.9,
		low: 0.8,
	},
};

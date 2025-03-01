/**
 * Category weight configuration
 */
export interface CategoryWeight {
	weight: number;
	priority: number;
}

/**
 * Core weight configuration interface
 */
export interface WeightConfig {
	similarity: {
		cosine: number;
		category: number;
		tags: number;
		nameMatch: number;
		semantic: number;
		contextual: number;
	};
	categories: Record<string, CategoryWeight>;
	semantic: {
		primary: number;
		high: number;
		medium: number;
		normal: number;
		low: number;
	};
}

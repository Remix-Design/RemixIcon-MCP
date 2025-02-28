/**
 * Semantic word definition with weight and aliases
 */
export interface SemanticWord {
	word: string;
	weight?: number;
	aliases?: string[];
}

/**
 * Semantic group configuration
 */
export interface SemanticGroup {
	words: SemanticWord[];
	weight: number;
	related: string[];
	iconTypes?: string[];
	metadata?: {
		description?: string;
		category?: string;
		priority?: number;
	};
}

/**
 * Semantic group configuration map
 */
export interface SemanticGroupConfig {
	[key: string]: SemanticGroup;
}

/**
 * Category weight configuration
 */
export interface CategoryWeight {
	weight: number;
	priority: number;
}

/**
 * Synonym configuration
 */
export type SynonymMap = {
	readonly [key: string]: readonly string[];
};

/**
 * Synonym group configuration
 */
export type SynonymGroupMap = {
	readonly [key: string]: readonly string[];
};

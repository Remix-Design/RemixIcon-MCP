/**
 * Base semantic metadata interface
 */
export interface SemanticMetadata {
	description?: string;
	category?: string;
	priority?: number;
}

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
	metadata?: SemanticMetadata;
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
 * Readonly synonym mappings
 */
export type SynonymMap = Readonly<Record<string, readonly string[]>>;

/**
 * Readonly synonym group mappings
 */
export type SynonymGroupMap = Readonly<Record<string, readonly string[]>>;

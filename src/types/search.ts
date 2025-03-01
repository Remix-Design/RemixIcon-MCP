import { BaseConfig } from './core';

/**
 * Base weights configuration for similarity metrics
 */
export type Weights = {
	cosine: number;
	category: number;
	tags: number;
	nameMatch: number;
	semantic: number;
	contextual: number;
};

/**
 * Search configuration extending base config
 */
export type SearchConfig = BaseConfig & {
	weights: Weights;
	thresholds: {
		similarity: number;
		semantic: number;
		highScore: number;
		minScore: number;
		secondaryResults: number;
		categoryScore: number;
	};
	boosts: {
		exactMatch: number;
		synonymMatch: number;
		conceptRelation: number;
		semanticGroup: number;
		categoryMatch: number;
		multiTerm: number;
		compoundMatch: number;
		semanticMatch: number;
		abstractConcept: number;
		nameMatch: number;
		context: number;
		multiCategory: number;
		relatedTerm: number;
		priority: number;
		importance: number;
		partialMatch: number;
		coherence: number;
		abstractWord: number;
		concreteWord: number;
	};
	resultControl: {
		maxWordDistance: number;
		lengthPenaltyFactor: number;
		wordCountBoost: number;
	};
};

/**
 * Search parameters
 */
export interface SearchParams {
	description: string;
	usage: string;
	category: string;
	name: string;
	tags: string[];
}

/**
 * Search scores using the same structure as weights
 */
export type SearchScores = Weights;

/**
 * Icon search specific options
 */
export interface IconSearchOptions {
	isNotificationQuery: boolean;
	notificationCategories: Set<string>;
}

/**
 * Icon search result with scoring metadata
 */
export type ScoredIcon = {
	name: string;
	score: number;
	termFrequency: number;
	category: string;
	relevanceBoost: number;
};

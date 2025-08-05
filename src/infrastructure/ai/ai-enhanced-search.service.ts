import { ILogger } from '../logging/logger';
import { ErrorHandler, ErrorType } from '../error/error-handler';
import { IconMetadata, ResponseContent } from '../../domain/icon/types/icon.types';
import { SemanticSearchService, SemanticSearchResult } from './semantic-search.service';
import { IntentClassifierService, DetailedIntentResult } from './intent-classifier.service';
import { TelemetryService } from '../observability/telemetry.service';
import { UnifiedSearchService } from '../../domain/search/services/unified-search.service';

/**
 * AI-enhanced search result with comprehensive analysis
 */
export interface AIEnhancedResult {
	icon: IconMetadata;
	scores: {
		traditional: number;
		semantic: number;
		intent: number;
		combined: number;
	};
	matchTypes: string[];
	confidence: number;
	explanation: {
		why: string;
		how: string;
		alternatives: string[];
	};
	metadata: {
		processingTime: number;
		searchStrategy: string;
		aiContribution: number;
	};
}

/**
 * Search strategy configuration
 */
interface SearchStrategy {
	name: string;
	description: string;
	weights: {
		traditional: number;
		semantic: number;
		intent: number;
	};
	thresholds: {
		minConfidence: number;
		semanticSimilarity: number;
		intentRelevance: number;
	};
	enabled: boolean;
}

/**
 * AI search configuration
 */
interface AISearchConfig {
	enableSemanticSearch: boolean;
	enableIntentClassification: boolean;
	enableHybridScoring: boolean;
	adaptiveWeighting: boolean;
	strategies: Record<string, SearchStrategy>;
	defaultStrategy: string;
	maxResults: number;
	explanationDetail: 'minimal' | 'moderate' | 'detailed';
}

/**
 * Search performance analytics
 */
interface SearchAnalytics {
	totalSearches: number;
	avgProcessingTime: number;
	strategyUsage: Record<string, number>;
	aiAccuracy: {
		semanticHitRate: number;
		intentAccuracy: number;
		userSatisfaction: number;
	};
	improvementMetrics: {
		traditionalVsAI: number;
		semanticContribution: number;
		intentContribution: number;
	};
}

/**
 * AI-enhanced search service that combines multiple AI capabilities
 * Provides intelligent search with semantic understanding and intent recognition
 */
export class AIEnhancedSearchService {
	private readonly errorHandler: ErrorHandler;
	private readonly config: AISearchConfig;
	private readonly analytics: SearchAnalytics;
	
	// Search strategies
	private readonly searchStrategies: Record<string, SearchStrategy> = {
		balanced: {
			name: 'Balanced',
			description: 'Equal weight to traditional and AI-enhanced search',
			weights: { traditional: 0.4, semantic: 0.4, intent: 0.2 },
			thresholds: { minConfidence: 0.6, semanticSimilarity: 0.7, intentRelevance: 0.6 },
			enabled: true
		},
		semantic_focused: {
			name: 'Semantic Focused',
			description: 'Prioritizes semantic understanding and context',
			weights: { traditional: 0.2, semantic: 0.6, intent: 0.2 },
			thresholds: { minConfidence: 0.7, semanticSimilarity: 0.8, intentRelevance: 0.5 },
			enabled: true
		},
		intent_driven: {
			name: 'Intent Driven',
			description: 'Focuses on user intent and contextual understanding',
			weights: { traditional: 0.3, semantic: 0.3, intent: 0.4 },
			thresholds: { minConfidence: 0.65, semanticSimilarity: 0.6, intentRelevance: 0.8 },
			enabled: true
		},
		traditional_plus: {
			name: 'Traditional Plus',
			description: 'Traditional search enhanced with AI insights',
			weights: { traditional: 0.7, semantic: 0.2, intent: 0.1 },
			thresholds: { minConfidence: 0.5, semanticSimilarity: 0.5, intentRelevance: 0.4 },
			enabled: true
		},
		ai_first: {
			name: 'AI First',
			description: 'Primarily AI-driven with traditional backup',
			weights: { traditional: 0.1, semantic: 0.5, intent: 0.4 },
			thresholds: { minConfidence: 0.8, semanticSimilarity: 0.85, intentRelevance: 0.7 },
			enabled: true
		}
	};

	constructor(
		private readonly logger: ILogger,
		private readonly traditionalSearch: UnifiedSearchService,
		private readonly semanticSearch: SemanticSearchService,
		private readonly intentClassifier: IntentClassifierService,
		private readonly telemetryService?: TelemetryService,
		config?: Partial<AISearchConfig>
	) {
		this.config = {
			enableSemanticSearch: true,
			enableIntentClassification: true,
			enableHybridScoring: true,
			adaptiveWeighting: true,
			strategies: this.searchStrategies,
			defaultStrategy: 'balanced',
			maxResults: 20,
			explanationDetail: 'moderate',
			...config
		};
		
		this.errorHandler = new ErrorHandler(logger);
		
		// Initialize analytics
		this.analytics = {
			totalSearches: 0,
			avgProcessingTime: 0,
			strategyUsage: {},
			aiAccuracy: {
				semanticHitRate: 0,
				intentAccuracy: 0,
				userSatisfaction: 0
			},
			improvementMetrics: {
				traditionalVsAI: 0,
				semanticContribution: 0,
				intentContribution: 0
			}
		};
	}

	/**
	 * Initialize the AI search service
	 */
	async initialize(icons: IconMetadata[]): Promise<void> {
		try {
			this.logger.info('Initializing AI-enhanced search service');
			
			// Initialize semantic search if enabled
			if (this.config.enableSemanticSearch) {
				await this.semanticSearch.initialize(icons);
			}
			
			this.logger.info('AI-enhanced search service initialized successfully');
			
		} catch (error) {
			this.logger.error('Failed to initialize AI-enhanced search service', { error: error.message });
			throw error;
		}
	}

	/**
	 * Perform AI-enhanced search with intelligent strategy selection
	 */
	async search(
		query: string,
		icons: IconMetadata[],
		userId?: string,
		sessionId?: string,
		strategyName?: string
	): Promise<AIEnhancedResult[]> {
		const startTime = Date.now();
		this.analytics.totalSearches++;
		
		const result = await this.errorHandler.safeExecute(
			async () => {
				// Classify user intent first
				let intent: DetailedIntentResult | null = null;
				if (this.config.enableIntentClassification) {
					intent = await this.intentClassifier.classifyIntent(query, userId, sessionId);
				}
				
				// Select search strategy
				const strategy = this.selectSearchStrategy(query, intent, strategyName);
				this.analytics.strategyUsage[strategy.name] = (this.analytics.strategyUsage[strategy.name] || 0) + 1;
				
				// Execute multi-modal search
				const searchResults = await this.executeMultiModalSearch(query, icons, strategy, intent);
				
				// Enhance results with AI insights
				const enhancedResults = await this.enhanceResults(searchResults, query, intent, strategy);
				
				// Apply final ranking and filtering
				const finalResults = this.rankAndFilterResults(enhancedResults, strategy);
				
				const processingTime = Date.now() - startTime;
				this.updateAnalytics(processingTime, strategy, finalResults);
				
				this.logger.debug('AI-enhanced search completed', {
					query,
					strategy: strategy.name,
					resultsCount: finalResults.length,
					processingTime,
					intentConfidence: intent?.confidence
				});
				
				// Record telemetry
				this.telemetryService?.recordSearchMetrics({
					operation: 'ai_enhanced_search',
					duration: processingTime,
					resultCount: finalResults.length,
					cacheHit: false,
					stage: strategy.name,
					query
				});
				
				return finalResults;
			},
			ErrorType.SEARCH,
			'AI-enhanced search',
			{ query, userId, sessionId }
		);
		
		return result.success ? result.data : [];
	}

	/**
	 * Get personalized search recommendations
	 */
	async getRecommendations(
		userId: string,
		sessionId?: string,
		context?: {
			recentQueries?: string[];
			preferredCategories?: string[];
			searchPatterns?: string[];
		}
	): Promise<{
		suggestedQueries: string[];
		trendingIcons: string[];
		personalizedCategories: string[];
		tips: string[];
	}> {
		try {
			// This would typically use user behavior analysis and ML models
			// For now, we'll provide intelligent suggestions based on patterns
			
			const suggestions = {
				suggestedQueries: [
					'home dashboard icons',
					'user profile elements',
					'navigation menu items',
					'action buttons collection'
				],
				trendingIcons: [
					'home-line',
					'user-line',
					'settings-line',
					'search-line'
				],
				personalizedCategories: [
					'System',
					'User & Faces',
					'Business',
					'Design'
				],
				tips: [
					'Use descriptive keywords for better semantic matches',
					'Try category-specific searches for focused results',
					'Combine action words with object names for precise results'
				]
			};
			
			// Enhance with context if available
			if (context?.preferredCategories) {
				suggestions.personalizedCategories = context.preferredCategories;
			}
			
			if (context?.recentQueries) {
				// Generate related suggestions based on recent queries
				const relatedSuggestions = this.generateRelatedSuggestions(context.recentQueries);
				suggestions.suggestedQueries = [...relatedSuggestions, ...suggestions.suggestedQueries].slice(0, 6);
			}
			
			return suggestions;
			
		} catch (error) {
			this.logger.error('Failed to generate recommendations', { error: error.message, userId });
			return {
				suggestedQueries: [],
				trendingIcons: [],
				personalizedCategories: [],
				tips: []
			};
		}
	}

	/**
	 * Analyze search quality and provide improvement suggestions
	 */
	async analyzeSearchQuality(
		query: string,
		results: AIEnhancedResult[],
		userFeedback?: {
			satisfied: boolean;
			selectedIcons: string[];
			rejectedSuggestions: string[];
		}
	): Promise<{
		qualityScore: number;
		strengths: string[];
		improvements: string[];
		suggestedRefinements: string[];
	}> {
		let qualityScore = 0.7; // Base score
		const strengths: string[] = [];
		const improvements: string[] = [];
		const suggestedRefinements: string[] = [];
		
		// Analyze result quality
		if (results.length > 0) {
			const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
			qualityScore = avgConfidence;
			
			if (avgConfidence > 0.8) {
				strengths.push('High confidence matches found');
			} else if (avgConfidence < 0.6) {
				improvements.push('Consider using more specific keywords');
				suggestedRefinements.push(`Try: "${query} icon" or "${query} symbol"`);
			}
			
			// Analyze AI contribution
			const avgAIContribution = results.reduce((sum, r) => sum + r.metadata.aiContribution, 0) / results.length;
			if (avgAIContribution > 0.5) {
				strengths.push('AI semantic understanding helped find relevant matches');
			}
			
			// Check for diverse match types
			const matchTypes = new Set(results.flatMap(r => r.matchTypes));
			if (matchTypes.size > 2) {
				strengths.push('Multiple matching strategies provided diverse results');
			}
		} else {
			qualityScore = 0.2;
			improvements.push('No matches found - try broader or different keywords');
			suggestedRefinements.push('Try category names or common synonyms');
		}
		
		// Incorporate user feedback
		if (userFeedback) {
			if (userFeedback.satisfied) {
				qualityScore = Math.min(1.0, qualityScore + 0.2);
				strengths.push('User satisfaction confirmed search quality');
			} else {
				qualityScore = Math.max(0.1, qualityScore - 0.3);
				improvements.push('User feedback indicates unsatisfactory results');
			}
			
			if (userFeedback.selectedIcons.length === 0) {
				improvements.push('No icons were selected - consider alternative search terms');
			}
		}
		
		return {
			qualityScore: Math.round(qualityScore * 100) / 100,
			strengths,
			improvements,
			suggestedRefinements
		};
	}

	/**
	 * Get comprehensive analytics
	 */
	getAnalytics(): SearchAnalytics & {
		configStats: {
			enabledStrategies: number;
			defaultStrategy: string;
			aiFeatures: string[];
		};
		performanceBreakdown: {
			traditionalSearchTime: number;
			semanticSearchTime: number;
			intentClassificationTime: number;
			totalProcessingTime: number;
		};
	} {
		const enabledStrategies = Object.values(this.config.strategies).filter(s => s.enabled).length;
		const aiFeatures = [];
		if (this.config.enableSemanticSearch) aiFeatures.push('semantic_search');
		if (this.config.enableIntentClassification) aiFeatures.push('intent_classification');
		if (this.config.enableHybridScoring) aiFeatures.push('hybrid_scoring');
		if (this.config.adaptiveWeighting) aiFeatures.push('adaptive_weighting');
		
		return {
			...this.analytics,
			configStats: {
				enabledStrategies,
				defaultStrategy: this.config.defaultStrategy,
				aiFeatures
			},
			performanceBreakdown: {
				traditionalSearchTime: 0, // Would be calculated from telemetry
				semanticSearchTime: 0, // Would be calculated from telemetry
				intentClassificationTime: 0, // Would be calculated from telemetry
				totalProcessingTime: this.analytics.avgProcessingTime
			}
		};
	}

	/**
	 * Clear all AI search data
	 */
	clear(): void {
		this.semanticSearch.clear();
		this.intentClassifier.clear();
		
		// Reset analytics
		Object.assign(this.analytics, {
			totalSearches: 0,
			avgProcessingTime: 0,
			strategyUsage: {},
			aiAccuracy: {
				semanticHitRate: 0,
				intentAccuracy: 0,
				userSatisfaction: 0
			},
			improvementMetrics: {
				traditionalVsAI: 0,
				semanticContribution: 0,
				intentContribution: 0
			}
		});
		
		this.logger.info('AI-enhanced search service cleared');
	}

	/**
	 * Select optimal search strategy based on query and intent
	 */
	private selectSearchStrategy(
		query: string,
		intent: DetailedIntentResult | null,
		requestedStrategy?: string
	): SearchStrategy {
		// Use requested strategy if specified and enabled
		if (requestedStrategy && this.config.strategies[requestedStrategy]?.enabled) {
			return this.config.strategies[requestedStrategy];
		}
		
		// Adaptive strategy selection based on query characteristics
		if (this.config.adaptiveWeighting && intent) {
			// Intent-driven selection
			if (intent.intent.includes('compare') || intent.intent.includes('analyze')) {
				return this.config.strategies.semantic_focused;
			}
			
			if (intent.intent.includes('help') || intent.confidence < 0.6) {
				return this.config.strategies.intent_driven;
			}
			
			if (intent.context.userExperience === 'expert') {
				return this.config.strategies.traditional_plus;
			}
			
			if (intent.context.queryType === 'complex') {
				return this.config.strategies.ai_first;
			}
		}
		
		// Query complexity-based selection
		const wordCount = query.split(/\s+/).length;
		if (wordCount === 1) {
			return this.config.strategies.traditional_plus;
		} else if (wordCount > 5) {
			return this.config.strategies.semantic_focused;
		}
		
		// Default to balanced strategy
		return this.config.strategies[this.config.defaultStrategy];
	}

	/**
	 * Execute multi-modal search combining different approaches
	 */
	private async executeMultiModalSearch(
		query: string,
		icons: IconMetadata[],
		strategy: SearchStrategy,
		intent: DetailedIntentResult | null
	): Promise<{
		traditional: ResponseContent[];
		semantic: SemanticSearchResult[];
		intentContext: DetailedIntentResult | null;
	}> {
		const promises: Promise<any>[] = [];
		
		// Traditional search
		promises.push(
			this.traditionalSearch.findIcons(query, this.config.maxResults * 2)
				.catch(error => {
					this.logger.warn('Traditional search failed', { error: error.message });
					return [];
				})
		);
		
		// Semantic search
		if (this.config.enableSemanticSearch && strategy.weights.semantic > 0) {
			promises.push(
				this.semanticSearch.semanticSearch(query, icons, this.config.maxResults)
					.catch(error => {
						this.logger.warn('Semantic search failed', { error: error.message });
						return [];
					})
			);
		} else {
			promises.push(Promise.resolve([]));
		}
		
		const [traditional, semantic] = await Promise.all(promises);
		
		return {
			traditional,
			semantic,
			intentContext: intent
		};
	}

	/**
	 * Enhance search results with AI insights
	 */
	private async enhanceResults(
		searchResults: {
			traditional: ResponseContent[];
			semantic: SemanticSearchResult[];
			intentContext: DetailedIntentResult | null;
		},
		query: string,
		intent: DetailedIntentResult | null,
		strategy: SearchStrategy
	): Promise<AIEnhancedResult[]> {
		const enhancedResults = new Map<string, AIEnhancedResult>();
		
		// Process traditional results
		for (const result of searchResults.traditional) {
			const iconName = this.extractIconName(result);
			if (!iconName) continue;
			
			const icon = this.findIconByName(iconName);
			if (!icon) continue;
			
			enhancedResults.set(iconName, {
				icon,
				scores: {
					traditional: 0.8, // Estimated score
					semantic: 0,
					intent: 0,
					combined: 0
				},
				matchTypes: ['traditional'],
				confidence: 0.8,
				explanation: {
					why: 'Matched traditional search patterns',
					how: 'Keyword and tag matching',
					alternatives: []
				},
				metadata: {
					processingTime: 0,
					searchStrategy: strategy.name,
					aiContribution: 0
				}
			});
		}
		
		// Process semantic results
		for (const result of searchResults.semantic) {
			const existing = enhancedResults.get(result.icon.name);
			
			if (existing) {
				// Combine with existing traditional result
				existing.scores.semantic = result.semanticScore;
				existing.matchTypes.push('semantic');
				existing.confidence = Math.max(existing.confidence, result.semanticScore);
				existing.explanation.why += `, semantic similarity (${(result.semanticScore * 100).toFixed(0)}%)`;
				existing.metadata.aiContribution = 0.5;
			} else {
				// Create new semantic-only result
				enhancedResults.set(result.icon.name, {
					icon: result.icon,
					scores: {
						traditional: 0,
						semantic: result.semanticScore,
						intent: 0,
						combined: 0
					},
					matchTypes: ['semantic'],
					confidence: result.semanticScore,
					explanation: {
						why: result.explanation,
						how: 'AI semantic vector similarity',
						alternatives: []
					},
					metadata: {
						processingTime: 0,
						searchStrategy: strategy.name,
						aiContribution: 1.0
					}
				});
			}
		}
		
		// Apply intent scoring and calculate combined scores
		for (const [iconName, result] of enhancedResults.entries()) {
			// Calculate intent score
			if (intent && strategy.weights.intent > 0) {
				result.scores.intent = this.calculateIntentScore(result.icon, intent);
				if (result.scores.intent > 0.5) {
					result.matchTypes.push('intent');
					result.explanation.why += `, intent relevance (${intent.intent})`;
					result.metadata.aiContribution = Math.max(result.metadata.aiContribution, 0.3);
				}
			}
			
			// Calculate combined score
			result.scores.combined = this.calculateCombinedScore(result.scores, strategy.weights);
			result.confidence = result.scores.combined;
			
			// Generate alternatives
			result.explanation.alternatives = this.generateAlternatives(result.icon, query);
		}
		
		return Array.from(enhancedResults.values());
	}

	/**
	 * Calculate intent-based score for an icon
	 */
	private calculateIntentScore(icon: IconMetadata, intent: DetailedIntentResult): number {
		let score = 0;
		
		// Category matching
		for (const entity of intent.entities) {
			if (entity.type === 'category' && 
				icon.category.toLowerCase().includes(entity.value.toLowerCase())) {
				score += entity.confidence * 0.4;
			}
		}
		
		// Intent-specific scoring
		switch (intent.intent) {
			case 'search_specific':
				// Boost commonly used icons
				if (icon.usage.includes('common') || icon.usage.includes('popular')) {
					score += 0.3;
				}
				break;
			case 'filter_refine':
				// Boost category-representative icons
				if (icon.usage.includes('category') || icon.name.includes(icon.category.toLowerCase())) {
					score += 0.4;
				}
				break;
			case 'navigation':
				// Boost navigation-related icons
				if (['home', 'menu', 'arrow', 'chevron'].some(nav => icon.name.includes(nav))) {
					score += 0.5;
				}
				break;
		}
		
		return Math.min(1.0, score * intent.confidence);
	}

	/**
	 * Calculate combined score using strategy weights
	 */
	private calculateCombinedScore(
		scores: { traditional: number; semantic: number; intent: number },
		weights: { traditional: number; semantic: number; intent: number }
	): number {
		return (
			scores.traditional * weights.traditional +
			scores.semantic * weights.semantic +
			scores.intent * weights.intent
		);
	}

	/**
	 * Rank and filter results based on strategy thresholds
	 */
	private rankAndFilterResults(
		results: AIEnhancedResult[],
		strategy: SearchStrategy
	): AIEnhancedResult[] {
		// Filter by minimum confidence
		const filtered = results.filter(result => 
			result.confidence >= strategy.thresholds.minConfidence &&
			(result.scores.semantic === 0 || result.scores.semantic >= strategy.thresholds.semanticSimilarity) &&
			(result.scores.intent === 0 || result.scores.intent >= strategy.thresholds.intentRelevance)
		);
		
		// Sort by combined score
		filtered.sort((a, b) => b.scores.combined - a.scores.combined);
		
		// Limit results
		return filtered.slice(0, this.config.maxResults);
	}

	/**
	 * Extract icon name from response content
	 */
	private extractIconName(response: ResponseContent): string | null {
		if (response.type !== 'text') return null;
		const match = response.text.match(/^([^\s]+)/);
		return match ? match[1] : null;
	}

	/**
	 * Find icon by name (placeholder - would use actual icon data)
	 */
	private findIconByName(name: string): IconMetadata | null {
		// This would be replaced with actual icon lookup
		return {
			name,
			category: 'System',
			tags: ['icon'],
			usage: 'General purpose icon'
		};
	}

	/**
	 * Generate alternative suggestions for an icon
	 */
	private generateAlternatives(icon: IconMetadata, query: string): string[] {
		const alternatives: string[] = [];
		
		// Category-based alternatives
		alternatives.push(`${icon.category.toLowerCase()} icons`);
		
		// Tag-based alternatives
		for (const tag of icon.tags.slice(0, 2)) {
			alternatives.push(`${tag} variations`);
		}
		
		// Synonym suggestions
		if (query.includes('home')) alternatives.push('house, dashboard, main');
		if (query.includes('user')) alternatives.push('profile, person, account');
		if (query.includes('settings')) alternatives.push('config, preferences, options');
		
		return alternatives.slice(0, 3);
	}

	/**
	 * Generate related suggestions based on recent queries
	 */
	private generateRelatedSuggestions(recentQueries: string[]): string[] {
		const suggestions: string[] = [];
		const commonWords = new Map<string, number>();
		
		// Analyze common words in recent queries
		for (const query of recentQueries) {
			const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
			for (const word of words) {
				commonWords.set(word, (commonWords.get(word) || 0) + 1);
			}
		}
		
		// Generate suggestions based on common words
		const sortedWords = Array.from(commonWords.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3);
		
		for (const [word] of sortedWords) {
			suggestions.push(`${word} collection`);
			suggestions.push(`${word} variations`);
		}
		
		return suggestions.slice(0, 4);
	}

	/**
	 * Update analytics with search results
	 */
	private updateAnalytics(
		processingTime: number,
		strategy: SearchStrategy,
		results: AIEnhancedResult[]
	): void {
		// Update average processing time
		this.analytics.avgProcessingTime = 
			(this.analytics.avgProcessingTime + processingTime) / Math.min(this.analytics.totalSearches, 100);
		
		// Calculate AI contribution metrics
		if (results.length > 0) {
			const avgAIContribution = results.reduce((sum, r) => sum + r.metadata.aiContribution, 0) / results.length;
			this.analytics.improvementMetrics.semanticContribution = 
				(this.analytics.improvementMetrics.semanticContribution + avgAIContribution) / 2;
			
			const semanticResults = results.filter(r => r.matchTypes.includes('semantic'));
			if (semanticResults.length > 0) {
				this.analytics.aiAccuracy.semanticHitRate = 
					(this.analytics.aiAccuracy.semanticHitRate + (semanticResults.length / results.length)) / 2;
			}
		}
	}
}
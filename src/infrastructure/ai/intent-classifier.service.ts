import { ILogger } from '../logging/logger';
import { ErrorHandler, ErrorType } from '../error/error-handler';
import { TelemetryService } from '../observability/telemetry.service';

/**
 * Intent classification result with detailed analysis
 */
export interface DetailedIntentResult {
	intent: string;
	confidence: number;
	category: string;
	subcategory?: string;
	entities: Array<{
		type: string;
		value: string;
		confidence: number;
		startPos?: number;
		endPos?: number;
	}>;
	sentiment: {
		label: 'positive' | 'negative' | 'neutral';
		score: number;
	};
	context: {
		queryType: 'simple' | 'complex' | 'conversational';
		userExperience: 'beginner' | 'intermediate' | 'expert';
		urgency: 'low' | 'medium' | 'high';
	};
	reasoning: string[];
	suggestions: string[];
}

/**
 * Intent classification configuration
 */
interface IntentConfig {
	enableMLClassification: boolean;
	enableRuleBasedFallback: boolean;
	confidenceThreshold: number;
	maxContextHistory: number;
	enableSentimentAnalysis: boolean;
	enableEntityExtraction: boolean;
	cacheEnabled: boolean;
	cacheTTL: number;
}

/**
 * Query context for improved classification
 */
interface QueryContext {
	previousQueries: string[];
	userSession: {
		startTime: number;
		queryCount: number;
		averageComplexity: number;
		preferredCategories: string[];
	};
	searchHistory: {
		successfulQueries: string[];
		failedQueries: string[];
		commonPatterns: string[];
	};
}

/**
 * Classification cache entry
 */
interface ClassificationCacheEntry {
	query: string;
	result: DetailedIntentResult;
	timestamp: number;
	hitCount: number;
}

/**
 * Advanced intent classifier service using Cloudflare Workers AI
 * Provides sophisticated query understanding and user intent analysis
 */
export class IntentClassifierService {
	private readonly errorHandler: ErrorHandler;
	private readonly config: IntentConfig;
	private readonly classificationCache = new Map<string, ClassificationCacheEntry>();
	private readonly queryContexts = new Map<string, QueryContext>();
	
	// Enhanced intent patterns with weights and contexts
	private readonly intentRules = {
		search_specific: {
			patterns: ['find', 'search for', 'looking for', 'need', 'where is', 'show me'],
			weight: 0.9,
			contexts: ['specific', 'targeted'],
			entities: ['object', 'action']
		},
		search_exploratory: {
			patterns: ['explore', 'browse', 'what are', 'see all', 'discover'],
			weight: 0.8,
			contexts: ['exploration', 'discovery'],
			entities: ['category', 'type']
		},
		filter_refine: {
			patterns: ['filter', 'only show', 'exclude', 'without', 'category', 'type of'],
			weight: 0.85,
			contexts: ['refinement', 'filtering'],
			entities: ['category', 'attribute', 'value']
		},
		compare_analyze: {
			patterns: ['compare', 'difference', 'similar to', 'like', 'versus', 'vs'],
			weight: 0.8,
			contexts: ['comparison', 'analysis'],
			entities: ['object1', 'object2', 'attribute']
		},
		recommend_suggest: {
			patterns: ['recommend', 'suggest', 'best', 'good for', 'suitable', 'appropriate'],
			weight: 0.75,
			contexts: ['recommendation', 'advice'],
			entities: ['use_case', 'context', 'preference']
		},
		help_support: {
			patterns: ['help', 'how to', 'tutorial', 'guide', 'explain', 'what does'],
			weight: 0.7,
			contexts: ['assistance', 'learning'],
			entities: ['topic', 'action', 'concept']
		},
		navigation: {
			patterns: ['go to', 'navigate', 'back', 'home', 'menu', 'section'],
			weight: 0.9,
			contexts: ['navigation', 'movement'],
			entities: ['destination', 'direction']
		}
	};

	// Entity recognition patterns
	private readonly entityPatterns = {
		category: {
			patterns: ['business', 'design', 'system', 'user', 'media', 'device', 'weather', 'finance'],
			type: 'category'
		},
		action: {
			patterns: ['click', 'select', 'open', 'close', 'edit', 'delete', 'add', 'remove', 'save', 'cancel'],
			type: 'action'
		},
		object: {
			patterns: ['icon', 'button', 'menu', 'form', 'page', 'panel', 'modal', 'tooltip'],
			type: 'ui_element'
		},
		attribute: {
			patterns: ['color', 'size', 'style', 'theme', 'outline', 'filled', 'solid'],
			type: 'attribute'
		},
		context: {
			patterns: ['mobile', 'desktop', 'web', 'app', 'interface', 'dashboard', 'profile'],
			type: 'context'
		}
	};

	constructor(
		private readonly logger: ILogger,
		private readonly workersAI: any, // Cloudflare Workers AI binding
		private readonly telemetryService?: TelemetryService,
		config?: Partial<IntentConfig>
	) {
		this.config = {
			enableMLClassification: true,
			enableRuleBasedFallback: true,
			confidenceThreshold: 0.6,
			maxContextHistory: 10,
			enableSentimentAnalysis: true,
			enableEntityExtraction: true,
			cacheEnabled: true,
			cacheTTL: 3600000, // 1 hour
			...config
		};
		
		this.errorHandler = new ErrorHandler(logger);
		
		// Clean up old cache entries periodically
		if (this.config.cacheEnabled) {
			setInterval(() => this.cleanupCache(), 300000); // Every 5 minutes
		}
	}

	/**
	 * Classify query intent with comprehensive analysis
	 */
	async classifyIntent(
		query: string,
		userId?: string,
		sessionId?: string,
		context?: Partial<QueryContext>
	): Promise<DetailedIntentResult> {
		const startTime = Date.now();
		const cacheKey = this.generateCacheKey(query, userId, sessionId);
		
		// Check cache first
		if (this.config.cacheEnabled) {
			const cached = this.classificationCache.get(cacheKey);
			if (cached && this.isCacheValid(cached)) {
				cached.hitCount++;
				return cached.result;
			}
		}
		
		const result = await this.errorHandler.safeExecute(
			async () => {
				// Get or create query context
				const queryContext = this.getQueryContext(userId || sessionId || 'anonymous', context);
				
				// Perform comprehensive classification
				const classification = await this.performClassification(query, queryContext);
				
				// Update query context
				this.updateQueryContext(userId || sessionId || 'anonymous', query, classification);
				
				// Cache the result
				if (this.config.cacheEnabled) {
					this.classificationCache.set(cacheKey, {
						query,
						result: classification,
						timestamp: Date.now(),
						hitCount: 1
					});
				}
				
				const duration = Date.now() - startTime;
				this.logger.debug('Intent classified', {
					query,
					intent: classification.intent,
					confidence: classification.confidence,
					entities: classification.entities.length,
					duration
				});
				
				// Record telemetry
				this.telemetryService?.recordSearchMetrics({
					operation: 'intent_classification',
					duration,
					resultCount: 1,
					cacheHit: this.config.cacheEnabled && this.classificationCache.has(cacheKey),
					query
				});
				
				return classification;
			},
			ErrorType.SEARCH,
			'intent classification',
			{ query, userId, sessionId }
		);
		
		return result.success ? result.data : this.createDefaultIntent(query);
	}

	/**
	 * Analyze query complexity and user experience level
	 */
	analyzeQueryComplexity(query: string): {
		complexity: 'simple' | 'medium' | 'complex';
		score: number;
		factors: string[];
	} {
		const factors: string[] = [];
		let score = 0;
		
		// Word count factor
		const wordCount = query.split(/\s+/).length;
		if (wordCount === 1) {
			factors.push('single word');
			score += 1;
		} else if (wordCount <= 3) {
			factors.push('short phrase');
			score += 2;
		} else if (wordCount <= 6) {
			factors.push('medium phrase');
			score += 3;
		} else {
			factors.push('long phrase');
			score += 4;
		}
		
		// Question indicators
		if (/^(how|what|where|when|why|which|who)\b/i.test(query)) {
			factors.push('question format');
			score += 2;
		}
		
		// Multiple concepts
		if (query.includes(' and ') || query.includes(' or ') || query.includes(',')) {
			factors.push('multiple concepts');
			score += 3;
		}
		
		// Technical terms
		const technicalTerms = ['interface', 'component', 'element', 'functionality', 'implementation'];
		if (technicalTerms.some(term => query.toLowerCase().includes(term))) {
			factors.push('technical terms');
			score += 2;
		}
		
		// Comparative language
		if (/\b(better|best|vs|versus|compare|similar|different)\b/i.test(query)) {
			factors.push('comparative language');
			score += 2;
		}
		
		// Determine complexity level
		let complexity: 'simple' | 'medium' | 'complex';
		if (score <= 3) complexity = 'simple';
		else if (score <= 6) complexity = 'medium';
		else complexity = 'complex';
		
		return { complexity, score, factors };
	}

	/**
	 * Get classification analytics
	 */
	getAnalytics(): {
		cacheStats: {
			size: number;
			hitRate: number;
			avgConfidence: number;
		};
		intentDistribution: Array<{ intent: string; count: number; avgConfidence: number }>;
		complexityDistribution: { simple: number; medium: number; complex: number };
		entityStats: Array<{ type: string; count: number; avgConfidence: number }>;
		performanceStats: {
			avgClassificationTime: number;
			mlClassificationRate: number;
			fallbackRate: number;
		};
	} {
		const cacheEntries = Array.from(this.classificationCache.values());
		const totalHits = cacheEntries.reduce((sum, entry) => sum + entry.hitCount, 0);
		const avgHitRate = cacheEntries.length > 0 ? totalHits / cacheEntries.length : 0;
		const avgConfidence = cacheEntries.length > 0 
			? cacheEntries.reduce((sum, entry) => sum + entry.result.confidence, 0) / cacheEntries.length 
			: 0;
		
		// Intent distribution
		const intentCounts = new Map<string, { count: number; totalConfidence: number }>();
		for (const entry of cacheEntries) {
			const stats = intentCounts.get(entry.result.intent) || { count: 0, totalConfidence: 0 };
			stats.count++;
			stats.totalConfidence += entry.result.confidence;
			intentCounts.set(entry.result.intent, stats);
		}
		
		const intentDistribution = Array.from(intentCounts.entries()).map(([intent, stats]) => ({
			intent,
			count: stats.count,
			avgConfidence: stats.count > 0 ? stats.totalConfidence / stats.count : 0
		}));
		
		// Complexity distribution
		const complexityDistribution = { simple: 0, medium: 0, complex: 0 };
		for (const entry of cacheEntries) {
			complexityDistribution[entry.result.context.queryType as keyof typeof complexityDistribution]++;
		}
		
		// Entity statistics
		const entityStats = new Map<string, { count: number; totalConfidence: number }>();
		for (const entry of cacheEntries) {
			for (const entity of entry.result.entities) {
				const stats = entityStats.get(entity.type) || { count: 0, totalConfidence: 0 };
				stats.count++;
				stats.totalConfidence += entity.confidence;
				entityStats.set(entity.type, stats);
			}
		}
		
		const entityDistribution = Array.from(entityStats.entries()).map(([type, stats]) => ({
			type,
			count: stats.count,
			avgConfidence: stats.count > 0 ? stats.totalConfidence / stats.count : 0
		}));
		
		return {
			cacheStats: {
				size: this.classificationCache.size,
				hitRate: avgHitRate,
				avgConfidence
			},
			intentDistribution,
			complexityDistribution,
			entityStats: entityDistribution,
			performanceStats: {
				avgClassificationTime: 0, // Would be calculated from telemetry
				mlClassificationRate: 0.8, // Estimated
				fallbackRate: 0.2 // Estimated
			}
		};
	}

	/**
	 * Clear classification cache and contexts
	 */
	clear(): void {
		this.classificationCache.clear();
		this.queryContexts.clear();
		this.logger.info('Intent classifier service cleared');
	}

	/**
	 * Perform comprehensive intent classification
	 */
	private async performClassification(query: string, context: QueryContext): Promise<DetailedIntentResult> {
		// Start with rule-based classification
		const ruleBasedResult = this.classifyWithRules(query, context);
		
		// Enhance with ML classification if enabled
		let mlResult: Partial<DetailedIntentResult> = {};
		if (this.config.enableMLClassification) {
			try {
				mlResult = await this.classifyWithML(query);
			} catch (error) {
				this.logger.warn('ML classification failed, using rule-based fallback', { error: error.message });
			}
		}
		
		// Combine results
		const combinedResult = this.combineClassificationResults(ruleBasedResult, mlResult, context);
		
		// Analyze sentiment if enabled
		if (this.config.enableSentimentAnalysis) {
			combinedResult.sentiment = await this.analyzeSentiment(query);
		}
		
		// Extract entities if enabled
		if (this.config.enableEntityExtraction) {
			combinedResult.entities = this.extractEntities(query);
		}
		
		// Analyze query complexity and context
		const complexityAnalysis = this.analyzeQueryComplexity(query);
		combinedResult.context = {
			queryType: complexityAnalysis.complexity === 'simple' ? 'simple' : 
					   complexityAnalysis.complexity === 'medium' ? 'complex' : 'conversational',
			userExperience: this.inferUserExperience(query, context),
			urgency: this.inferUrgency(query)
		};
		
		// Generate suggestions
		combinedResult.suggestions = this.generateSuggestions(combinedResult, context);
		
		return combinedResult as DetailedIntentResult;
	}

	/**
	 * Rule-based intent classification
	 */
	private classifyWithRules(query: string, context: QueryContext): DetailedIntentResult {
		const lowerQuery = query.toLowerCase();
		let bestMatch = {
			intent: 'search_specific',
			confidence: 0.5,
			category: 'search',
			reasoning: ['Default classification']
		};
		
		for (const [intentKey, rule] of Object.entries(this.intentRules)) {
			for (const pattern of rule.patterns) {
				if (lowerQuery.includes(pattern)) {
					const confidence = Math.min(0.95, rule.weight * (1 + (pattern.length / query.length) * 0.2));
					if (confidence > bestMatch.confidence) {
						bestMatch = {
							intent: intentKey,
							confidence,
							category: intentKey.split('_')[0],
							reasoning: [`Matched pattern: "${pattern}"`, `Rule weight: ${rule.weight}`]
						};
					}
				}
			}
		}
		
		// Apply context boost
		if (context.searchHistory.commonPatterns.some(pattern => lowerQuery.includes(pattern))) {
			bestMatch.confidence = Math.min(0.98, bestMatch.confidence + 0.1);
			bestMatch.reasoning.push('Pattern matches user history');
		}
		
		return {
			...bestMatch,
			subcategory: this.determineSubcategory(bestMatch.intent, query),
			entities: [],
			sentiment: { label: 'neutral', score: 0.5 },
			context: {
				queryType: 'simple',
				userExperience: 'intermediate',
				urgency: 'medium'
			},
			suggestions: []
		};
	}

	/**
	 * ML-based intent classification using Workers AI
	 */
	private async classifyWithML(query: string): Promise<Partial<DetailedIntentResult>> {
		try {
			// Use Workers AI for text classification
			const response = await this.workersAI.run('@cf/huggingface/distilbert-sst-2-int8', {
				text: query
			});
			
			// This is a sentiment model, so we'd need a proper intent classification model
			// For now, we'll use this as a confidence booster for rule-based results
			return {
				confidence: response.score || 0.7,
				reasoning: ['ML model confidence boost']
			};
			
		} catch (error) {
			this.logger.warn('ML classification failed', { error: error.message });
			return {};
		}
	}

	/**
	 * Combine rule-based and ML classification results
	 */
	private combineClassificationResults(
		ruleResult: DetailedIntentResult,
		mlResult: Partial<DetailedIntentResult>,
		context: QueryContext
	): DetailedIntentResult {
		// Use rule-based as base and enhance with ML insights
		const combined = { ...ruleResult };
		
		// Adjust confidence with ML input
		if (mlResult.confidence && mlResult.confidence > 0.6) {
			combined.confidence = Math.min(0.99, (combined.confidence + mlResult.confidence) / 2);
			combined.reasoning.push('Enhanced with ML confidence');
		}
		
		// Merge reasoning
		if (mlResult.reasoning) {
			combined.reasoning.push(...mlResult.reasoning);
		}
		
		return combined;
	}

	/**
	 * Analyze sentiment using Workers AI
	 */
	private async analyzeSentiment(query: string): Promise<{ label: 'positive' | 'negative' | 'neutral'; score: number }> {
		try {
			const response = await this.workersAI.run('@cf/huggingface/distilbert-sst-2-int8', {
				text: query
			});
			
			// Map sentiment model output
			const label = response.label?.toLowerCase() === 'positive' ? 'positive' : 
						 response.label?.toLowerCase() === 'negative' ? 'negative' : 'neutral';
			
			return {
				label: label as 'positive' | 'negative' | 'neutral',
				score: response.score || 0.5
			};
			
		} catch (error) {
			this.logger.debug('Sentiment analysis failed', { error: error.message });
			return { label: 'neutral', score: 0.5 };
		}
	}

	/**
	 * Extract entities using pattern matching
	 */
	private extractEntities(query: string): Array<{ type: string; value: string; confidence: number; startPos?: number; endPos?: number }> {
		const entities: Array<{ type: string; value: string; confidence: number; startPos?: number; endPos?: number }> = [];
		const lowerQuery = query.toLowerCase();
		
		for (const [entityType, entityInfo] of Object.entries(this.entityPatterns)) {
			for (const pattern of entityInfo.patterns) {
				const index = lowerQuery.indexOf(pattern);
				if (index !== -1) {
					entities.push({
						type: entityInfo.type,
						value: pattern,
						confidence: 0.8,
						startPos: index,
						endPos: index + pattern.length
					});
				}
			}
		}
		
		return entities;
	}

	/**
	 * Determine subcategory based on intent and query
	 */
	private determineSubcategory(intent: string, query: string): string | undefined {
		const lowerQuery = query.toLowerCase();
		
		switch (intent) {
			case 'search_specific':
				if (lowerQuery.includes('exact') || lowerQuery.includes('specific')) return 'exact';
				if (lowerQuery.includes('similar') || lowerQuery.includes('like')) return 'similar';
				return 'general';
			case 'search_exploratory':
				if (lowerQuery.includes('all') || lowerQuery.includes('everything')) return 'comprehensive';
				if (lowerQuery.includes('new') || lowerQuery.includes('recent')) return 'recent';
				return 'browse';
			case 'filter_refine':
				if (lowerQuery.includes('category')) return 'category';
				if (lowerQuery.includes('type')) return 'type';
				return 'attribute';
			default:
				return undefined;
		}
	}

	/**
	 * Infer user experience level from query and context
	 */
	private inferUserExperience(query: string, context: QueryContext): 'beginner' | 'intermediate' | 'expert' {
		const lowerQuery = query.toLowerCase();
		let score = 0;
		
		// Technical vocabulary
		const expertTerms = ['component', 'interface', 'implementation', 'architecture', 'framework'];
		const beginnerTerms = ['help', 'how to', 'what is', 'simple', 'easy'];
		
		if (expertTerms.some(term => lowerQuery.includes(term))) score += 2;
		if (beginnerTerms.some(term => lowerQuery.includes(term))) score -= 2;
		
		// Query complexity
		if (query.split(' ').length > 6) score += 1;
		if (query.split(' ').length <= 2) score -= 1;
		
		// Context history
		if (context.userSession.averageComplexity > 3) score += 1;
		if (context.userSession.averageComplexity < 2) score -= 1;
		
		if (score >= 2) return 'expert';
		if (score <= -2) return 'beginner';
		return 'intermediate';
	}

	/**
	 * Infer urgency from query language
	 */
	private inferUrgency(query: string): 'low' | 'medium' | 'high' {
		const lowerQuery = query.toLowerCase();
		
		const urgentTerms = ['urgent', 'quickly', 'asap', 'immediately', 'now', 'fast'];
		const casualTerms = ['sometime', 'when possible', 'maybe', 'eventually'];
		
		if (urgentTerms.some(term => lowerQuery.includes(term))) return 'high';
		if (casualTerms.some(term => lowerQuery.includes(term))) return 'low';
		
		// Question marks often indicate immediate need for information
		if (query.includes('?')) return 'medium';
		
		return 'medium';
	}

	/**
	 * Generate helpful suggestions based on classification
	 */
	private generateSuggestions(result: DetailedIntentResult, context: QueryContext): string[] {
		const suggestions: string[] = [];
		
		switch (result.intent) {
			case 'search_specific':
				suggestions.push('Try using more specific keywords');
				if (result.entities.length === 0) {
					suggestions.push('Consider adding category or action words');
				}
				break;
			case 'search_exploratory':
				suggestions.push('Browse by category for better results');
				suggestions.push('Use filters to narrow down options');
				break;
			case 'filter_refine':
				suggestions.push('Combine multiple filters for precise results');
				break;
			case 'compare_analyze':
				suggestions.push('Use side-by-side comparison view');
				break;
			case 'recommend_suggest':
				suggestions.push('Specify your use case for better recommendations');
				break;
		}
		
		// Add context-based suggestions
		if (result.context.userExperience === 'beginner') {
			suggestions.push('Try the guided search for easier navigation');
		}
		
		if (context.searchHistory.failedQueries.length > 2) {
			suggestions.push('Consider browsing popular icons or categories');
		}
		
		return suggestions.slice(0, 3); // Limit to 3 suggestions
	}

	/**
	 * Get or create query context for user
	 */
	private getQueryContext(userId: string, context?: Partial<QueryContext>): QueryContext {
		let queryContext = this.queryContexts.get(userId);
		
		if (!queryContext) {
			queryContext = {
				previousQueries: [],
				userSession: {
					startTime: Date.now(),
					queryCount: 0,
					averageComplexity: 2,
					preferredCategories: []
				},
				searchHistory: {
					successfulQueries: [],
					failedQueries: [],
					commonPatterns: []
				}
			};
			this.queryContexts.set(userId, queryContext);
		}
		
		// Merge with provided context
		if (context) {
			queryContext = { ...queryContext, ...context };
		}
		
		return queryContext;
	}

	/**
	 * Update query context after classification
	 */
	private updateQueryContext(userId: string, query: string, result: DetailedIntentResult): void {
		const context = this.queryContexts.get(userId);
		if (!context) return;
		
		// Update query history
		context.previousQueries.push(query);
		if (context.previousQueries.length > this.config.maxContextHistory) {
			context.previousQueries.shift();
		}
		
		// Update session stats
		context.userSession.queryCount++;
		const complexity = this.analyzeQueryComplexity(query);
		context.userSession.averageComplexity = 
			(context.userSession.averageComplexity + complexity.score) / 2;
		
		// Update preferred categories
		if (result.entities.some(e => e.type === 'category')) {
			const categories = result.entities.filter(e => e.type === 'category').map(e => e.value);
			for (const category of categories) {
				if (!context.userSession.preferredCategories.includes(category)) {
					context.userSession.preferredCategories.push(category);
				}
			}
		}
		
		// Update common patterns
		const words = query.toLowerCase().split(' ').filter(word => word.length > 2);
		for (const word of words) {
			if (!context.searchHistory.commonPatterns.includes(word)) {
				context.searchHistory.commonPatterns.push(word);
			}
		}
		
		// Keep only recent patterns
		if (context.searchHistory.commonPatterns.length > 20) {
			context.searchHistory.commonPatterns = context.searchHistory.commonPatterns.slice(-20);
		}
	}

	/**
	 * Create default intent for fallback
	 */
	private createDefaultIntent(query: string): DetailedIntentResult {
		return {
			intent: 'search_specific',
			confidence: 0.5,
			category: 'search',
			entities: [],
			sentiment: { label: 'neutral', score: 0.5 },
			context: {
				queryType: 'simple',
				userExperience: 'intermediate',
				urgency: 'medium'
			},
			reasoning: ['Default fallback classification'],
			suggestions: ['Try using more specific keywords']
		};
	}

	/**
	 * Generate cache key for classification
	 */
	private generateCacheKey(query: string, userId?: string, sessionId?: string): string {
		const normalizedQuery = query.toLowerCase().trim();
		const userKey = userId || sessionId || 'anonymous';
		return `${userKey}:${normalizedQuery}`;
	}

	/**
	 * Check if cache entry is still valid
	 */
	private isCacheValid(entry: ClassificationCacheEntry): boolean {
		return (Date.now() - entry.timestamp) < this.config.cacheTTL;
	}

	/**
	 * Clean up expired cache entries
	 */
	private cleanupCache(): void {
		const now = Date.now();
		for (const [key, entry] of this.classificationCache.entries()) {
			if (now - entry.timestamp > this.config.cacheTTL) {
				this.classificationCache.delete(key);
			}
		}
	}
}
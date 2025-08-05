import { ILogger } from '../logging/logger';
import { ErrorHandler, ErrorType } from '../error/error-handler';
import { ResponseContent } from '../../domain/icon/types/icon.types';
import { TelemetryService } from '../observability/telemetry.service';

/**
 * Query pattern for predictive analysis
 */
export interface QueryPattern {
	pattern: string;
	frequency: number;
	lastSeen: number;
	avgResponseTime: number;
	successRate: number;
	categories: string[];
	seasonality: SeasonalityData;
	relatedQueries: string[];
	userSegments: string[];
}

/**
 * Seasonality data for query patterns
 */
interface SeasonalityData {
	hourlyDistribution: number[]; // 0-23 hours
	weeklyDistribution: number[]; // 0-6 days
	trends: Array<{
		period: 'hour' | 'day' | 'week';
		strength: number; // 0-1
		peakTimes: number[];
	}>;
}

/**
 * Cache prediction result
 */
interface CachePrediction {
	query: string;
	probability: number;
	priority: 'low' | 'medium' | 'high' | 'critical';
	estimatedHitTime: number;
	reasoning: string[];
}

/**
 * Cache warming configuration
 */
interface CacheWarmingConfig {
	enabled: boolean;
	maxConcurrentWarming: number;
	warmingThreshold: number; // probability threshold
	backgroundWarmingEnabled: boolean;
	adaptivePriorityEnabled: boolean;
	maxWarmingQueueSize: number;
}

/**
 * User behavior analytics
 */
interface UserBehavior {
	userId?: string;
	sessionId?: string;
	querySequence: Array<{
		query: string;
		timestamp: number;
		category?: string;
		resultCount: number;
	}>;
	patterns: {
		commonSequences: string[][];
		preferredCategories: string[];
		avgSessionLength: number;
		queryComplexity: number;
	};
}

/**
 * Predictive cache service with ML-driven query pattern analysis
 * Implements intelligent cache warming based on user behavior and seasonal patterns
 */
export class PredictiveCacheService {
	private readonly errorHandler: ErrorHandler;
	private readonly warmingQueue = new Map<string, CachePrediction>();
	private readonly queryPatterns = new Map<string, QueryPattern>();
	private readonly userBehaviors = new Map<string, UserBehavior>();
	private readonly config: CacheWarmingConfig;
	
	// ML model weights (simplified linear model)
	private readonly modelWeights = {
		frequency: 0.3,
		recency: 0.25,
		seasonality: 0.2,
		userContext: 0.15,
		queryComplexity: 0.1
	};
	
	// Background warming worker
	private warmingWorker?: NodeJS.Timeout;
	private isWarming = false;
	
	constructor(
		private readonly logger: ILogger,
		private readonly telemetryService?: TelemetryService,
		config?: Partial<CacheWarmingConfig>
	) {
		this.config = {
			enabled: true,
			maxConcurrentWarming: 5,
			warmingThreshold: 0.7,
			backgroundWarmingEnabled: true,
			adaptivePriorityEnabled: true,
			maxWarmingQueueSize: 100,
			...config
		};
		
		this.errorHandler = new ErrorHandler(logger);
		
		if (this.config.backgroundWarmingEnabled) {
			this.startBackgroundWarming();
		}
	}

	/**
	 * Analyze query patterns and generate cache predictions
	 */
	async analyzePatternsAndPredict(): Promise<CachePrediction[]> {
		const result = await this.errorHandler.safeExecute(
			async () => {
				// Update patterns from telemetry data
				await this.updateQueryPatterns();
				
				// Generate predictions based on current patterns
				const predictions = this.generatePredictions();
				
				// Sort by probability and priority
				predictions.sort((a, b) => {
					if (a.priority !== b.priority) {
						const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
						return priorityOrder[b.priority] - priorityOrder[a.priority];
					}
					return b.probability - a.probability;
				});
				
				this.logger.debug('Generated cache predictions', {
					count: predictions.length,
					highPriority: predictions.filter(p => p.priority === 'high' || p.priority === 'critical').length
				});
				
				return predictions;
			},
			ErrorType.CACHE,
			'analyze patterns and predict',
			{}
		);
		
		return result.success ? result.data : [];
	}

	/**
	 * Queue queries for predictive warming
	 */
	async queueForWarming(predictions: CachePrediction[]): Promise<void> {
		const highProbabilityPredictions = predictions.filter(
			p => p.probability >= this.config.warmingThreshold
		);
		
		for (const prediction of highProbabilityPredictions) {
			if (this.warmingQueue.size >= this.config.maxWarmingQueueSize) {
				// Remove lowest priority items
				this.cleanupWarmingQueue();
			}
			
			this.warmingQueue.set(prediction.query, prediction);
		}
		
		this.logger.info('Queued queries for warming', {
			queued: highProbabilityPredictions.length,
			totalQueue: this.warmingQueue.size
		});
	}

	/**
	 * Execute cache warming for queued predictions
	 */
	async executeWarming(warmFunction: (query: string) => Promise<ResponseContent[]>): Promise<void> {
		if (this.isWarming || this.warmingQueue.size === 0) {
			return;
		}

		this.isWarming = true;
		const startTime = Date.now();
		
		try {
			const warmingPromises: Promise<void>[] = [];
			const queuesToProcess = Array.from(this.warmingQueue.entries())
				.slice(0, this.config.maxConcurrentWarming);
			
			for (const [query, prediction] of queuesToProcess) {
				warmingPromises.push(
					this.warmSingleQuery(query, prediction, warmFunction)
				);
				this.warmingQueue.delete(query);
			}
			
			await Promise.allSettled(warmingPromises);
			
			const duration = Date.now() - startTime;
			this.logger.info('Cache warming completed', {
				queriesWarmed: queuesToProcess.length,
				duration,
				remainingQueue: this.warmingQueue.size
			});
			
			// Record telemetry
			this.telemetryService?.recordSearchMetrics({
				operation: 'cache_warming',
				duration,
				resultCount: queuesToProcess.length,
				cacheHit: false,
				query: `warming_batch_${queuesToProcess.length}`
			});
			
		} finally {
			this.isWarming = false;
		}
	}

	/**
	 * Record user query for behavior analysis
	 */
	recordUserQuery(
		query: string,
		userId?: string,
		sessionId?: string,
		category?: string,
		resultCount: number = 0
	): void {
		const userKey = userId || sessionId || 'anonymous';
		let behavior = this.userBehaviors.get(userKey);
		
		if (!behavior) {
			behavior = {
				userId,
				sessionId,
				querySequence: [],
				patterns: {
					commonSequences: [],
					preferredCategories: [],
					avgSessionLength: 0,
					queryComplexity: 0
				}
			};
			this.userBehaviors.set(userKey, behavior);
		}
		
		// Add to query sequence
		behavior.querySequence.push({
			query,
			timestamp: Date.now(),
			category,
			resultCount
		});
		
		// Keep only recent queries (last 50 per user)
		if (behavior.querySequence.length > 50) {
			behavior.querySequence = behavior.querySequence.slice(-50);
		}
		
		// Update patterns
		this.updateUserPatterns(behavior);
		
		this.logger.debug('Recorded user query', {
			query,
			userKey,
			sequenceLength: behavior.querySequence.length
		});
	}

	/**
	 * Get cache warming statistics
	 */
	getWarmingStats(): {
		queueSize: number;
		isWarming: boolean;
		totalPatterns: number;
		totalUsers: number;
		topPredictions: CachePrediction[];
		userBehaviorInsights: {
			avgQueriesPerUser: number;
			topCategories: Array<{ category: string; count: number }>;
			commonSequences: string[][];
		};
	} {
		const topPredictions = Array.from(this.warmingQueue.values())
			.sort((a, b) => b.probability - a.probability)
			.slice(0, 10);
		
		// Calculate user behavior insights
		const allBehaviors = Array.from(this.userBehaviors.values());
		const avgQueriesPerUser = allBehaviors.length > 0
			? allBehaviors.reduce((sum, b) => sum + b.querySequence.length, 0) / allBehaviors.length
			: 0;
		
		const categoryCount = new Map<string, number>();
		const allSequences: string[][] = [];
		
		for (const behavior of allBehaviors) {
			for (const query of behavior.querySequence) {
				if (query.category) {
					categoryCount.set(query.category, (categoryCount.get(query.category) || 0) + 1);
				}
			}
			allSequences.push(...behavior.patterns.commonSequences);
		}
		
		const topCategories = Array.from(categoryCount.entries())
			.map(([category, count]) => ({ category, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);
		
		return {
			queueSize: this.warmingQueue.size,
			isWarming: this.isWarming,
			totalPatterns: this.queryPatterns.size,
			totalUsers: this.userBehaviors.size,
			topPredictions,
			userBehaviorInsights: {
				avgQueriesPerUser,
				topCategories,
				commonSequences: allSequences.slice(0, 10)
			}
		};
	}

	/**
	 * Clear all predictive cache data
	 */
	clear(): void {
		this.warmingQueue.clear();
		this.queryPatterns.clear();
		this.userBehaviors.clear();
		this.logger.info('Predictive cache data cleared');
	}

	/**
	 * Update query patterns from telemetry data
	 */
	private async updateQueryPatterns(): Promise<void> {
		if (!this.telemetryService) return;
		
		const telemetryData = this.telemetryService.exportMetrics();
		const queryPatterns = telemetryData.queryPatterns;
		
		for (const pattern of queryPatterns) {
			const existing = this.queryPatterns.get(pattern.pattern);
			
			if (existing) {
				// Update existing pattern
				existing.frequency = pattern.frequency;
				existing.lastSeen = pattern.lastSeen;
				existing.avgResponseTime = pattern.avgResponseTime;
				existing.successRate = pattern.successRate;
				existing.categories = pattern.categories;
			} else {
				// Create new pattern with seasonality analysis
				this.queryPatterns.set(pattern.pattern, {
					...pattern,
					seasonality: this.analyzeSeasonality(pattern.pattern),
					relatedQueries: this.findRelatedQueries(pattern.pattern),
					userSegments: this.identifyUserSegments(pattern.pattern)
				});
			}
		}
	}

	/**
	 * Generate cache predictions based on current patterns
	 */
	private generatePredictions(): CachePrediction[] {
		const predictions: CachePrediction[] = [];
		const now = Date.now();
		const currentHour = new Date().getHours();
		const currentDay = new Date().getDay();
		
		for (const [query, pattern] of this.queryPatterns.entries()) {
			const features = this.extractFeatures(pattern, now, currentHour, currentDay);
			const probability = this.calculateProbability(features);
			
			if (probability > 0.3) { // Only consider queries with reasonable probability
				const priority = this.determinePriority(probability, features);
				const estimatedHitTime = this.estimateHitTime(pattern, features);
				const reasoning = this.generateReasoning(features, probability);
				
				predictions.push({
					query,
					probability,
					priority,
					estimatedHitTime,
					reasoning
				});
			}
		}
		
		return predictions;
	}

	/**
	 * Extract features for ML prediction
	 */
	private extractFeatures(
		pattern: QueryPattern,
		now: number,
		currentHour: number,
		currentDay: number
	): Record<string, number> {
		const timeSinceLastSeen = now - pattern.lastSeen;
		const hourlyScore = pattern.seasonality.hourlyDistribution[currentHour] || 0;
		const weeklyScore = pattern.seasonality.weeklyDistribution[currentDay] || 0;
		
		return {
			frequency: Math.log(pattern.frequency + 1) / 10, // Normalized log frequency
			recency: Math.exp(-timeSinceLastSeen / (1000 * 60 * 60)), // Exponential decay over hours
			seasonality: (hourlyScore + weeklyScore) / 2,
			successRate: pattern.successRate,
			avgResponseTime: Math.min(pattern.avgResponseTime / 1000, 1), // Normalized to seconds, capped at 1
			queryComplexity: Math.min(pattern.pattern.split(' ').length / 5, 1), // Normalized word count
			categoryDiversity: Math.min(pattern.categories.length / 3, 1), // Normalized category count
			relatedQueriesCount: Math.min(pattern.relatedQueries.length / 5, 1),
			userSegmentDiversity: Math.min(pattern.userSegments.length / 3, 1)
		};
	}

	/**
	 * Calculate probability using weighted linear model
	 */
	private calculateProbability(features: Record<string, number>): number {
		const weights = this.modelWeights;
		
		const score = 
			features.frequency * weights.frequency +
			features.recency * weights.recency +
			features.seasonality * weights.seasonality +
			(features.successRate * features.userSegmentDiversity) * weights.userContext +
			(1 - features.queryComplexity) * weights.queryComplexity; // Simpler queries preferred
		
		// Apply sigmoid function to get probability between 0 and 1
		return 1 / (1 + Math.exp(-5 * (score - 0.5)));
	}

	/**
	 * Determine cache warming priority
	 */
	private determinePriority(probability: number, features: Record<string, number>): CachePrediction['priority'] {
		if (probability > 0.9 && features.frequency > 0.8) return 'critical';
		if (probability > 0.8 || (probability > 0.7 && features.seasonality > 0.7)) return 'high';
		if (probability > 0.5) return 'medium';
		return 'low';
	}

	/**
	 * Estimate when the query is likely to be requested
	 */
	private estimateHitTime(pattern: QueryPattern, features: Record<string, number>): number {
		const baseTime = Date.now();
		const seasonalityFactor = features.seasonality;
		const recencyFactor = features.recency;
		
		// Estimate hit time based on seasonality and recency
		const estimatedDelay = (1 - seasonalityFactor) * (1 - recencyFactor) * 3600000; // Max 1 hour delay
		return baseTime + estimatedDelay;
	}

	/**
	 * Generate human-readable reasoning for the prediction
	 */
	private generateReasoning(features: Record<string, number>, probability: number): string[] {
		const reasons: string[] = [];
		
		if (features.frequency > 0.7) reasons.push('High query frequency');
		if (features.recency > 0.8) reasons.push('Recently requested');
		if (features.seasonality > 0.7) reasons.push('Peak seasonal time');
		if (features.successRate > 0.9) reasons.push('High success rate');
		if (features.userSegmentDiversity > 0.6) reasons.push('Multiple user segments');
		if (features.relatedQueriesCount > 0.5) reasons.push('Strong query relationships');
		
		if (reasons.length === 0) {
			reasons.push(`${(probability * 100).toFixed(1)}% probability based on pattern analysis`);
		}
		
		return reasons;
	}

	/**
	 * Analyze seasonality patterns for a query
	 */
	private analyzeSeasonality(query: string): SeasonalityData {
		// Simplified seasonality analysis
		// In a real implementation, this would analyze historical data
		
		const hourlyDistribution = new Array(24).fill(0);
		const weeklyDistribution = new Array(7).fill(0);
		
		// Apply some heuristics based on query content
		if (query.includes('home') || query.includes('house')) {
			// Home-related queries peak in evening hours
			for (let i = 18; i <= 22; i++) {
				hourlyDistribution[i] = 0.8;
			}
		} else if (query.includes('business') || query.includes('office')) {
			// Business queries peak during work hours
			for (let i = 9; i <= 17; i++) {
				hourlyDistribution[i] = 0.9;
			}
			// Weekdays
			for (let i = 1; i <= 5; i++) {
				weeklyDistribution[i] = 0.8;
			}
		}
		
		return {
			hourlyDistribution,
			weeklyDistribution,
			trends: [
				{
					period: 'hour',
					strength: 0.6,
					peakTimes: hourlyDistribution.map((v, i) => ({ hour: i, strength: v }))
						.filter(({ strength }) => strength > 0.5)
						.map(({ hour }) => hour)
				}
			]
		};
	}

	/**
	 * Find related queries using simple similarity
	 */
	private findRelatedQueries(query: string): string[] {
		const related: string[] = [];
		const queryWords = query.toLowerCase().split(' ');
		
		for (const [otherQuery] of this.queryPatterns.entries()) {
			if (otherQuery === query) continue;
			
			const otherWords = otherQuery.toLowerCase().split(' ');
			const commonWords = queryWords.filter(word => otherWords.includes(word));
			
			if (commonWords.length > 0 && commonWords.length / Math.max(queryWords.length, otherWords.length) > 0.3) {
				related.push(otherQuery);
			}
		}
		
		return related.slice(0, 5); // Top 5 related queries
	}

	/**
	 * Identify user segments for a query
	 */
	private identifyUserSegments(query: string): string[] {
		const segments: string[] = [];
		
		// Simple heuristic-based segmentation
		if (query.includes('business') || query.includes('office') || query.includes('professional')) {
			segments.push('business');
		}
		if (query.includes('home') || query.includes('personal') || query.includes('family')) {
			segments.push('personal');
		}
		if (query.includes('design') || query.includes('creative') || query.includes('art')) {
			segments.push('creative');
		}
		if (query.includes('developer') || query.includes('code') || query.includes('tech')) {
			segments.push('technical');
		}
		
		return segments;
	}

	/**
	 * Update user behavior patterns
	 */
	private updateUserPatterns(behavior: UserBehavior): void {
		const queries = behavior.querySequence;
		if (queries.length < 2) return;
		
		// Find common query sequences
		const sequences: string[][] = [];
		for (let i = 0; i < queries.length - 1; i++) {
			sequences.push([queries[i].query, queries[i + 1].query]);
		}
		
		behavior.patterns.commonSequences = sequences;
		
		// Calculate preferred categories
		const categoryCount = new Map<string, number>();
		for (const query of queries) {
			if (query.category) {
				categoryCount.set(query.category, (categoryCount.get(query.category) || 0) + 1);
			}
		}
		
		behavior.patterns.preferredCategories = Array.from(categoryCount.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([category]) => category)
			.slice(0, 5);
		
		// Calculate session metrics
		if (queries.length > 0) {
			const sessionLength = queries[queries.length - 1].timestamp - queries[0].timestamp;
			behavior.patterns.avgSessionLength = sessionLength / queries.length;
			behavior.patterns.queryComplexity = queries.reduce((sum, q) => sum + q.query.split(' ').length, 0) / queries.length;
		}
	}

	/**
	 * Warm a single query
	 */
	private async warmSingleQuery(
		query: string,
		prediction: CachePrediction,
		warmFunction: (query: string) => Promise<ResponseContent[]>
	): Promise<void> {
		const startTime = Date.now();
		
		try {
			const results = await warmFunction(query);
			const duration = Date.now() - startTime;
			
			this.logger.debug('Cache warming successful', {
				query,
				resultCount: results.length,
				duration,
				probability: prediction.probability,
				priority: prediction.priority
			});
			
		} catch (error) {
			this.logger.warn('Cache warming failed', {
				query,
				error: error.message,
				probability: prediction.probability
			});
		}
	}

	/**
	 * Clean up low-priority items from warming queue
	 */
	private cleanupWarmingQueue(): void {
		const entries = Array.from(this.warmingQueue.entries());
		entries.sort((a, b) => {
			const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
			if (a[1].priority !== b[1].priority) {
				return priorityOrder[a[1].priority] - priorityOrder[b[1].priority];
			}
			return a[1].probability - b[1].probability;
		});
		
		// Remove bottom 20% of entries
		const toRemove = Math.floor(entries.length * 0.2);
		for (let i = 0; i < toRemove; i++) {
			this.warmingQueue.delete(entries[i][0]);
		}
	}

	/**
	 * Start background warming worker
	 */
	private startBackgroundWarming(): void {
		this.warmingWorker = setInterval(async () => {
			if (!this.isWarming && this.warmingQueue.size > 0) {
				const predictions = await this.analyzePatternsAndPredict();
				await this.queueForWarming(predictions);
			}
		}, 60000); // Check every minute
	}

	/**
	 * Stop background warming worker
	 */
	stopBackgroundWarming(): void {
		if (this.warmingWorker) {
			clearInterval(this.warmingWorker);
			this.warmingWorker = undefined;
		}
	}
}
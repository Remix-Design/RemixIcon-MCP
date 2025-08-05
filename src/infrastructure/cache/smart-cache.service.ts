import { ILogger } from '../logging/logger';
import { ErrorHandler, ErrorType } from '../error/error-handler';
import { ResponseContent } from '../../domain/icon/types/icon.types';
import { PredictiveCacheService } from './predictive-cache.service';
import { UnifiedCacheService } from './unified-cache.service';
import { TelemetryService } from '../observability/telemetry.service';

/**
 * Cache entry with metadata
 */
interface SmartCacheEntry {
	key: string;
	data: ResponseContent[];
	timestamp: number;
	hitCount: number;
	lastAccessed: number;
	ttl: number;
	priority: 'low' | 'medium' | 'high' | 'critical';
	tags: string[];
	size: number;
	predictedNextAccess?: number;
}

/**
 * Cache performance metrics
 */
interface CacheMetrics {
	hitRate: number;
	missRate: number;
	warmingHitRate: number;
	avgResponseTime: number;
	memoryUsage: number;
	entryCount: number;
	evictionCount: number;
	warmingSuccessRate: number;
}

/**
 * Cache optimization strategy
 */
interface OptimizationStrategy {
	evictionPolicy: 'lru' | 'lfu' | 'adaptive' | 'predictive';
	ttlStrategy: 'fixed' | 'adaptive' | 'usage-based';
	warmingStrategy: 'reactive' | 'predictive' | 'hybrid';
	compressionEnabled: boolean;
	adaptiveSizingEnabled: boolean;
}

/**
 * Smart cache configuration
 */
interface SmartCacheConfig {
	maxMemoryMB: number;
	maxEntries: number;
	defaultTTL: number;
	optimizationStrategy: OptimizationStrategy;
	telemetryEnabled: boolean;
	warmingEnabled: boolean;
	compressionThreshold: number; // bytes
}

/**
 * Smart cache service with ML-driven optimization
 * Combines traditional caching with predictive warming and adaptive policies
 */
export class SmartCacheService {
	private readonly cache = new Map<string, SmartCacheEntry>();
	private readonly errorHandler: ErrorHandler;
	private readonly config: SmartCacheConfig;
	
	// Performance tracking
	private hits = 0;
	private misses = 0;
	private warmingHits = 0;
	private totalWarmingAttempts = 0;
	private evictions = 0;
	
	// Adaptive parameters
	private adaptiveTTLMultiplier = 1.0;
	private adaptiveEvictionThreshold = 0.8;
	
	constructor(
		private readonly logger: ILogger,
		private readonly unifiedCache: UnifiedCacheService,
		private readonly predictiveCache: PredictiveCacheService,
		private readonly telemetryService?: TelemetryService,
		config?: Partial<SmartCacheConfig>
	) {
		this.config = {
			maxMemoryMB: 100,
			maxEntries: 10000,
			defaultTTL: 3600000, // 1 hour
			optimizationStrategy: {
				evictionPolicy: 'adaptive',
				ttlStrategy: 'adaptive',
				warmingStrategy: 'hybrid',
				compressionEnabled: true,
				adaptiveSizingEnabled: true
			},
			telemetryEnabled: true,
			warmingEnabled: true,
			compressionThreshold: 1024, // 1KB
			...config
		};
		
		this.errorHandler = new ErrorHandler(logger);
		
		// Start periodic optimization
		setInterval(() => this.optimize(), 300000); // Every 5 minutes
	}

	/**
	 * Get cached data with smart warming
	 */
	async get(key: string, userId?: string, sessionId?: string): Promise<ResponseContent[] | null> {
		const startTime = Date.now();
		
		try {
			// Check smart cache first
			let entry = this.cache.get(key);
			
			if (entry && this.isEntryValid(entry)) {
				entry.hitCount++;
				entry.lastAccessed = Date.now();
				this.hits++;
				
				// Record user behavior for predictive analysis
				this.predictiveCache.recordUserQuery(key, userId, sessionId, undefined, entry.data.length);
				
				this.recordCacheMetrics('hit', Date.now() - startTime, entry.data.length);
				return entry.data;
			}
			
			// Check unified cache fallback
			const unifiedResult = await this.unifiedCache.get(key);
			if (unifiedResult) {
				// Store in smart cache with adaptive TTL
				const adaptiveTTL = this.calculateAdaptiveTTL(key, unifiedResult.length);
				await this.set(key, unifiedResult, adaptiveTTL);
				
				this.hits++;
				this.recordCacheMetrics('hit_fallback', Date.now() - startTime, unifiedResult.length);
				return unifiedResult;
			}
			
			this.misses++;
			this.recordCacheMetrics('miss', Date.now() - startTime, 0);
			
			// Asynchronously check if this should be warmed
			this.considerForWarming(key, userId, sessionId);
			
			return null;
			
		} catch (error) {
			this.logger.error('Smart cache get error', { key, error: error.message });
			return null;
		}
	}

	/**
	 * Set cached data with smart policies
	 */
	async set(key: string, data: ResponseContent[], ttl?: number): Promise<void> {
		const result = await this.errorHandler.safeExecute(
			async () => {
				const entryTTL = ttl || this.calculateAdaptiveTTL(key, data.length);
				const priority = this.calculatePriority(key, data);
				const size = this.estimateSize(data);
				const tags = this.extractTags(key, data);
				
				const entry: SmartCacheEntry = {
					key,
					data,
					timestamp: Date.now(),
					hitCount: 0,
					lastAccessed: Date.now(),
					ttl: entryTTL,
					priority,
					tags,
					size
				};
				
				// Check if we need to evict entries
				await this.ensureCapacity(size);
				
				// Store in smart cache
				this.cache.set(key, entry);
				
				// Also store in unified cache for persistence
				await this.unifiedCache.set(key, data, entryTTL);
				
				this.logger.debug('Smart cache entry stored', {
					key,
					size,
					priority,
					ttl: entryTTL,
					tags: tags.length
				});
			},
			ErrorType.CACHE,
			'smart cache set',
			{ key, dataLength: data.length }
		);
		
		if (!result.success) {
			this.logger.error('Failed to set smart cache entry', { key, error: result.error });
		}
	}

	/**
	 * Execute predictive cache warming
	 */
	async executeWarming(warmFunction: (query: string) => Promise<ResponseContent[]>): Promise<void> {
		if (!this.config.warmingEnabled) return;
		
		const startTime = Date.now();
		
		try {
			// Get predictions from predictive cache service
			const predictions = await this.predictiveCache.analyzePatternsAndPredict();
			await this.predictiveCache.queueForWarming(predictions);
			
			// Execute warming with smart cache integration
			await this.predictiveCache.executeWarming(async (query: string) => {
				this.totalWarmingAttempts++;
				
				const results = await warmFunction(query);
				if (results.length > 0) {
					const adaptiveTTL = this.calculateAdaptiveTTL(query, results.length);
					await this.set(query, results, adaptiveTTL * 2); // Longer TTL for warmed entries
					this.warmingHits++;
				}
				
				return results;
			});
			
			const duration = Date.now() - startTime;
			this.logger.info('Smart cache warming completed', {
				duration,
				predictions: predictions.length,
				successRate: this.totalWarmingAttempts > 0 ? this.warmingHits / this.totalWarmingAttempts : 0
			});
			
		} catch (error) {
			this.logger.error('Smart cache warming failed', { error: error.message });
		}
	}

	/**
	 * Get cache performance metrics
	 */
	getMetrics(): CacheMetrics {
		const totalRequests = this.hits + this.misses;
		const memoryUsage = Array.from(this.cache.values())
			.reduce((sum, entry) => sum + entry.size, 0);
		
		return {
			hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
			missRate: totalRequests > 0 ? this.misses / totalRequests : 0,
			warmingHitRate: this.totalWarmingAttempts > 0 ? this.warmingHits / this.totalWarmingAttempts : 0,
			avgResponseTime: 0, // Would be calculated from telemetry
			memoryUsage,
			entryCount: this.cache.size,
			evictionCount: this.evictions,
			warmingSuccessRate: this.totalWarmingAttempts > 0 ? this.warmingHits / this.totalWarmingAttempts : 0
		};
	}

	/**
	 * Get cache analytics and insights
	 */
	getAnalytics(): {
		topEntries: Array<{ key: string; hitCount: number; priority: string }>;
		sizeDistribution: { small: number; medium: number; large: number };
		ttlDistribution: { short: number; medium: number; long: number };
		tagAnalytics: Array<{ tag: string; count: number; avgHits: number }>;
		warmingStats: any;
	} {
		const entries = Array.from(this.cache.values());
		
		// Top entries by hit count
		const topEntries = entries
			.sort((a, b) => b.hitCount - a.hitCount)
			.slice(0, 10)
			.map(entry => ({
				key: entry.key,
				hitCount: entry.hitCount,
				priority: entry.priority
			}));
		
		// Size distribution
		const sizeDistribution = {
			small: entries.filter(e => e.size < 1024).length,
			medium: entries.filter(e => e.size >= 1024 && e.size < 10240).length,
			large: entries.filter(e => e.size >= 10240).length
		};
		
		// TTL distribution
		const now = Date.now();
		const ttlDistribution = {
			short: entries.filter(e => (e.timestamp + e.ttl - now) < 900000).length, // < 15 min
			medium: entries.filter(e => {
				const remaining = e.timestamp + e.ttl - now;
				return remaining >= 900000 && remaining < 3600000; // 15 min - 1 hour
			}).length,
			long: entries.filter(e => (e.timestamp + e.ttl - now) >= 3600000).length // > 1 hour
		};
		
		// Tag analytics
		const tagStats = new Map<string, { count: number; totalHits: number }>();
		for (const entry of entries) {
			for (const tag of entry.tags) {
				const stats = tagStats.get(tag) || { count: 0, totalHits: 0 };
				stats.count++;
				stats.totalHits += entry.hitCount;
				tagStats.set(tag, stats);
			}
		}
		
		const tagAnalytics = Array.from(tagStats.entries())
			.map(([tag, stats]) => ({
				tag,
				count: stats.count,
				avgHits: stats.count > 0 ? stats.totalHits / stats.count : 0
			}))
			.sort((a, b) => b.avgHits - a.avgHits)
			.slice(0, 10);
		
		return {
			topEntries,
			sizeDistribution,
			ttlDistribution,
			tagAnalytics,
			warmingStats: this.predictiveCache.getWarmingStats()
		};
	}

	/**
	 * Clear cache with optional selective clearing
	 */
	async clear(pattern?: string): Promise<void> {
		if (pattern) {
			// Clear entries matching pattern
			const keysToDelete: string[] = [];
			for (const [key] of this.cache.entries()) {
				if (key.includes(pattern)) {
					keysToDelete.push(key);
				}
			}
			
			for (const key of keysToDelete) {
				this.cache.delete(key);
				await this.unifiedCache.delete(key);
			}
			
			this.logger.info('Smart cache partially cleared', { pattern, cleared: keysToDelete.length });
		} else {
			// Clear all
			this.cache.clear();
			await this.unifiedCache.clear();
			this.predictiveCache.clear();
			
			// Reset metrics
			this.hits = 0;
			this.misses = 0;
			this.warmingHits = 0;
			this.totalWarmingAttempts = 0;
			this.evictions = 0;
			
			this.logger.info('Smart cache completely cleared');
		}
	}

	/**
	 * Check if cache entry is valid
	 */
	private isEntryValid(entry: SmartCacheEntry): boolean {
		const now = Date.now();
		return (entry.timestamp + entry.ttl) > now;
	}

	/**
	 * Calculate adaptive TTL based on usage patterns
	 */
	private calculateAdaptiveTTL(key: string, dataSize: number): number {
		let baseTTL = this.config.defaultTTL;
		
		// Adjust based on data size (smaller data gets longer TTL)
		const sizeMultiplier = Math.max(0.5, 1 - (dataSize / 100000)); // Normalize to 100K items
		
		// Adjust based on key characteristics
		let keyMultiplier = 1.0;
		if (key.includes('popular') || key.includes('common')) {
			keyMultiplier = 2.0; // Popular queries get longer TTL
		} else if (key.includes('specific') || key.split(' ').length > 5) {
			keyMultiplier = 0.5; // Specific queries get shorter TTL
		}
		
		return Math.floor(baseTTL * this.adaptiveTTLMultiplier * sizeMultiplier * keyMultiplier);
	}

	/**
	 * Calculate cache entry priority
	 */
	private calculatePriority(key: string, data: ResponseContent[]): SmartCacheEntry['priority'] {
		// Simple heuristic-based priority calculation
		if (data.length === 0) return 'low';
		if (data.length > 10) return 'low'; // Too many results, likely not useful
		if (key.split(' ').length === 1) return 'high'; // Single word queries are common
		if (key.includes('icon') || key.includes('home') || key.includes('user')) return 'medium';
		return 'medium';
	}

	/**
	 * Estimate memory size of cache entry
	 */
	private estimateSize(data: ResponseContent[]): number {
		// Rough estimation: each ResponseContent is ~200 bytes on average
		return data.length * 200 + JSON.stringify(data).length;
	}

	/**
	 * Extract tags from key and data for categorization
	 */
	private extractTags(key: string, data: ResponseContent[]): string[] {
		const tags: string[] = [];
		
		// Add tags based on key
		const words = key.toLowerCase().split(' ');
		for (const word of words) {
			if (word.length > 2) tags.push(`query:${word}`);
		}
		
		// Add tags based on result count
		if (data.length === 0) tags.push('empty');
		else if (data.length === 1) tags.push('single');
		else if (data.length <= 5) tags.push('few');
		else tags.push('many');
		
		// Add size-based tags
		const size = this.estimateSize(data);
		if (size < 1024) tags.push('small');
		else if (size < 10240) tags.push('medium');
		else tags.push('large');
		
		return tags;
	}

	/**
	 * Ensure cache has capacity for new entry
	 */
	private async ensureCapacity(newEntrySize: number): Promise<void> {
		const currentMemory = Array.from(this.cache.values())
			.reduce((sum, entry) => sum + entry.size, 0);
		
		const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;
		
		// Check memory limit
		if (currentMemory + newEntrySize > maxMemoryBytes || this.cache.size >= this.config.maxEntries) {
			await this.evictEntries(Math.max(newEntrySize, maxMemoryBytes * 0.1)); // Evict at least 10% or enough for new entry
		}
	}

	/**
	 * Evict entries based on configured policy
	 */
	private async evictEntries(targetBytes: number): Promise<void> {
		const entries = Array.from(this.cache.entries());
		let evictedBytes = 0;
		
		// Sort entries for eviction based on policy
		entries.sort((a, b) => {
			switch (this.config.optimizationStrategy.evictionPolicy) {
				case 'lru':
					return a[1].lastAccessed - b[1].lastAccessed;
				case 'lfu':
					return a[1].hitCount - b[1].hitCount;
				case 'adaptive':
					// Combine recency and frequency with priority
					const scoreA = this.calculateEvictionScore(a[1]);
					const scoreB = this.calculateEvictionScore(b[1]);
					return scoreA - scoreB;
				case 'predictive':
					// Consider predicted next access
					const predA = a[1].predictedNextAccess || 0;
					const predB = b[1].predictedNextAccess || 0;
					return predA - predB;
				default:
					return a[1].lastAccessed - b[1].lastAccessed;
			}
		});
		
		// Evict entries until we have enough space
		for (const [key, entry] of entries) {
			if (evictedBytes >= targetBytes) break;
			
			this.cache.delete(key);
			await this.unifiedCache.delete(key);
			evictedBytes += entry.size;
			this.evictions++;
		}
		
		this.logger.debug('Cache eviction completed', {
			evictedBytes,
			targetBytes,
			entriesEvicted: this.evictions
		});
	}

	/**
	 * Calculate eviction score for adaptive policy
	 */
	private calculateEvictionScore(entry: SmartCacheEntry): number {
		const now = Date.now();
		const age = now - entry.timestamp;
		const timeSinceAccess = now - entry.lastAccessed;
		const remainingTTL = entry.timestamp + entry.ttl - now;
		
		// Lower score = higher priority for eviction
		const priorityWeight = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 }[entry.priority];
		const hitRateWeight = Math.log(entry.hitCount + 1);
		const freshnessWeight = Math.max(0, remainingTTL / entry.ttl);
		const accessRecencyWeight = Math.exp(-timeSinceAccess / (1000 * 60 * 60)); // Decay over hours
		
		return (priorityWeight * hitRateWeight * freshnessWeight * accessRecencyWeight) / entry.size;
	}

	/**
	 * Consider query for warming based on patterns
	 */
	private considerForWarming(key: string, userId?: string, sessionId?: string): void {
		// Record the miss for predictive analysis
		this.predictiveCache.recordUserQuery(key, userId, sessionId, undefined, 0);
		
		// This will be handled by the background warming process
	}

	/**
	 * Record cache metrics for telemetry
	 */
	private recordCacheMetrics(type: string, duration: number, resultCount: number): void {
		if (!this.config.telemetryEnabled || !this.telemetryService) return;
		
		this.telemetryService.recordSearchMetrics({
			operation: `cache_${type}`,
			duration,
			resultCount,
			cacheHit: type.includes('hit'),
			query: 'cache_operation'
		});
	}

	/**
	 * Optimize cache performance
	 */
	private optimize(): void {
		const metrics = this.getMetrics();
		
		// Adaptive TTL adjustment
		if (metrics.hitRate < 0.7) {
			this.adaptiveTTLMultiplier *= 1.1; // Increase TTL
		} else if (metrics.hitRate > 0.9) {
			this.adaptiveTTLMultiplier *= 0.95; // Decrease TTL slightly
		}
		
		// Adaptive eviction threshold
		if (metrics.memoryUsage > this.config.maxMemoryMB * 1024 * 1024 * 0.9) {
			this.adaptiveEvictionThreshold = Math.max(0.6, this.adaptiveEvictionThreshold - 0.05);
		} else if (metrics.memoryUsage < this.config.maxMemoryMB * 1024 * 1024 * 0.5) {
			this.adaptiveEvictionThreshold = Math.min(0.9, this.adaptiveEvictionThreshold + 0.05);
		}
		
		this.logger.debug('Cache optimization completed', {
			hitRate: metrics.hitRate,
			ttlMultiplier: this.adaptiveTTLMultiplier,
			evictionThreshold: this.adaptiveEvictionThreshold
		});
	}
}
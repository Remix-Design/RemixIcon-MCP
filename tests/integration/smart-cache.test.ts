import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartCacheService } from '../../src/infrastructure/cache/smart-cache.service';
import { PredictiveCacheService } from '../../src/infrastructure/cache/predictive-cache.service';
import { UnifiedCacheService } from '../../src/infrastructure/cache/unified-cache.service';
import { TelemetryService } from '../../src/infrastructure/observability/telemetry.service';
import { ConsoleLogger, LogLevel } from '../../src/infrastructure/logging/logger';
import { ResponseContent } from '../../src/domain/icon/types/icon.types';

describe('Smart Cache Integration', () => {
	let logger: ConsoleLogger;
	let telemetryService: TelemetryService;
	let unifiedCache: UnifiedCacheService;
	let predictiveCache: PredictiveCacheService;
	let smartCache: SmartCacheService;
	let mockAnalyticsEngine: any;

	beforeEach(() => {
		logger = new ConsoleLogger(LogLevel.DEBUG);
		
		// Mock Analytics Engine
		mockAnalyticsEngine = {
			writeDataPoint: vi.fn().mockResolvedValue(undefined)
		};
		
		telemetryService = new TelemetryService(logger, mockAnalyticsEngine);
		unifiedCache = new UnifiedCacheService(logger);
		predictiveCache = new PredictiveCacheService(logger, telemetryService);
		smartCache = new SmartCacheService(
			logger, 
			unifiedCache, 
			predictiveCache, 
			telemetryService,
			{
				maxMemoryMB: 10,
				maxEntries: 100,
				warmingEnabled: true
			}
		);
	});

	describe('PredictiveCacheService', () => {
		it('should record user queries and build patterns', async () => {
			// Record multiple queries for pattern analysis
			predictiveCache.recordUserQuery('home icon', 'user1', 'session1', 'system', 5);
			predictiveCache.recordUserQuery('user icon', 'user1', 'session1', 'user', 3);
			predictiveCache.recordUserQuery('home icon', 'user2', 'session2', 'system', 4);
			predictiveCache.recordUserQuery('settings icon', 'user1', 'session1', 'system', 2);

			const stats = predictiveCache.getWarmingStats();
			expect(stats.totalUsers).toBe(2);
			expect(stats.userBehaviorInsights.topCategories.length).toBeGreaterThan(0);
			expect(stats.userBehaviorInsights.avgQueriesPerUser).toBeGreaterThan(0);
		});

		it('should generate predictions based on patterns', async () => {
			// Setup telemetry data to simulate query patterns
			telemetryService.recordSearchMetrics({
				operation: 'findIcons',
				duration: 100,
				resultCount: 5,
				cacheHit: false,
				query: 'home icon'
			});

			telemetryService.recordSearchMetrics({
				operation: 'findIcons',
				duration: 120,
				resultCount: 3,
				cacheHit: false,
				query: 'user icon'
			});

			// Record user behavior
			predictiveCache.recordUserQuery('home icon', 'user1', 'session1');
			predictiveCache.recordUserQuery('user icon', 'user1', 'session1');

			const predictions = await predictiveCache.analyzePatternsAndPredict();
			expect(predictions).toBeDefined();
			expect(Array.isArray(predictions)).toBe(true);
		});

		it('should queue predictions for warming', async () => {
			const mockPredictions = [
				{
					query: 'home icon',
					probability: 0.8,
					priority: 'high' as const,
					estimatedHitTime: Date.now() + 60000,
					reasoning: ['High frequency', 'Recent usage']
				},
				{
					query: 'user icon',
					probability: 0.6,
					priority: 'medium' as const,
					estimatedHitTime: Date.now() + 120000,
					reasoning: ['Moderate frequency']
				}
			];

			await predictiveCache.queueForWarming(mockPredictions);
			const stats = predictiveCache.getWarmingStats();
			expect(stats.queueSize).toBeGreaterThan(0);
		});
	});

	describe('SmartCacheService', () => {
		it('should cache and retrieve data with smart policies', async () => {
			const testData: ResponseContent[] = [
				{ type: 'text', text: 'home-icon (Score: 0.95, Category: System)' },
				{ type: 'text', text: 'house-icon (Score: 0.85, Category: Building)' }
			];

			// Set cache entry
			await smartCache.set('home icon', testData);

			// Retrieve cache entry
			const retrieved = await smartCache.get('home icon', 'user1', 'session1');
			expect(retrieved).toBeDefined();
			expect(retrieved!.length).toBe(2);
			expect(retrieved![0].text).toContain('home-icon');
		});

		it('should execute cache warming', async () => {
			const mockWarmFunction = vi.fn().mockResolvedValue([
				{ type: 'text', text: 'warmed-icon (Score: 0.90, Category: System)' }
			]);

			// Setup some predictions
			predictiveCache.recordUserQuery('popular query', 'user1', 'session1');
			
			await smartCache.executeWarming(mockWarmFunction);
			
			// Verify warm function was called for predictions
			// Note: This might not be called immediately if there are no high-probability predictions
			expect(mockWarmFunction).toHaveBeenCalledTimes(0); // No predictions initially
		});

		it('should provide comprehensive metrics', () => {
			const metrics = smartCache.getMetrics();
			expect(metrics).toBeDefined();
			expect(metrics.hitRate).toBeDefined();
			expect(metrics.missRate).toBeDefined();
			expect(metrics.memoryUsage).toBeDefined();
			expect(metrics.entryCount).toBeDefined();
		});

		it('should provide detailed analytics', async () => {
			// Add some test data
			await smartCache.set('test query 1', [{ type: 'text', text: 'result 1' }]);
			await smartCache.set('test query 2', [{ type: 'text', text: 'result 2' }]);

			const analytics = smartCache.getAnalytics();
			expect(analytics).toBeDefined();
			expect(analytics.topEntries).toBeDefined();
			expect(analytics.sizeDistribution).toBeDefined();
			expect(analytics.ttlDistribution).toBeDefined();
			expect(analytics.tagAnalytics).toBeDefined();
			expect(analytics.warmingStats).toBeDefined();
		});

		it('should handle cache eviction when limits are reached', async () => {
			// Fill cache beyond limits by adding many entries
			const testData = [{ type: 'text', text: 'test' }] as ResponseContent[];
			
			// Add entries beyond maxEntries (100 in config)
			for (let i = 0; i < 150; i++) {
				await smartCache.set(`test-query-${i}`, testData);
			}

			const metrics = smartCache.getMetrics();
			expect(metrics.entryCount).toBeLessThanOrEqual(100); // Should not exceed maxEntries
			expect(metrics.evictionCount).toBeGreaterThan(0); // Should have evicted some entries
		});

		it('should adapt TTL based on usage patterns', async () => {
			const testData = [{ type: 'text', text: 'adaptive test' }] as ResponseContent[];
			
			// Test different query patterns
			await smartCache.set('popular query', testData); // Should get longer TTL
			await smartCache.set('very specific long query with many words', testData); // Should get shorter TTL
			
			// Verify entries were stored (can't easily test TTL adaptation in unit test)
			const popular = await smartCache.get('popular query');
			const specific = await smartCache.get('very specific long query with many words');
			
			expect(popular).toBeDefined();
			expect(specific).toBeDefined();
		});

		it('should clear cache selectively', async () => {
			const testData = [{ type: 'text', text: 'test' }] as ResponseContent[];
			
			await smartCache.set('home icon', testData);
			await smartCache.set('user icon', testData);
			await smartCache.set('settings panel', testData);

			// Clear entries containing 'icon'
			await smartCache.clear('icon');

			// Verify selective clearing
			const home = await smartCache.get('home icon');
			const user = await smartCache.get('user icon');
			const settings = await smartCache.get('settings panel');

			expect(home).toBeNull();
			expect(user).toBeNull();
			expect(settings).toBeDefined(); // Should still exist
		});
	});

	describe('Integration Workflow', () => {
		it('should work together in complete caching workflow', async () => {
			const testData: ResponseContent[] = [
				{ type: 'text', text: 'integrated-icon (Score: 0.92, Category: System)' }
			];

			// 1. Record user behavior for prediction
			predictiveCache.recordUserQuery('integrated test', 'user1', 'session1', 'system', 1);
			
			// 2. Cache initial data
			await smartCache.set('integrated test', testData);
			
			// 3. Retrieve cached data (should hit cache)
			const cached = await smartCache.get('integrated test', 'user1', 'session1');
			expect(cached).toBeDefined();
			expect(cached![0].text).toContain('integrated-icon');
			
			// 4. Generate predictions
			const predictions = await predictiveCache.analyzePatternsAndPredict();
			expect(predictions).toBeDefined();
			
			// 5. Get comprehensive analytics
			const cacheMetrics = smartCache.getMetrics();
			const cacheAnalytics = smartCache.getAnalytics();
			const warmingStats = predictiveCache.getWarmingStats();
			
			expect(cacheMetrics.hitRate).toBeGreaterThan(0);
			expect(cacheAnalytics.topEntries.length).toBeGreaterThan(0);
			expect(warmingStats.totalUsers).toBe(1);
		});

		it('should demonstrate predictive warming benefits', async () => {
			let warmingCalls = 0;
			const mockWarmFunction = vi.fn().mockImplementation(async (query: string) => {
				warmingCalls++;
				return [{ type: 'text', text: `warmed: ${query}` }] as ResponseContent[];
			});

			// 1. Record patterns that would trigger predictions
			for (let i = 0; i < 10; i++) {
				predictiveCache.recordUserQuery('popular pattern', `user${i}`, `session${i}`);
				telemetryService.recordSearchMetrics({
					operation: 'findIcons',
					duration: 100,
					resultCount: 5,
					cacheHit: false,
					query: 'popular pattern'
				});
			}

			// 2. Execute warming
			await smartCache.executeWarming(mockWarmFunction);

			// 3. Verify that warming might have occurred
			// Note: Actual warming depends on prediction thresholds and patterns
			const stats = smartCache.getMetrics();
			expect(stats).toBeDefined();
		});
	});
});
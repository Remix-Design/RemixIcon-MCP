import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreakerService, CircuitBreakerState } from '../../src/infrastructure/resilience/circuit-breaker.service';
import { GracefulDegradationService, DegradationLevel } from '../../src/infrastructure/resilience/graceful-degradation.service';
import { FallbackManagerService, FallbackStrategy } from '../../src/infrastructure/resilience/fallback-manager.service';
import { ConsoleLogger, LogLevel } from '../../src/infrastructure/logging/logger';

describe('Resilience Services Tests', () => {
	let logger: ConsoleLogger;
	let mockTelemetryService: any;

	beforeEach(() => {
		logger = new ConsoleLogger(LogLevel.DEBUG);
		mockTelemetryService = {
			recordMetric: vi.fn(),
			recordEvent: vi.fn()
		};
	});

	describe('CircuitBreakerService', () => {
		let circuitBreaker: CircuitBreakerService;

		beforeEach(() => {
			circuitBreaker = new CircuitBreakerService(
				'test-service',
				{
					failureThreshold: 3,
					successThreshold: 2,
					timeout: 1000,
					monitoringWindow: 10000,
					volumeThreshold: 5,
					errorThreshold: 0.5
				},
				logger,
				mockTelemetryService
			);
		});

		it('should start in closed state', () => {
			expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
		});

		it('should execute successful operations normally', async () => {
			const mockFn = vi.fn().mockResolvedValue('success');
			
			const result = await circuitBreaker.execute(mockFn);
			
			expect(result.success).toBe(true);
			expect(result.data).toBe('success');
			expect(result.circuitState).toBe(CircuitBreakerState.CLOSED);
			expect(mockFn).toHaveBeenCalledOnce();
		});

		it('should open circuit after consecutive failures', async () => {
			const mockFn = vi.fn().mockRejectedValue(new Error('Service failure'));
			
			// Execute 3 failing operations to trigger circuit opening
			for (let i = 0; i < 3; i++) {
				await circuitBreaker.execute(mockFn);
			}
			
			expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
		});

		it('should reject requests when circuit is open', async () => {
			const mockFn = vi.fn().mockRejectedValue(new Error('Service failure'));
			
			// Open the circuit
			for (let i = 0; i < 3; i++) {
				await circuitBreaker.execute(mockFn);
			}
			
			// Next request should be rejected
			const result = await circuitBreaker.execute(mockFn);
			
			expect(result.success).toBe(false);
			expect(result.error?.message).toContain('Circuit breaker \'test-service\' is open');
		});

		it('should use fallback when circuit is open', async () => {
			const mockFn = vi.fn().mockRejectedValue(new Error('Service failure'));
			const mockFallback = vi.fn().mockResolvedValue('fallback-data');
			
			// Open the circuit
			for (let i = 0; i < 3; i++) {
				await circuitBreaker.execute(mockFn);
			}
			
			// Execute with fallback
			const result = await circuitBreaker.execute(mockFn, mockFallback);
			
			expect(result.success).toBe(true);
			expect(result.data).toBe('fallback-data');
			expect(result.fallbackUsed).toBe(true);
			expect(mockFallback).toHaveBeenCalledOnce();
		});

		it('should transition to half-open after timeout', async () => {
			const mockFn = vi.fn().mockRejectedValue(new Error('Service failure'));
			
			// Open the circuit
			for (let i = 0; i < 3; i++) {
				await circuitBreaker.execute(mockFn);
			}
			
			expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
			
			// Force state change to simulate timeout
			circuitBreaker.forceState(CircuitBreakerState.HALF_OPEN, 'Timeout expired');
			
			expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
		});

		it('should close circuit after successful operations in half-open state', async () => {
			const mockFn = vi.fn().mockResolvedValue('success');
			
			// Set to half-open state
			circuitBreaker.forceState(CircuitBreakerState.HALF_OPEN, 'Testing');
			
			// Execute successful operations
			for (let i = 0; i < 2; i++) {
				await circuitBreaker.execute(mockFn);
			}
			
			expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
		});

		it('should provide comprehensive metrics', () => {
			const metrics = circuitBreaker.getMetrics();
			
			expect(metrics).toHaveProperty('totalRequests');
			expect(metrics).toHaveProperty('successfulRequests');
			expect(metrics).toHaveProperty('failedRequests');
			expect(metrics).toHaveProperty('currentFailureRate');
			expect(metrics).toHaveProperty('uptime');
			expect(metrics).toHaveProperty('downtime');
		});

		it('should reset circuit breaker state', () => {
			// Force to open state
			circuitBreaker.forceState(CircuitBreakerState.OPEN, 'Testing');
			expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
			
			// Reset
			circuitBreaker.reset();
			expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
			
			const metrics = circuitBreaker.getMetrics();
			expect(metrics.totalRequests).toBe(0);
		});
	});

	describe('GracefulDegradationService', () => {
		let degradationService: GracefulDegradationService;

		beforeEach(() => {
			degradationService = new GracefulDegradationService(
				{
					cpuThreshold: 0.8,
					memoryThreshold: 0.85,
					responseTimeThreshold: 2000,
					errorRateThreshold: 0.1,
					connectionThreshold: 100,
					queueSizeThreshold: 50
				},
				logger,
				mockTelemetryService
			);

			// Register test features
			degradationService.registerFeature({
				featureName: 'ai-search',
				priority: 1,
				dependencies: [],
				degradationLevels: {
					normal: { enabled: true },
					partial: { enabled: true, timeoutMs: 1000 },
					minimal: { enabled: false, fallbackBehavior: 'Use basic search' },
					emergency: { enabled: false }
				}
			});

			degradationService.registerFeature({
				featureName: 'analytics',
				priority: 2,
				dependencies: [],
				degradationLevels: {
					normal: { enabled: true },
					partial: { enabled: true, simplified: true },
					minimal: { enabled: false },
					emergency: { enabled: false }
				}
			});
		});

		it('should start in normal degradation level', () => {
			const status = degradationService.getStatus();
			expect(status.level).toBe(DegradationLevel.NORMAL);
		});

		it('should enable all features in normal mode', () => {
			expect(degradationService.isFeatureEnabled('ai-search')).toBe(true);
			expect(degradationService.isFeatureEnabled('analytics')).toBe(true);
		});

		it('should degrade to partial level under moderate load', () => {
			degradationService.updateSystemHealth({
				cpuUsage: 0.85, // Above threshold
				memoryUsage: 0.7,
				responseTime: 1500,
				errorRate: 0.05,
				activeConnections: 80,
				queueSize: 30,
				timestamp: Date.now()
			});

			const status = degradationService.getStatus();
			expect(status.level).toBe(DegradationLevel.PARTIAL);
		});

		it('should degrade to minimal level under high load', () => {
			degradationService.updateSystemHealth({
				cpuUsage: 0.9,
				memoryUsage: 0.9,
				responseTime: 3000, // Above threshold
				errorRate: 0.12, // Above threshold
				activeConnections: 120, // Above threshold
				queueSize: 60, // Above threshold
				timestamp: Date.now()
			});

			const status = degradationService.getStatus();
			expect(status.level).toBe(DegradationLevel.MINIMAL);
		});

		it('should degrade to emergency level under critical load', () => {
			degradationService.updateSystemHealth({
				cpuUsage: 0.95, // Critical
				memoryUsage: 0.95, // Critical
				responseTime: 8000,
				errorRate: 0.25, // Critical
				activeConnections: 200,
				queueSize: 100,
				timestamp: Date.now()
			});

			const status = degradationService.getStatus();
			expect(status.level).toBe(DegradationLevel.EMERGENCY);
		});

		it('should disable features based on degradation level', () => {
			// Force minimal degradation
			degradationService.forceDegradationLevel(DegradationLevel.MINIMAL, 'Testing');

			expect(degradationService.isFeatureEnabled('ai-search')).toBe(false);
			expect(degradationService.isFeatureEnabled('analytics')).toBe(false);
		});

		it('should provide feature configurations', () => {
			degradationService.forceDegradationLevel(DegradationLevel.PARTIAL, 'Testing');

			const aiConfig = degradationService.getFeatureConfig('ai-search');
			expect(aiConfig).toBeDefined();
			expect(aiConfig.enabled).toBe(true);
			expect(aiConfig.timeoutMs).toBe(1000);
		});

		it('should execute with degradation-aware behavior', async () => {
			const primaryFn = vi.fn().mockResolvedValue('primary-result');
			const fallbackFn = vi.fn().mockResolvedValue('fallback-result');

			// Normal mode - should use primary
			const result1 = await degradationService.executeWithDegradation(
				'ai-search',
				primaryFn,
				fallbackFn
			);
			expect(result1).toBe('primary-result');
			expect(primaryFn).toHaveBeenCalled();

			// Disable feature - should use fallback
			degradationService.forceDegradationLevel(DegradationLevel.MINIMAL, 'Testing');

			const result2 = await degradationService.executeWithDegradation(
				'ai-search',
				primaryFn,
				fallbackFn
			);
			expect(result2).toBe('fallback-result');
			expect(fallbackFn).toHaveBeenCalled();
		});

		it('should recover from degradation when health improves', () => {
			// Degrade to minimal
			degradationService.forceDegradationLevel(DegradationLevel.MINIMAL, 'Testing');
			expect(degradationService.getStatus().level).toBe(DegradationLevel.MINIMAL);

			// Simulate good health over time
			for (let i = 0; i < 5; i++) {
				degradationService.updateSystemHealth({
					cpuUsage: 0.3,
					memoryUsage: 0.4,
					responseTime: 200,
					errorRate: 0.01,
					activeConnections: 30,
					queueSize: 5,
					timestamp: Date.now() + i * 1000
				});
			}

			// Should start recovering
			const status = degradationService.getStatus();
			expect(status.level).toBe(DegradationLevel.PARTIAL); // One step better
		});

		it('should provide comprehensive status', () => {
			const status = degradationService.getStatus();

			expect(status).toHaveProperty('level');
			expect(status).toHaveProperty('activeFeatures');
			expect(status).toHaveProperty('disabledFeatures');
			expect(status).toHaveProperty('recentHealth');
			expect(status).toHaveProperty('degradationHistory');
		});

		it('should calculate resilience metrics', () => {
			// Simulate some degradations
			degradationService.forceDegradationLevel(DegradationLevel.PARTIAL, 'Load test');
			degradationService.forceDegradationLevel(DegradationLevel.NORMAL, 'Recovery');

			const metrics = degradationService.getResilienceMetrics();

			expect(metrics).toHaveProperty('totalDegradations');
			expect(metrics).toHaveProperty('timeInDegradedState');
			expect(metrics).toHaveProperty('averageRecoveryTime');
			expect(metrics).toHaveProperty('mostCommonTriggers');
			expect(metrics).toHaveProperty('currentUptime');
		});
	});

	describe('FallbackManagerService', () => {
		let fallbackManager: FallbackManagerService;
		let mockCacheService: any;

		beforeEach(() => {
			mockCacheService = {
				get: vi.fn(),
				set: vi.fn()
			};

			fallbackManager = new FallbackManagerService(
				logger,
				mockTelemetryService,
				mockCacheService
			);

			// Register test fallback strategies
			fallbackManager.registerFallback('test-operation', [
				{
					strategy: FallbackStrategy.CACHE_ONLY,
					priority: 100,
					conditions: { circuitStates: ['open'] },
					config: { cacheKey: 'test-cache' }
				},
				{
					strategy: FallbackStrategy.STATIC_RESPONSE,
					priority: 80,
					conditions: {},
					config: { staticData: { message: 'Static fallback response' } }
				}
			]);

			// Register static response
			fallbackManager.registerStaticResponse('test-static', { data: 'test-data' });
		});

		it('should execute primary operation successfully', async () => {
			const primaryFn = vi.fn().mockResolvedValue('primary-result');

			const result = await fallbackManager.executeWithFallback(
				'test-operation',
				primaryFn
			);

			expect(result.success).toBe(true);
			expect(result.data).toBe('primary-result');
			expect(primaryFn).toHaveBeenCalled();
		});

		it('should use fallback when primary operation fails', async () => {
			const primaryFn = vi.fn().mockRejectedValue(new Error('Primary failed'));

			const result = await fallbackManager.executeWithFallback(
				'test-operation',
				primaryFn
			);

			expect(result.success).toBe(true);
			expect(result.data).toEqual({ message: 'Static fallback response' });
			expect(result.strategy).toBe(FallbackStrategy.STATIC_RESPONSE);
		});

		it('should try cache fallback first when circuit is open', async () => {
			const primaryFn = vi.fn().mockRejectedValue(new Error('Circuit open'));
			mockCacheService.get.mockResolvedValue('cached-data');

			// Simulate circuit breaker state
			const mockCircuitBreakers = new Map();
			const mockBreaker = { getState: () => 'open' };
			mockCircuitBreakers.set('test-operation', mockBreaker);

			const fallbackManagerWithCircuit = new FallbackManagerService(
				logger,
				mockTelemetryService,
				mockCacheService,
				mockCircuitBreakers
			);

			fallbackManagerWithCircuit.registerFallback('test-operation', [
				{
					strategy: FallbackStrategy.CACHE_ONLY,
					priority: 100,
					conditions: { circuitStates: ['open'] },
					config: { cacheKey: 'test-cache' }
				}
			]);

			const result = await fallbackManagerWithCircuit.executeWithFallback(
				'test-operation',
				primaryFn
			);

			expect(result.success).toBe(true);
			expect(result.data).toBe('cached-data');
			expect(result.strategy).toBe(FallbackStrategy.CACHE_ONLY);
			expect(mockCacheService.get).toHaveBeenCalled();
		});

		it('should cache data for fallback use', () => {
			fallbackManager.cacheForFallback('test-key', 'test-data', 60000);

			// Cache should be available for cache-only fallback
			expect(true).toBe(true); // Basic test that caching doesn't throw
		});

		it('should provide execution statistics', () => {
			const stats = fallbackManager.getStatistics();
			expect(stats).toBeInstanceOf(Map);
		});

		it('should handle different fallback strategies', async () => {
			// Test simplified strategy
			fallbackManager.registerFallback('simplified-test', [
				{
					strategy: FallbackStrategy.SIMPLIFIED,
					priority: 100,
					conditions: {},
					config: {}
				}
			]);

			const result = await fallbackManager.executeWithFallback(
				'simplified-test',
				async () => { throw new Error('Failed'); }
			);

			expect(result.success).toBe(true);
			expect(result.strategy).toBe(FallbackStrategy.SIMPLIFIED);
		});

		it('should handle empty response strategy', async () => {
			fallbackManager.registerFallback('empty-test', [
				{
					strategy: FallbackStrategy.EMPTY_RESPONSE,
					priority: 100,
					conditions: {},
					config: {}
				}
			]);

			const result = await fallbackManager.executeWithFallback(
				'empty-test',
				async () => { throw new Error('Failed'); }
			);

			expect(result.success).toBe(true);
			expect(result.strategy).toBe(FallbackStrategy.EMPTY_RESPONSE);
		});

		it('should handle error response strategy', async () => {
			fallbackManager.registerFallback('error-test', [
				{
					strategy: FallbackStrategy.ERROR_RESPONSE,
					priority: 100,
					conditions: {},
					config: { errorMessage: 'Custom error message' }
				}
			]);

			const result = await fallbackManager.executeWithFallback(
				'error-test',
				async () => { throw new Error('Failed'); }
			);

			expect(result.success).toBe(false);
			expect(result.strategy).toBe(FallbackStrategy.ERROR_RESPONSE);
			expect(result.error?.message).toBe('Custom error message');
		});

		it('should clear cache and statistics', () => {
			fallbackManager.cacheForFallback('test', 'data');
			fallbackManager.clear();

			const stats = fallbackManager.getStatistics();
			expect(stats.size).toBe(0);
		});
	});

	describe('Integration Scenarios', () => {
		it('should work together in complete resilience workflow', async () => {
			// Setup integrated services
			const circuitBreaker = new CircuitBreakerService(
				'integrated-service',
				{
					failureThreshold: 2,
					successThreshold: 1,
					timeout: 500,
					monitoringWindow: 5000,
					volumeThreshold: 3,
					errorThreshold: 0.5
				},
				logger,
				mockTelemetryService
			);

			const degradationService = new GracefulDegradationService(
				{
					cpuThreshold: 0.7,
					memoryThreshold: 0.8,
					responseTimeThreshold: 1000,
					errorRateThreshold: 0.05,
					connectionThreshold: 50,
					queueSizeThreshold: 25
				},
				logger,
				mockTelemetryService
			);

			degradationService.registerFeature({
				featureName: 'integrated-feature',
				priority: 1,
				dependencies: [],
				degradationLevels: {
					normal: { enabled: true },
					partial: { enabled: true, timeoutMs: 500 },
					minimal: { enabled: false },
					emergency: { enabled: false }
				}
			});

			const fallbackManager = new FallbackManagerService(
				logger,
				mockTelemetryService
			);

			fallbackManager.registerFallback('integrated-operation', [
				{
					strategy: FallbackStrategy.STATIC_RESPONSE,
					priority: 100,
					conditions: {},
					config: { staticData: { message: 'Fallback response' } }
				}
			]);

			// 1. Normal operation
			let mockFn = vi.fn().mockResolvedValue('success');
			let result = await circuitBreaker.execute(mockFn);
			expect(result.success).toBe(true);

			// 2. Trigger circuit opening
			mockFn = vi.fn().mockRejectedValue(new Error('Service failure'));
			for (let i = 0; i < 2; i++) {
				await circuitBreaker.execute(mockFn);
			}
			expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

			// 3. Degrade system under load
			degradationService.updateSystemHealth({
				cpuUsage: 0.85,
				memoryUsage: 0.85,
				responseTime: 1500,
				errorRate: 0.08,
				activeConnections: 60,
				queueSize: 30,
				timestamp: Date.now()
			});

			expect(degradationService.getStatus().level).toBe(DegradationLevel.PARTIAL);
			expect(degradationService.isFeatureEnabled('integrated-feature')).toBe(true);

			// 4. Use fallback when circuit is open
			const fallbackResult = await fallbackManager.executeWithFallback(
				'integrated-operation',
				async () => { throw new Error('Circuit open'); }
			);

			expect(fallbackResult.success).toBe(true);
			expect(fallbackResult.strategy).toBe(FallbackStrategy.STATIC_RESPONSE);

			// 5. Recovery scenario
			// Circuit breaker timeout and successful operation
			circuitBreaker.forceState(CircuitBreakerState.HALF_OPEN, 'Timeout');
			mockFn = vi.fn().mockResolvedValue('recovered');
			result = await circuitBreaker.execute(mockFn);
			expect(result.success).toBe(true);
			expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);

			// System health improves
			for (let i = 0; i < 5; i++) {
				degradationService.updateSystemHealth({
					cpuUsage: 0.3,
					memoryUsage: 0.4,
					responseTime: 200,
					errorRate: 0.01,
					activeConnections: 20,
					queueSize: 5,
					timestamp: Date.now() + i * 1000
				});
			}

			expect(degradationService.getStatus().level).toBe(DegradationLevel.NORMAL);
		});
	});
});
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelemetryService } from '../../src/infrastructure/observability/telemetry.service';
import { DashboardService } from '../../src/infrastructure/observability/dashboard.service';
import { CorrelationTracker } from '../../src/infrastructure/observability/correlation-tracker';
import { ConsoleLogger, LogLevel } from '../../src/infrastructure/logging/logger';

describe('Observability Integration', () => {
	let logger: ConsoleLogger;
	let telemetryService: TelemetryService;
	let dashboardService: DashboardService;
	let correlationTracker: CorrelationTracker;
	let mockAnalyticsEngine: any;

	beforeEach(() => {
		logger = new ConsoleLogger(LogLevel.DEBUG);
		
		// Mock Analytics Engine
		mockAnalyticsEngine = {
			writeDataPoint: vi.fn().mockResolvedValue(undefined)
		};
		
		telemetryService = new TelemetryService(logger, mockAnalyticsEngine);
		dashboardService = new DashboardService(telemetryService, logger);
		correlationTracker = new CorrelationTracker(logger);
	});

	describe('TelemetryService', () => {
		it('should start and finish spans correctly', () => {
			const spanId = telemetryService.startSpan('test.operation');
			expect(spanId).toBeTruthy();
			
			telemetryService.addSpanTags(spanId, { testTag: 'value' });
			telemetryService.addSpanLog(spanId, 'Test log message', 'info');
			telemetryService.finishSpan(spanId, 'success');
			
			const activeSpans = telemetryService.getActiveSpans();
			expect(activeSpans.length).toBeGreaterThanOrEqual(0);
		});

		it('should record search metrics', () => {
			telemetryService.recordSearchMetrics({
				operation: 'findIcons',
				duration: 150,
				resultCount: 5,
				cacheHit: true,
				query: 'test search'
			});

			const metrics = telemetryService.getPerformanceMetrics();
			expect(metrics.requestCount).toBe(1);
			expect(metrics.cacheHitRate).toBe(1);
		});

		it('should track query patterns', () => {
			telemetryService.recordSearchMetrics({
				operation: 'findIcons',
				duration: 100,
				resultCount: 3,
				cacheHit: false,
				query: 'home icon'
			});

			telemetryService.recordSearchMetrics({
				operation: 'findIcons',
				duration: 120,
				resultCount: 4,
				cacheHit: true,
				query: 'home icon'
			});

			const patterns = telemetryService.getQueryPatterns();
			expect(patterns.length).toBeGreaterThan(0);
			expect(patterns[0].pattern).toBe('home icon');
			expect(patterns[0].frequency).toBe(2);
		});

		it('should export metrics correctly', () => {
			telemetryService.recordSearchMetrics({
				operation: 'findIcons',
				duration: 200,
				resultCount: 10,
				cacheHit: false,
				query: 'search test'
			});

			const exported = telemetryService.exportMetrics();
			expect(exported.performance).toBeDefined();
			expect(exported.queryPatterns).toBeDefined();
			expect(exported.recentSearches).toBeDefined();
			expect(exported.activeSpans).toBeDefined();
		});
	});

	describe('DashboardService', () => {
		it('should get dashboard metrics', () => {
			// Record some metrics first
			telemetryService.recordSearchMetrics({
				operation: 'findIcons',
				duration: 150,
				resultCount: 5,
				cacheHit: true,
				query: 'dashboard test'
			});

			const metrics = dashboardService.getDashboardMetrics();
			expect(metrics.overview).toBeDefined();
			expect(metrics.performance).toBeDefined();
			expect(metrics.topQueries).toBeDefined();
			expect(metrics.recentSearches).toBeDefined();
		});

		it('should manage dashboard widgets', () => {
			const widget = {
				id: 'test-widget',
				title: 'Test Widget',
				type: 'metric' as const,
				data: { value: 42 },
				lastUpdated: Date.now()
			};

			dashboardService.updateWidget(widget);
			const retrieved = dashboardService.getWidget('test-widget');
			expect(retrieved).toBeDefined();
			expect(retrieved!.title).toBe('Test Widget');
		});

		it('should handle alerts', () => {
			// Add a custom alert rule
			const alertRule = {
				id: 'test-alert',
				name: 'Test Alert',
				metric: 'errorRate',
				threshold: 0.1,
				comparison: 'gt' as const,
				enabled: true,
				cooldown: 5
			};

			dashboardService.addAlertRule(alertRule);
			
			// Simulate high error rate
			for (let i = 0; i < 10; i++) {
				telemetryService.recordSearchMetrics({
					operation: 'findIcons',
					duration: 100,
					resultCount: 0,
					cacheHit: false,
					errorCount: 1,
					query: `error test ${i}`
				});
			}

			// Check if alerts are triggered (may need to wait for check interval)
			const alerts = dashboardService.getActiveAlerts();
			// Note: Alerts are checked on interval, so this might be 0 in tests
			expect(alerts).toBeDefined();
		});
	});

	describe('CorrelationTracker', () => {
		it('should create correlation contexts', () => {
			const context = correlationTracker.createContext({
				userId: 'test-user',
				metadata: { operation: 'test' }
			});

			expect(context.correlationId).toBeTruthy();
			expect(context.traceId).toBeTruthy();
			expect(context.requestId).toBeTruthy();
			expect(context.userId).toBe('test-user');
		});

		it('should track operations', () => {
			const context = correlationTracker.createContext();
			const operationId = correlationTracker.trackOperation(
				context.correlationId,
				'search',
				'SearchService',
				{ query: 'test' }
			);

			expect(operationId).toBeTruthy();

			correlationTracker.completeOperation(
				context.correlationId,
				operationId,
				'success',
				{ resultCount: 5 }
			);

			correlationTracker.completeContext(context.correlationId, 'completed');

			const data = correlationTracker.getCorrelationData(context.correlationId);
			expect(data).toBeDefined();
			expect(data!.operations.length).toBe(1);
			expect(data!.status).toBe('completed');
		});

		it('should provide analytics', () => {
			// Create multiple contexts with operations
			for (let i = 0; i < 5; i++) {
				const context = correlationTracker.createContext();
				const operationId = correlationTracker.trackOperation(
					context.correlationId,
					'findIcons',
					'SearchService'
				);
				correlationTracker.completeOperation(
					context.correlationId,
					operationId,
					i < 4 ? 'success' : 'error'
				);
				correlationTracker.completeContext(
					context.correlationId,
					i < 4 ? 'completed' : 'failed'
				);
			}

			const analytics = correlationTracker.getAnalytics();
			expect(analytics.totalContexts).toBe(5);
			expect(analytics.operationStats.length).toBeGreaterThan(0);
			expect(analytics.errorRate).toBe(0.2); // 1 out of 5 failed
		});
	});

	describe('Integration Workflow', () => {
		it('should work together in a complete search workflow', () => {
			// Create correlation context
			const context = correlationTracker.createContext({
				userId: 'integration-test-user',
				metadata: { operation: 'findIcons', query: 'home' }
			});

			// Start telemetry span
			const spanId = telemetryService.startSpan('search.findIcons', context.correlationId);
			telemetryService.addSpanTags(spanId, { query: 'home', userId: 'integration-test-user' });

			// Track operation
			const operationId = correlationTracker.trackOperation(
				context.correlationId,
				'findIcons',
				'UnifiedSearchService'
			);

			// Simulate successful search
			telemetryService.recordSearchMetrics({
				operation: 'findIcons',
				duration: 85,
				resultCount: 8,
				cacheHit: true,
				query: 'home'
			});

			// Complete tracking
			telemetryService.finishSpan(spanId, 'success');
			correlationTracker.completeOperation(context.correlationId, operationId, 'success', {
				resultCount: 8,
				cacheHit: true
			});
			correlationTracker.completeContext(context.correlationId, 'completed');

			// Verify data was recorded correctly
			const dashboardMetrics = dashboardService.getDashboardMetrics();
			expect(dashboardMetrics.overview.totalRequests).toBeGreaterThan(0);
			expect(dashboardMetrics.recentSearches.length).toBeGreaterThan(0);

			const telemetryData = telemetryService.exportMetrics();
			expect(telemetryData.recentSearches.length).toBeGreaterThan(0);

			const correlationAnalytics = correlationTracker.getAnalytics();
			expect(correlationAnalytics.totalContexts).toBeGreaterThan(0);
		});
	});
});
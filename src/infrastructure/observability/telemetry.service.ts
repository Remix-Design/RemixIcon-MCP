import { ILogger } from '../logging/logger';
import { ErrorHandler, ErrorType } from '../error/error-handler';

/**
 * Search operation metrics
 */
export interface SearchMetrics {
	operation: string;
	duration: number;
	resultCount: number;
	cacheHit: boolean;
	stage?: string;
	errorCount?: number;
	query: string;
	timestamp: number;
}

/**
 * Performance metrics for tracking system performance
 */
export interface PerformanceMetrics {
	memoryUsage: number;
	requestCount: number;
	errorRate: number;
	avgResponseTime: number;
	p95ResponseTime: number;
	cacheHitRate: number;
	timestamp: number;
}

/**
 * Trace span for distributed tracing
 */
export interface TraceSpan {
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	operationName: string;
	startTime: number;
	endTime?: number;
	duration?: number;
	tags: Record<string, any>;
	logs: Array<{ timestamp: number; message: string; level: string }>;
	status: 'success' | 'error' | 'timeout';
}

/**
 * Query pattern analytics
 */
export interface QueryPattern {
	pattern: string;
	frequency: number;
	avgResponseTime: number;
	successRate: number;
	lastSeen: number;
	categories: string[];
}

/**
 * Telemetry configuration
 */
interface TelemetryConfig {
	enabled: boolean;
	metricsInterval: number;
	maxSpans: number;
	maxQueryPatterns: number;
	enableAnalyticsEngine: boolean;
	enableCloudflareInsights: boolean;
}

/**
 * Comprehensive telemetry service for observability
 * Integrates with Cloudflare Analytics Engine and provides real-time metrics
 */
export class TelemetryService {
	private readonly config: TelemetryConfig;
	private readonly errorHandler: ErrorHandler;
	private readonly activeSpans = new Map<string, TraceSpan>();
	private readonly queryPatterns = new Map<string, QueryPattern>();
	private readonly recentMetrics: SearchMetrics[] = [];
	private readonly performanceBuffer: PerformanceMetrics[] = [];
	
	// Performance counters
	private requestCount = 0;
	private errorCount = 0;
	private responseTimes: number[] = [];
	private cacheHits = 0;
	private cacheRequests = 0;
	
	constructor(
		private readonly logger: ILogger,
		private readonly analyticsEngine?: any, // Cloudflare Analytics Engine
		config?: Partial<TelemetryConfig>
	) {
		this.config = {
			enabled: true,
			metricsInterval: 60000, // 1 minute
			maxSpans: 1000,
			maxQueryPatterns: 500,
			enableAnalyticsEngine: true,
			enableCloudflareInsights: true,
			...config
		};
		
		this.errorHandler = new ErrorHandler(logger);
		
		if (this.config.enabled) {
			this.startMetricsCollection();
		}
	}

	/**
	 * Start a new trace span
	 */
	startSpan(operationName: string, parentSpanId?: string): string {
		if (!this.config.enabled) return '';
		
		const traceId = parentSpanId ? this.getTraceId(parentSpanId) : this.generateTraceId();
		const spanId = this.generateSpanId();
		
		const span: TraceSpan = {
			traceId,
			spanId,
			parentSpanId,
			operationName,
			startTime: Date.now(),
			tags: {},
			logs: [],
			status: 'success'
		};
		
		this.activeSpans.set(spanId, span);
		
		// Clean up old spans
		if (this.activeSpans.size > this.config.maxSpans) {
			this.cleanupOldSpans();
		}
		
		return spanId;
	}

	/**
	 * Add tags to a span
	 */
	addSpanTags(spanId: string, tags: Record<string, any>): void {
		const span = this.activeSpans.get(spanId);
		if (span) {
			Object.assign(span.tags, tags);
		}
	}

	/**
	 * Add log entry to a span
	 */
	addSpanLog(spanId: string, message: string, level: string = 'info'): void {
		const span = this.activeSpans.get(spanId);
		if (span) {
			span.logs.push({
				timestamp: Date.now(),
				message,
				level
			});
		}
	}

	/**
	 * Finish a trace span
	 */
	finishSpan(spanId: string, status: 'success' | 'error' | 'timeout' = 'success'): void {
		const span = this.activeSpans.get(spanId);
		if (!span) return;
		
		span.endTime = Date.now();
		span.duration = span.endTime - span.startTime;
		span.status = status;
		
		// Log completed span
		this.logger.debug('Trace span completed', {
			traceId: span.traceId,
			spanId: span.spanId,
			operation: span.operationName,
			duration: span.duration,
			status: span.status
		});
		
		// Send to Analytics Engine if enabled
		if (this.config.enableAnalyticsEngine && this.analyticsEngine) {
			this.sendSpanToAnalytics(span);
		}
		
		// Keep span for a while for potential queries
		setTimeout(() => {
			this.activeSpans.delete(spanId);
		}, 30000); // Keep for 30 seconds
	}

	/**
	 * Record search operation metrics
	 */
	recordSearchMetrics(metrics: Omit<SearchMetrics, 'timestamp'>): void {
		if (!this.config.enabled) return;
		
		const fullMetrics: SearchMetrics = {
			...metrics,
			timestamp: Date.now()
		};
		
		// Update counters
		this.requestCount++;
		if (metrics.errorCount && metrics.errorCount > 0) {
			this.errorCount += metrics.errorCount;
		}
		
		this.responseTimes.push(metrics.duration);
		if (this.responseTimes.length > 1000) {
			this.responseTimes = this.responseTimes.slice(-500); // Keep last 500
		}
		
		if (metrics.cacheHit) {
			this.cacheHits++;
		}
		this.cacheRequests++;
		
		// Store recent metrics
		this.recentMetrics.push(fullMetrics);
		if (this.recentMetrics.length > 100) {
			this.recentMetrics.shift();
		}
		
		// Update query patterns
		this.updateQueryPattern(metrics.query, metrics.duration, metrics.errorCount === 0);
		
		// Send to Analytics Engine
		if (this.config.enableAnalyticsEngine && this.analyticsEngine) {
			this.sendMetricsToAnalytics(fullMetrics);
		}
		
		this.logger.debug('Search metrics recorded', fullMetrics);
	}

	/**
	 * Get current performance metrics
	 */
	getPerformanceMetrics(): PerformanceMetrics {
		const now = Date.now();
		const avgResponseTime = this.responseTimes.length > 0 
			? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length 
			: 0;
		
		const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
		const p95Index = Math.floor(sortedTimes.length * 0.95);
		const p95ResponseTime = sortedTimes.length > 0 ? sortedTimes[p95Index] || 0 : 0;
		
		return {
			memoryUsage: this.getMemoryUsage(),
			requestCount: this.requestCount,
			errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
			avgResponseTime,
			p95ResponseTime,
			cacheHitRate: this.cacheRequests > 0 ? this.cacheHits / this.cacheRequests : 0,
			timestamp: now
		};
	}

	/**
	 * Get query pattern analytics
	 */
	getQueryPatterns(): QueryPattern[] {
		return Array.from(this.queryPatterns.values())
			.sort((a, b) => b.frequency - a.frequency);
	}

	/**
	 * Get recent search metrics
	 */
	getRecentMetrics(limit: number = 50): SearchMetrics[] {
		return this.recentMetrics.slice(-limit);
	}

	/**
	 * Get active trace spans
	 */
	getActiveSpans(): TraceSpan[] {
		return Array.from(this.activeSpans.values());
	}

	/**
	 * Export metrics for external monitoring
	 */
	exportMetrics(): {
		performance: PerformanceMetrics;
		queryPatterns: QueryPattern[];
		recentSearches: SearchMetrics[];
		activeSpans: number;
	} {
		return {
			performance: this.getPerformanceMetrics(),
			queryPatterns: this.getQueryPatterns(),
			recentSearches: this.getRecentMetrics(),
			activeSpans: this.activeSpans.size
		};
	}

	/**
	 * Reset all metrics (useful for testing)
	 */
	reset(): void {
		this.requestCount = 0;
		this.errorCount = 0;
		this.responseTimes = [];
		this.cacheHits = 0;
		this.cacheRequests = 0;
		this.recentMetrics.length = 0;
		this.performanceBuffer.length = 0;
		this.queryPatterns.clear();
		this.activeSpans.clear();
	}

	/**
	 * Start periodic metrics collection
	 */
	private startMetricsCollection(): void {
		setInterval(() => {
			const metrics = this.getPerformanceMetrics();
			this.performanceBuffer.push(metrics);
			
			// Keep only recent performance metrics
			if (this.performanceBuffer.length > 100) {
				this.performanceBuffer.shift();
			}
			
			this.logger.info('Performance metrics collected', metrics);
			
			// Send to Analytics Engine
			if (this.config.enableAnalyticsEngine && this.analyticsEngine) {
				this.sendPerformanceToAnalytics(metrics);
			}
		}, this.config.metricsInterval);
	}

	/**
	 * Update query pattern analytics
	 */
	private updateQueryPattern(query: string, responseTime: number, success: boolean): void {
		const normalizedQuery = this.normalizeQuery(query);
		const pattern = this.queryPatterns.get(normalizedQuery);
		
		if (pattern) {
			pattern.frequency++;
			pattern.avgResponseTime = (pattern.avgResponseTime + responseTime) / 2;
			pattern.successRate = (pattern.successRate + (success ? 1 : 0)) / 2;
			pattern.lastSeen = Date.now();
		} else {
			this.queryPatterns.set(normalizedQuery, {
				pattern: normalizedQuery,
				frequency: 1,
				avgResponseTime: responseTime,
				successRate: success ? 1 : 0,
				lastSeen: Date.now(),
				categories: this.extractCategories(query)
			});
		}
		
		// Clean up old patterns
		if (this.queryPatterns.size > this.config.maxQueryPatterns) {
			this.cleanupOldPatterns();
		}
	}

	/**
	 * Normalize query for pattern matching
	 */
	private normalizeQuery(query: string): string {
		return query.toLowerCase().trim().replace(/\s+/g, ' ');
	}

	/**
	 * Extract categories from query
	 */
	private extractCategories(query: string): string[] {
		const commonCategories = [
			'business', 'design', 'device', 'editor', 'finance', 'health',
			'logos', 'map', 'media', 'system', 'user', 'weather'
		];
		
		const lowerQuery = query.toLowerCase();
		return commonCategories.filter(category => lowerQuery.includes(category));
	}

	/**
	 * Get memory usage (simplified for Workers environment)
	 */
	private getMemoryUsage(): number {
		// In Cloudflare Workers, memory info is limited
		// Return estimated usage based on data structures
		const spanMemory = this.activeSpans.size * 500; // ~500 bytes per span
		const metricsMemory = this.recentMetrics.length * 200; // ~200 bytes per metric
		const patternsMemory = this.queryPatterns.size * 300; // ~300 bytes per pattern
		
		return spanMemory + metricsMemory + patternsMemory;
	}

	/**
	 * Generate trace ID
	 */
	private generateTraceId(): string {
		return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Generate span ID
	 */
	private generateSpanId(): string {
		return `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Get trace ID from span
	 */
	private getTraceId(spanId: string): string {
		const span = this.activeSpans.get(spanId);
		return span?.traceId || this.generateTraceId();
	}

	/**
	 * Clean up old spans
	 */
	private cleanupOldSpans(): void {
		const cutoff = Date.now() - 300000; // 5 minutes
		for (const [spanId, span] of this.activeSpans.entries()) {
			if (span.startTime < cutoff) {
				this.activeSpans.delete(spanId);
			}
		}
	}

	/**
	 * Clean up old query patterns
	 */
	private cleanupOldPatterns(): void {
		const cutoff = Date.now() - 86400000; // 24 hours
		for (const [pattern, data] of this.queryPatterns.entries()) {
			if (data.lastSeen < cutoff) {
				this.queryPatterns.delete(pattern);
			}
		}
	}

	/**
	 * Send span to Analytics Engine
	 */
	private async sendSpanToAnalytics(span: TraceSpan): Promise<void> {
		try {
			await this.analyticsEngine.writeDataPoint({
				blobs: [span.operationName, span.traceId, span.status],
				doubles: [span.duration || 0],
				indexes: [span.spanId]
			});
		} catch (error) {
			this.logger.warn('Failed to send span to Analytics Engine', { error });
		}
	}

	/**
	 * Send metrics to Analytics Engine
	 */
	private async sendMetricsToAnalytics(metrics: SearchMetrics): Promise<void> {
		try {
			await this.analyticsEngine.writeDataPoint({
				blobs: [metrics.operation, metrics.query, metrics.stage || ''],
				doubles: [metrics.duration, metrics.resultCount],
				indexes: [metrics.cacheHit ? 1 : 0]
			});
		} catch (error) {
			this.logger.warn('Failed to send metrics to Analytics Engine', { error });
		}
	}

	/**
	 * Send performance metrics to Analytics Engine
	 */
	private async sendPerformanceToAnalytics(metrics: PerformanceMetrics): Promise<void> {
		try {
			await this.analyticsEngine.writeDataPoint({
				blobs: ['performance'],
				doubles: [
					metrics.memoryUsage,
					metrics.requestCount,
					metrics.errorRate,
					metrics.avgResponseTime,
					metrics.p95ResponseTime,
					metrics.cacheHitRate
				],
				indexes: [Math.floor(metrics.timestamp / 1000)] // Unix timestamp
			});
		} catch (error) {
			this.logger.warn('Failed to send performance metrics to Analytics Engine', { error });
		}
	}
}
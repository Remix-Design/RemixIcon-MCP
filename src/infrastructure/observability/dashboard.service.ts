import { ILogger } from '../logging/logger';
import { TelemetryService, SearchMetrics, PerformanceMetrics, QueryPattern } from './telemetry.service';

/**
 * Dashboard widget data
 */
export interface DashboardWidget {
	id: string;
	title: string;
	type: 'metric' | 'chart' | 'table' | 'heatmap';
	data: any;
	lastUpdated: number;
}

/**
 * Real-time dashboard metrics
 */
export interface DashboardMetrics {
	overview: {
		totalRequests: number;
		successRate: number;
		avgResponseTime: number;
		cacheHitRate: number;
		errorRate: number;
		activeSpans: number;
	};
	performance: {
		memoryUsage: number;
		p95ResponseTime: number;
		requestsPerMinute: number;
		errorsPerMinute: number;
	};
	topQueries: QueryPattern[];
	recentSearches: SearchMetrics[];
	searchTrends: Array<{
		timestamp: number;
		requests: number;
		avgResponseTime: number;
		errorRate: number;
	}>;
	categoryDistribution: Array<{
		category: string;
		count: number;
		avgScore: number;
	}>;
}

/**
 * Alert configuration
 */
interface AlertRule {
	id: string;
	name: string;
	metric: string;
	threshold: number;
	comparison: 'gt' | 'lt' | 'eq';
	enabled: boolean;
	cooldown: number; // minutes
	lastTriggered?: number;
}

/**
 * Alert notification
 */
export interface Alert {
	id: string;
	rule: AlertRule;
	message: string;
	severity: 'low' | 'medium' | 'high' | 'critical';
	timestamp: number;
	value: number;
	acknowledged: boolean;
}

/**
 * Real-time dashboard service for monitoring and visualization
 * Provides comprehensive metrics and alerting capabilities
 */
export class DashboardService {
	private readonly widgets = new Map<string, DashboardWidget>();
	private readonly alertRules = new Map<string, AlertRule>();
	private readonly activeAlerts = new Map<string, Alert>();
	private readonly searchTrends: Array<{timestamp: number; requests: number; avgResponseTime: number; errorRate: number}> = [];
	private readonly categoryStats = new Map<string, {count: number; totalScore: number}>();
	
	private updateInterval: number;
	private lastMetricsUpdate = 0;
	
	constructor(
		private readonly telemetryService: TelemetryService,
		private readonly logger: ILogger,
		private readonly updateIntervalMs: number = 30000 // 30 seconds
	) {
		this.updateInterval = updateIntervalMs;
		this.initializeDefaultAlerts();
		this.startRealTimeUpdates();
	}

	/**
	 * Get complete dashboard metrics
	 */
	getDashboardMetrics(): DashboardMetrics {
		const performance = this.telemetryService.getPerformanceMetrics();
		const queryPatterns = this.telemetryService.getQueryPatterns();
		const recentSearches = this.telemetryService.getRecentMetrics(20);
		const activeSpans = this.telemetryService.getActiveSpans().length;
		
		// Calculate derived metrics
		const currentMinute = Math.floor(Date.now() / 60000);
		const recentMinuteSearches = recentSearches.filter(
			search => Math.floor(search.timestamp / 60000) === currentMinute
		);
		
		const requestsPerMinute = recentMinuteSearches.length;
		const errorsPerMinute = recentMinuteSearches.filter(s => s.errorCount && s.errorCount > 0).length;
		
		return {
			overview: {
				totalRequests: performance.requestCount,
				successRate: 1 - performance.errorRate,
				avgResponseTime: performance.avgResponseTime,
				cacheHitRate: performance.cacheHitRate,
				errorRate: performance.errorRate,
				activeSpans
			},
			performance: {
				memoryUsage: performance.memoryUsage,
				p95ResponseTime: performance.p95ResponseTime,
				requestsPerMinute,
				errorsPerMinute
			},
			topQueries: queryPatterns.slice(0, 10),
			recentSearches,
			searchTrends: this.getSearchTrends(),
			categoryDistribution: this.getCategoryDistribution(recentSearches)
		};
	}

	/**
	 * Get specific dashboard widget
	 */
	getWidget(widgetId: string): DashboardWidget | null {
		return this.widgets.get(widgetId) || null;
	}

	/**
	 * Get all dashboard widgets
	 */
	getAllWidgets(): DashboardWidget[] {
		return Array.from(this.widgets.values());
	}

	/**
	 * Create or update a dashboard widget
	 */
	updateWidget(widget: DashboardWidget): void {
		widget.lastUpdated = Date.now();
		this.widgets.set(widget.id, widget);
		
		this.logger.debug('Dashboard widget updated', {
			widgetId: widget.id,
			type: widget.type,
			title: widget.title
		});
	}

	/**
	 * Add alert rule
	 */
	addAlertRule(rule: AlertRule): void {
		this.alertRules.set(rule.id, rule);
		this.logger.info('Alert rule added', {
			ruleId: rule.id,
			name: rule.name,
			metric: rule.metric,
			threshold: rule.threshold
		});
	}

	/**
	 * Remove alert rule
	 */
	removeAlertRule(ruleId: string): void {
		this.alertRules.delete(ruleId);
		// Remove any active alerts for this rule
		for (const [alertId, alert] of this.activeAlerts.entries()) {
			if (alert.rule.id === ruleId) {
				this.activeAlerts.delete(alertId);
			}
		}
	}

	/**
	 * Get all active alerts
	 */
	getActiveAlerts(): Alert[] {
		return Array.from(this.activeAlerts.values())
			.sort((a, b) => b.timestamp - a.timestamp);
	}

	/**
	 * Acknowledge an alert
	 */
	acknowledgeAlert(alertId: string): void {
		const alert = this.activeAlerts.get(alertId);
		if (alert) {
			alert.acknowledged = true;
			this.logger.info('Alert acknowledged', { alertId, rule: alert.rule.name });
		}
	}

	/**
	 * Get search performance heatmap data
	 */
	getPerformanceHeatmap(): Array<{hour: number; day: number; avgResponseTime: number; requestCount: number}> {
		const recentSearches = this.telemetryService.getRecentMetrics(1000);
		const heatmapData = new Map<string, {totalTime: number; count: number}>();
		
		for (const search of recentSearches) {
			const date = new Date(search.timestamp);
			const key = `${date.getDay()}_${date.getHours()}`;
			
			const existing = heatmapData.get(key) || {totalTime: 0, count: 0};
			existing.totalTime += search.duration;
			existing.count += 1;
			heatmapData.set(key, existing);
		}
		
		const result = [];
		for (const [key, data] of heatmapData.entries()) {
			const [day, hour] = key.split('_').map(Number);
			result.push({
				hour,
				day,
				avgResponseTime: data.totalTime / data.count,
				requestCount: data.count
			});
		}
		
		return result;
	}

	/**
	 * Export dashboard configuration
	 */
	exportConfiguration(): {
		widgets: DashboardWidget[];
		alertRules: AlertRule[];
		settings: {
			updateInterval: number;
		};
	} {
		return {
			widgets: this.getAllWidgets(),
			alertRules: Array.from(this.alertRules.values()),
			settings: {
				updateInterval: this.updateInterval
			}
		};
	}

	/**
	 * Import dashboard configuration
	 */
	importConfiguration(config: {
		widgets?: DashboardWidget[];
		alertRules?: AlertRule[];
		settings?: {updateInterval?: number};
	}): void {
		if (config.widgets) {
			for (const widget of config.widgets) {
				this.updateWidget(widget);
			}
		}
		
		if (config.alertRules) {
			for (const rule of config.alertRules) {
				this.addAlertRule(rule);
			}
		}
		
		if (config.settings?.updateInterval) {
			this.updateInterval = config.settings.updateInterval;
		}
		
		this.logger.info('Dashboard configuration imported', {
			widgets: config.widgets?.length || 0,
			alertRules: config.alertRules?.length || 0
		});
	}

	/**
	 * Initialize default alert rules
	 */
	private initializeDefaultAlerts(): void {
		const defaultRules: AlertRule[] = [
			{
				id: 'high_error_rate',
				name: 'High Error Rate',
				metric: 'errorRate',
				threshold: 0.05, // 5%
				comparison: 'gt',
				enabled: true,
				cooldown: 10
			},
			{
				id: 'slow_response_time',
				name: 'Slow Response Time',
				metric: 'p95ResponseTime',
				threshold: 1000, // 1 second
				comparison: 'gt',
				enabled: true,
				cooldown: 5
			},
			{
				id: 'low_cache_hit_rate',
				name: 'Low Cache Hit Rate',
				metric: 'cacheHitRate',
				threshold: 0.7, // 70%
				comparison: 'lt',
				enabled: true,
				cooldown: 15
			},
			{
				id: 'high_memory_usage',
				name: 'High Memory Usage',
				metric: 'memoryUsage',
				threshold: 50000000, // 50MB
				comparison: 'gt',
				enabled: true,
				cooldown: 20
			}
		];
		
		for (const rule of defaultRules) {
			this.addAlertRule(rule);
		}
	}

	/**
	 * Start real-time dashboard updates
	 */
	private startRealTimeUpdates(): void {
		setInterval(() => {
			this.updateDashboardWidgets();
			this.checkAlertRules();
			this.updateSearchTrends();
		}, this.updateInterval);
	}

	/**
	 * Update all dashboard widgets
	 */
	private updateDashboardWidgets(): void {
		const metrics = this.getDashboardMetrics();
		
		// Overview widget
		this.updateWidget({
			id: 'overview',
			title: 'System Overview',
			type: 'metric',
			data: metrics.overview,
			lastUpdated: Date.now()
		});
		
		// Performance widget
		this.updateWidget({
			id: 'performance',
			title: 'Performance Metrics',
			type: 'chart',
			data: {
				current: metrics.performance,
				trends: this.searchTrends.slice(-20)
			},
			lastUpdated: Date.now()
		});
		
		// Top queries widget
		this.updateWidget({
			id: 'top_queries',
			title: 'Popular Queries',
			type: 'table',
			data: metrics.topQueries,
			lastUpdated: Date.now()
		});
		
		// Category distribution widget
		this.updateWidget({
			id: 'category_distribution',
			title: 'Search Categories',
			type: 'chart',
			data: metrics.categoryDistribution,
			lastUpdated: Date.now()
		});
		
		// Performance heatmap widget
		this.updateWidget({
			id: 'performance_heatmap',
			title: 'Response Time Heatmap',
			type: 'heatmap',
			data: this.getPerformanceHeatmap(),
			lastUpdated: Date.now()
		});
	}

	/**
	 * Check alert rules and trigger alerts
	 */
	private checkAlertRules(): void {
		const performance = this.telemetryService.getPerformanceMetrics();
		const now = Date.now();
		
		for (const rule of this.alertRules.values()) {
			if (!rule.enabled) continue;
			
			// Check cooldown
			if (rule.lastTriggered && (now - rule.lastTriggered) < (rule.cooldown * 60000)) {
				continue;
			}
			
			let currentValue: number;
			let shouldTrigger = false;
			
			// Get current metric value
			switch (rule.metric) {
				case 'errorRate':
					currentValue = performance.errorRate;
					break;
				case 'avgResponseTime':
					currentValue = performance.avgResponseTime;
					break;
				case 'p95ResponseTime':
					currentValue = performance.p95ResponseTime;
					break;
				case 'cacheHitRate':
					currentValue = performance.cacheHitRate;
					break;
				case 'memoryUsage':
					currentValue = performance.memoryUsage;
					break;
				default:
					continue;
			}
			
			// Check threshold
			switch (rule.comparison) {
				case 'gt':
					shouldTrigger = currentValue > rule.threshold;
					break;
				case 'lt':
					shouldTrigger = currentValue < rule.threshold;
					break;
				case 'eq':
					shouldTrigger = Math.abs(currentValue - rule.threshold) < 0.001;
					break;
			}
			
			if (shouldTrigger) {
				this.triggerAlert(rule, currentValue);
			}
		}
	}

	/**
	 * Trigger an alert
	 */
	private triggerAlert(rule: AlertRule, value: number): void {
		const alertId = `alert_${rule.id}_${Date.now()}`;
		const severity = this.determineSeverity(rule, value);
		
		const alert: Alert = {
			id: alertId,
			rule,
			message: this.generateAlertMessage(rule, value),
			severity,
			timestamp: Date.now(),
			value,
			acknowledged: false
		};
		
		this.activeAlerts.set(alertId, alert);
		rule.lastTriggered = Date.now();
		
		this.logger.warn('Alert triggered', {
			alertId,
			rule: rule.name,
			severity,
			value,
			threshold: rule.threshold
		});
	}

	/**
	 * Determine alert severity
	 */
	private determineSeverity(rule: AlertRule, value: number): Alert['severity'] {
		const ratio = Math.abs(value - rule.threshold) / rule.threshold;
		
		if (ratio > 0.5) return 'critical';
		if (ratio > 0.3) return 'high';
		if (ratio > 0.1) return 'medium';
		return 'low';
	}

	/**
	 * Generate alert message
	 */
	private generateAlertMessage(rule: AlertRule, value: number): string {
		const comparison = rule.comparison === 'gt' ? 'above' : 
						  rule.comparison === 'lt' ? 'below' : 'equal to';
		
		return `${rule.name}: ${rule.metric} is ${comparison} threshold. ` +
			   `Current: ${value.toFixed(2)}, Threshold: ${rule.threshold}`;
	}

	/**
	 * Update search trends
	 */
	private updateSearchTrends(): void {
		const now = Date.now();
		const currentMinute = Math.floor(now / 60000);
		
		// Only update once per minute
		if (Math.floor(this.lastMetricsUpdate / 60000) === currentMinute) {
			return;
		}
		
		const performance = this.telemetryService.getPerformanceMetrics();
		const recentSearches = this.telemetryService.getRecentMetrics(100);
		
		const currentMinuteSearches = recentSearches.filter(
			search => Math.floor(search.timestamp / 60000) === currentMinute
		);
		
		const requests = currentMinuteSearches.length;
		const errors = currentMinuteSearches.filter(s => s.errorCount && s.errorCount > 0).length;
		const avgResponseTime = requests > 0 
			? currentMinuteSearches.reduce((sum, search) => sum + search.duration, 0) / requests
			: performance.avgResponseTime;
		
		this.searchTrends.push({
			timestamp: currentMinute * 60000,
			requests,
			avgResponseTime,
			errorRate: requests > 0 ? errors / requests : 0
		});
		
		// Keep only last hour of trends
		if (this.searchTrends.length > 60) {
			this.searchTrends.shift();
		}
		
		this.lastMetricsUpdate = now;
	}

	/**
	 * Get search trends
	 */
	private getSearchTrends(): Array<{timestamp: number; requests: number; avgResponseTime: number; errorRate: number}> {
		return [...this.searchTrends];
	}

	/**
	 * Get category distribution
	 */
	private getCategoryDistribution(searches: SearchMetrics[]): Array<{category: string; count: number; avgScore: number}> {
		const categoryMap = new Map<string, {count: number; totalScore: number}>();
		
		// Note: We don't have category info in SearchMetrics, so this is a simplified version
		// In a real implementation, we'd extract category from the search results
		
		return Array.from(categoryMap.entries()).map(([category, stats]) => ({
			category,
			count: stats.count,
			avgScore: stats.count > 0 ? stats.totalScore / stats.count : 0
		}));
	}
}
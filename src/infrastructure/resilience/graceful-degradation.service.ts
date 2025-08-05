import { ILogger } from '../logging/logger';
import { TelemetryService } from '../observability/telemetry.service';

/**
 * Service degradation levels
 */
export enum DegradationLevel {
	NORMAL = 'normal',           // Full functionality
	PARTIAL = 'partial',         // Some features disabled
	MINIMAL = 'minimal',         // Basic functionality only
	EMERGENCY = 'emergency'      // Emergency mode, minimal operations
}

/**
 * Feature degradation strategy
 */
export interface FeatureDegradationStrategy {
	featureName: string;
	degradationLevels: {
		[key in DegradationLevel]?: {
			enabled: boolean;
			fallbackBehavior?: string;
			timeoutMs?: number;
			maxRetries?: number;
			cacheOnly?: boolean;
			simplified?: boolean;
		};
	};
	priority: number; // Higher priority features are kept longer
	dependencies: string[]; // Features this depends on
}

/**
 * System health metrics for degradation decisions
 */
export interface SystemHealthMetrics {
	cpuUsage: number;        // 0-1
	memoryUsage: number;     // 0-1
	responseTime: number;    // milliseconds
	errorRate: number;       // 0-1
	activeConnections: number;
	queueSize: number;
	timestamp: number;
}

/**
 * Degradation trigger conditions
 */
export interface DegradationTriggers {
	cpuThreshold: number;           // CPU usage threshold (0-1)
	memoryThreshold: number;        // Memory usage threshold (0-1)
	responseTimeThreshold: number;  // Response time threshold (ms)
	errorRateThreshold: number;     // Error rate threshold (0-1)
	connectionThreshold: number;    // Max active connections
	queueSizeThreshold: number;     // Max queue size
}

/**
 * Degradation context for decision making
 */
export interface DegradationContext {
	systemHealth: SystemHealthMetrics;
	currentLevel: DegradationLevel;
	activeFeatures: Set<string>;
	recentDegradations: Array<{
		timestamp: number;
		from: DegradationLevel;
		to: DegradationLevel;
		reason: string;
		triggeredBy: string[];
	}>;
}

/**
 * Graceful degradation service for managing system resilience
 */
export class GracefulDegradationService {
	private currentLevel: DegradationLevel = DegradationLevel.NORMAL;
	private strategies: Map<string, FeatureDegradationStrategy> = new Map();
	private healthHistory: SystemHealthMetrics[] = [];
	private degradationHistory: Array<{
		timestamp: number;
		from: DegradationLevel;
		to: DegradationLevel;
		reason: string;
		triggeredBy: string[];
	}> = [];
	private monitoringInterval?: number;

	constructor(
		private readonly triggers: DegradationTriggers,
		private readonly logger: ILogger,
		private readonly telemetryService?: TelemetryService,
		private readonly monitoringIntervalMs: number = 30000
	) {
		this.logger.info('Graceful degradation service initialized', { triggers });
		this.startHealthMonitoring();
	}

	/**
	 * Register a feature degradation strategy
	 */
	registerFeature(strategy: FeatureDegradationStrategy): void {
		this.strategies.set(strategy.featureName, strategy);
		this.logger.debug('Feature degradation strategy registered', {
			feature: strategy.featureName,
			priority: strategy.priority,
			levels: Object.keys(strategy.degradationLevels)
		});
	}

	/**
	 * Update system health metrics
	 */
	updateSystemHealth(metrics: SystemHealthMetrics): void {
		// Add to health history
		this.healthHistory.push(metrics);
		
		// Keep only recent history (last 100 entries)
		if (this.healthHistory.length > 100) {
			this.healthHistory = this.healthHistory.slice(-100);
		}

		// Check if degradation is needed
		this.evaluateDegradation(metrics);

		// Record telemetry
		if (this.telemetryService) {
			this.telemetryService.recordMetric('system.health', metrics);
		}
	}

	/**
	 * Evaluate if system degradation is needed
	 */
	private evaluateDegradation(metrics: SystemHealthMetrics): void {
		const violations: string[] = [];
		const newLevel = this.determineDegradationLevel(metrics, violations);

		if (newLevel !== this.currentLevel) {
			this.changeDegradationLevel(newLevel, violations.join(', '));
		}
	}

	/**
	 * Determine appropriate degradation level based on metrics
	 */
	private determineDegradationLevel(
		metrics: SystemHealthMetrics,
		violations: string[]
	): DegradationLevel {
		// Check emergency conditions (multiple severe violations)
		let severeViolations = 0;

		if (metrics.cpuUsage > this.triggers.cpuThreshold * 1.5) {
			violations.push(`CPU usage critical: ${(metrics.cpuUsage * 100).toFixed(1)}%`);
			severeViolations++;
		}

		if (metrics.memoryUsage > this.triggers.memoryThreshold * 1.5) {
			violations.push(`Memory usage critical: ${(metrics.memoryUsage * 100).toFixed(1)}%`);
			severeViolations++;
		}

		if (metrics.errorRate > this.triggers.errorRateThreshold * 2) {
			violations.push(`Error rate critical: ${(metrics.errorRate * 100).toFixed(1)}%`);
			severeViolations++;
		}

		if (severeViolations >= 2) {
			return DegradationLevel.EMERGENCY;
		}

		// Check minimal conditions (single severe or multiple moderate violations)
		let moderateViolations = 0;

		if (metrics.cpuUsage > this.triggers.cpuThreshold) {
			if (severeViolations === 0) violations.push(`CPU usage high: ${(metrics.cpuUsage * 100).toFixed(1)}%`);
			moderateViolations++;
		}

		if (metrics.memoryUsage > this.triggers.memoryThreshold) {
			if (severeViolations === 0) violations.push(`Memory usage high: ${(metrics.memoryUsage * 100).toFixed(1)}%`);
			moderateViolations++;
		}

		if (metrics.responseTime > this.triggers.responseTimeThreshold) {
			violations.push(`Response time high: ${metrics.responseTime}ms`);
			moderateViolations++;
		}

		if (metrics.errorRate > this.triggers.errorRateThreshold) {
			if (severeViolations === 0) violations.push(`Error rate high: ${(metrics.errorRate * 100).toFixed(1)}%`);
			moderateViolations++;
		}

		if (metrics.activeConnections > this.triggers.connectionThreshold) {
			violations.push(`Active connections high: ${metrics.activeConnections}`);
			moderateViolations++;
		}

		if (metrics.queueSize > this.triggers.queueSizeThreshold) {
			violations.push(`Queue size high: ${metrics.queueSize}`);
			moderateViolations++;
		}

		if (severeViolations >= 1 || moderateViolations >= 3) {
			return DegradationLevel.MINIMAL;
		}

		if (moderateViolations >= 2) {
			return DegradationLevel.PARTIAL;
		}

		// Check if we can recover from current degradation
		if (this.currentLevel !== DegradationLevel.NORMAL) {
			if (this.canRecover(metrics)) {
				const targetLevel = this.getRecoveryLevel();
				if (targetLevel !== this.currentLevel) {
					violations.push('System health improved, recovering');
					return targetLevel;
				}
			}
		}

		return this.currentLevel;
	}

	/**
	 * Check if system can recover from current degradation
	 */
	private canRecover(metrics: SystemHealthMetrics): boolean {
		// Require sustained good health before recovering
		const recentMetrics = this.healthHistory.slice(-5); // Last 5 measurements
		
		if (recentMetrics.length < 3) return false; // Need some history

		return recentMetrics.every(m => 
			m.cpuUsage < this.triggers.cpuThreshold * 0.8 &&
			m.memoryUsage < this.triggers.memoryThreshold * 0.8 &&
			m.responseTime < this.triggers.responseTimeThreshold * 0.8 &&
			m.errorRate < this.triggers.errorRateThreshold * 0.5 &&
			m.activeConnections < this.triggers.connectionThreshold * 0.8 &&
			m.queueSize < this.triggers.queueSizeThreshold * 0.8
		);
	}

	/**
	 * Get target level for recovery
	 */
	private getRecoveryLevel(): DegradationLevel {
		switch (this.currentLevel) {
			case DegradationLevel.EMERGENCY:
				return DegradationLevel.MINIMAL;
			case DegradationLevel.MINIMAL:
				return DegradationLevel.PARTIAL;
			case DegradationLevel.PARTIAL:
				return DegradationLevel.NORMAL;
			default:
				return DegradationLevel.NORMAL;
		}
	}

	/**
	 * Change degradation level
	 */
	private changeDegradationLevel(newLevel: DegradationLevel, reason: string): void {
		const oldLevel = this.currentLevel;
		this.currentLevel = newLevel;

		// Record degradation event
		const degradationEvent = {
			timestamp: Date.now(),
			from: oldLevel,
			to: newLevel,
			reason,
			triggeredBy: reason.split(', ')
		};

		this.degradationHistory.push(degradationEvent);

		// Keep only recent history
		if (this.degradationHistory.length > 50) {
			this.degradationHistory = this.degradationHistory.slice(-50);
		}

		this.logger.info('System degradation level changed', {
			from: oldLevel,
			to: newLevel,
			reason,
			activeFeatures: this.getActiveFeatures()
		});

		// Record telemetry
		if (this.telemetryService) {
			this.telemetryService.recordEvent('degradation.level_changed', {
				from: oldLevel,
				to: newLevel,
				reason,
				activeFeatures: this.getActiveFeatures().length
			});
		}
	}

	/**
	 * Check if a feature is enabled at current degradation level
	 */
	isFeatureEnabled(featureName: string): boolean {
		const strategy = this.strategies.get(featureName);
		if (!strategy) {
			// If no strategy defined, assume feature is always enabled
			return true;
		}

		const levelConfig = strategy.degradationLevels[this.currentLevel];
		return levelConfig?.enabled ?? false;
	}

	/**
	 * Get feature configuration for current degradation level
	 */
	getFeatureConfig(featureName: string): any {
		const strategy = this.strategies.get(featureName);
		if (!strategy) return null;

		return strategy.degradationLevels[this.currentLevel] ?? null;
	}

	/**
	 * Get list of currently active features
	 */
	getActiveFeatures(): string[] {
		return Array.from(this.strategies.keys()).filter(feature => 
			this.isFeatureEnabled(feature)
		);
	}

	/**
	 * Get disabled features and their fallback behaviors
	 */
	getDisabledFeatures(): Array<{
		feature: string;
		fallbackBehavior?: string;
		reason: string;
	}> {
		return Array.from(this.strategies.entries())
			.filter(([feature]) => !this.isFeatureEnabled(feature))
			.map(([feature, strategy]) => ({
				feature,
				fallbackBehavior: strategy.degradationLevels[this.currentLevel]?.fallbackBehavior,
				reason: `Disabled due to ${this.currentLevel} degradation level`
			}));
	}

	/**
	 * Execute function with degradation-aware behavior
	 */
	async executeWithDegradation<T>(
		featureName: string,
		primaryFn: () => Promise<T>,
		fallbackFn?: () => Promise<T>,
		context?: any
	): Promise<T> {
		if (!this.isFeatureEnabled(featureName)) {
			if (fallbackFn) {
				this.logger.debug('Using fallback for disabled feature', { 
					feature: featureName, 
					level: this.currentLevel 
				});
				
				if (this.telemetryService) {
					this.telemetryService.recordEvent('degradation.fallback_used', {
						feature: featureName,
						level: this.currentLevel
					});
				}
				
				return await fallbackFn();
			} else {
				throw new Error(`Feature '${featureName}' is disabled due to system degradation (${this.currentLevel})`);
			}
		}

		// Get feature configuration
		const config = this.getFeatureConfig(featureName);
		
		// Apply timeout if configured
		if (config?.timeoutMs) {
			return await this.executeWithTimeout(primaryFn, config.timeoutMs, featureName);
		}

		return await primaryFn();
	}

	/**
	 * Execute function with timeout
	 */
	private async executeWithTimeout<T>(
		fn: () => Promise<T>,
		timeoutMs: number,
		featureName: string
	): Promise<T> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`Feature '${featureName}' timed out after ${timeoutMs}ms`));
			}, timeoutMs);

			fn()
				.then(result => {
					clearTimeout(timer);
					resolve(result);
				})
				.catch(error => {
					clearTimeout(timer);
					reject(error);
				});
		});
	}

	/**
	 * Start health monitoring
	 */
	private startHealthMonitoring(): void {
		this.monitoringInterval = setInterval(() => {
			// Generate synthetic health metrics if no recent updates
			const lastUpdate = this.healthHistory[this.healthHistory.length - 1];
			const now = Date.now();
			
			if (!lastUpdate || now - lastUpdate.timestamp > this.monitoringIntervalMs * 2) {
				this.logger.warn('No recent health metrics, using defaults');
				
				// Use conservative defaults that won't trigger degradation
				this.updateSystemHealth({
					cpuUsage: 0.3,
					memoryUsage: 0.4,
					responseTime: 100,
					errorRate: 0.01,
					activeConnections: 50,
					queueSize: 10,
					timestamp: now
				});
			}
		}, this.monitoringIntervalMs) as any;
	}

	/**
	 * Stop health monitoring
	 */
	stopMonitoring(): void {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = undefined;
		}
	}

	/**
	 * Get current degradation status
	 */
	getStatus(): {
		level: DegradationLevel;
		activeFeatures: string[];
		disabledFeatures: Array<{ feature: string; fallbackBehavior?: string; reason: string }>;
		recentHealth: SystemHealthMetrics[];
		degradationHistory: typeof this.degradationHistory;
	} {
		return {
			level: this.currentLevel,
			activeFeatures: this.getActiveFeatures(),
			disabledFeatures: this.getDisabledFeatures(),
			recentHealth: this.healthHistory.slice(-10),
			degradationHistory: this.degradationHistory.slice(-10)
		};
	}

	/**
	 * Force degradation level (for testing/admin purposes)
	 */
	forceDegradationLevel(level: DegradationLevel, reason: string = 'Forced by admin'): void {
		this.changeDegradationLevel(level, reason);
	}

	/**
	 * Reset to normal operation
	 */
	reset(): void {
		this.currentLevel = DegradationLevel.NORMAL;
		this.healthHistory = [];
		this.degradationHistory = [];
		
		this.logger.info('Graceful degradation service reset to normal operation');
	}

	/**
	 * Get system resilience metrics
	 */
	getResilienceMetrics(): {
		totalDegradations: number;
		timeInDegradedState: number;
		averageRecoveryTime: number;
		mostCommonTriggers: Array<{ trigger: string; count: number }>;
		currentUptime: number;
	} {
		const now = Date.now();
		const totalDegradations = this.degradationHistory.length;
		
		// Calculate time in degraded state
		let timeInDegradedState = 0;
		let lastNormalTime = now;
		
		for (let i = this.degradationHistory.length - 1; i >= 0; i--) {
			const event = this.degradationHistory[i];
			if (event.to === DegradationLevel.NORMAL) {
				lastNormalTime = event.timestamp;
			} else if (event.from === DegradationLevel.NORMAL) {
				timeInDegradedState += lastNormalTime - event.timestamp;
			}
		}

		// Add current degraded time if applicable
		if (this.currentLevel !== DegradationLevel.NORMAL && this.degradationHistory.length > 0) {
			const lastEvent = this.degradationHistory[this.degradationHistory.length - 1];
			timeInDegradedState += now - lastEvent.timestamp;
		}

		// Calculate average recovery time
		const recoveryEvents = this.degradationHistory.filter(e => e.to === DegradationLevel.NORMAL);
		let totalRecoveryTime = 0;
		
		for (const event of recoveryEvents) {
			const degradationStart = this.degradationHistory
				.reverse()
				.find(e => e.timestamp < event.timestamp && e.from === DegradationLevel.NORMAL);
			
			if (degradationStart) {
				totalRecoveryTime += event.timestamp - degradationStart.timestamp;
			}
		}
		
		const averageRecoveryTime = recoveryEvents.length > 0 ? totalRecoveryTime / recoveryEvents.length : 0;

		// Find most common triggers
		const triggerCounts = new Map<string, number>();
		for (const event of this.degradationHistory) {
			for (const trigger of event.triggeredBy) {
				triggerCounts.set(trigger, (triggerCounts.get(trigger) || 0) + 1);
			}
		}

		const mostCommonTriggers = Array.from(triggerCounts.entries())
			.map(([trigger, count]) => ({ trigger, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 5);

		// Calculate current uptime (time since last degradation or service start)
		const lastDegradation = this.degradationHistory
			.reverse()
			.find(e => e.from === DegradationLevel.NORMAL);
		
		const currentUptime = lastDegradation ? now - lastDegradation.timestamp : now;

		return {
			totalDegradations,
			timeInDegradedState,
			averageRecoveryTime,
			mostCommonTriggers,
			currentUptime
		};
	}
}
import { ILogger } from '../logging/logger';
import { TelemetryService } from '../observability/telemetry.service';
import { CircuitBreakerService, CircuitBreakerResult } from './circuit-breaker.service';

/**
 * Fallback strategy types
 */
export enum FallbackStrategy {
	CACHE_ONLY = 'cache_only',           // Use cached data only
	SIMPLIFIED = 'simplified',           // Return simplified response
	STATIC_RESPONSE = 'static_response', // Return predefined static response
	DEGRADED_SERVICE = 'degraded_service', // Use degraded version of service
	EMPTY_RESPONSE = 'empty_response',   // Return empty but valid response
	ERROR_RESPONSE = 'error_response',   // Return structured error
	REDIRECT = 'redirect'                // Redirect to alternative service
}

/**
 * Fallback configuration
 */
export interface FallbackConfig {
	strategy: FallbackStrategy;
	priority: number;              // Higher priority tried first
	conditions: {
		errorTypes?: string[];     // Error types this fallback handles
		circuitStates?: string[];  // Circuit breaker states
		maxRetries?: number;       // Max retries before using fallback
		timeoutMs?: number;        // Timeout before fallback
	};
	config: {
		cacheKey?: string;         // For cache-only strategy
		staticData?: any;          // For static response strategy
		serviceName?: string;      // For degraded service strategy
		redirectUrl?: string;      // For redirect strategy
		errorMessage?: string;     // For error response strategy
		ttlMs?: number;           // Cache TTL for responses
	};
}

/**
 * Fallback execution context
 */
export interface FallbackContext {
	originalError: Error;
	operationName: string;
	requestData?: any;
	circuitBreakerState?: string;
	retryCount: number;
	startTime: number;
	userId?: string;
	sessionId?: string;
}

/**
 * Fallback execution result
 */
export interface FallbackResult<T> {
	success: boolean;
	data?: T;
	strategy: FallbackStrategy;
	executionTime: number;
	fromCache: boolean;
	error?: Error;
	metadata: {
		originalError: string;
		retryCount: number;
		circuitBreakerState?: string;
	};
}

/**
 * Fallback manager for handling service failures gracefully
 */
export class FallbackManagerService {
	private fallbackStrategies: Map<string, FallbackConfig[]> = new Map();
	private staticResponses: Map<string, any> = new Map();
	private fallbackCache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
	private executionStats: Map<string, {
		totalExecutions: number;
		successfulFallbacks: number;
		fallbacksByStrategy: Map<FallbackStrategy, number>;
		averageExecutionTime: number;
		lastExecutionTime: number;
	}> = new Map();

	constructor(
		private readonly logger: ILogger,
		private readonly telemetryService?: TelemetryService,
		private readonly cacheService?: any,
		private readonly circuitBreakers?: Map<string, CircuitBreakerService>
	) {
		this.logger.info('Fallback manager service initialized');
		
		// Start cache cleanup interval
		setInterval(() => this.cleanupCache(), 60000); // Every minute
	}

	/**
	 * Register fallback strategies for an operation
	 */
	registerFallback(operationName: string, configs: FallbackConfig[]): void {
		// Sort by priority (highest first)
		const sortedConfigs = configs.sort((a, b) => b.priority - a.priority);
		this.fallbackStrategies.set(operationName, sortedConfigs);
		
		this.logger.debug('Fallback strategies registered', {
			operation: operationName,
			strategies: sortedConfigs.map(c => c.strategy),
			count: sortedConfigs.length
		});
	}

	/**
	 * Register static response for fallback
	 */
	registerStaticResponse(key: string, response: any): void {
		this.staticResponses.set(key, response);
		this.logger.debug('Static response registered', { key });
	}

	/**
	 * Execute operation with fallback support
	 */
	async executeWithFallback<T>(
		operationName: string,
		primaryOperation: () => Promise<T>,
		context?: Partial<FallbackContext>
	): Promise<FallbackResult<T>> {
		const startTime = Date.now();
		const fallbackContext: FallbackContext = {
			originalError: new Error('Unknown error'),
			operationName,
			retryCount: 0,
			startTime,
			...context
		};

		// Try primary operation first
		try {
			const result = await primaryOperation();
			
			this.recordStats(operationName, {
				success: true,
				strategy: null,
				executionTime: Date.now() - startTime
			});

			return {
				success: true,
				data: result,
				strategy: FallbackStrategy.STATIC_RESPONSE, // Not really a fallback
				executionTime: Date.now() - startTime,
				fromCache: false,
				metadata: {
					originalError: '',
					retryCount: 0,
					circuitBreakerState: this.getCircuitBreakerState(operationName)
				}
			};

		} catch (error) {
			fallbackContext.originalError = error instanceof Error ? error : new Error('Unknown error');
			
			this.logger.warn('Primary operation failed, attempting fallback', {
				operation: operationName,
				error: fallbackContext.originalError.message
			});

			// Try fallback strategies
			return await this.executeFallbackStrategies(fallbackContext);
		}
	}

	/**
	 * Execute fallback strategies in priority order
	 */
	private async executeFallbackStrategies<T>(context: FallbackContext): Promise<FallbackResult<T>> {
		const strategies = this.fallbackStrategies.get(context.operationName);
		
		if (!strategies || strategies.length === 0) {
			this.logger.error('No fallback strategies configured', {
				operation: context.operationName
			});

			return {
				success: false,
				strategy: FallbackStrategy.ERROR_RESPONSE,
				executionTime: Date.now() - context.startTime,
				fromCache: false,
				error: new Error(`No fallback available for operation: ${context.operationName}`),
				metadata: {
					originalError: context.originalError.message,
					retryCount: context.retryCount,
					circuitBreakerState: this.getCircuitBreakerState(context.operationName)
				}
			};
		}

		// Try each strategy in priority order
		for (const strategy of strategies) {
			if (this.shouldTryStrategy(strategy, context)) {
				try {
					const result = await this.executeStrategy<T>(strategy, context);
					
					if (result.success) {
						this.recordStats(context.operationName, {
							success: true,
							strategy: strategy.strategy,
							executionTime: result.executionTime
						});

						return result;
					}
				} catch (strategyError) {
					this.logger.warn('Fallback strategy failed', {
						operation: context.operationName,
						strategy: strategy.strategy,
						error: strategyError instanceof Error ? strategyError.message : 'Unknown error'
					});
				}
			}
		}

		// All strategies failed
		this.recordStats(context.operationName, {
			success: false,
			strategy: null,
			executionTime: Date.now() - context.startTime
		});

		return {
			success: false,
			strategy: FallbackStrategy.ERROR_RESPONSE,
			executionTime: Date.now() - context.startTime,
			fromCache: false,
			error: new Error(`All fallback strategies failed for operation: ${context.operationName}`),
			metadata: {
				originalError: context.originalError.message,
				retryCount: context.retryCount,
				circuitBreakerState: this.getCircuitBreakerState(context.operationName)
			}
		};
	}

	/**
	 * Check if a strategy should be tried based on conditions
	 */
	private shouldTryStrategy(strategy: FallbackConfig, context: FallbackContext): boolean {
		const conditions = strategy.conditions;

		// Check error types
		if (conditions.errorTypes && conditions.errorTypes.length > 0) {
			const errorType = context.originalError.constructor.name;
			if (!conditions.errorTypes.includes(errorType)) {
				return false;
			}
		}

		// Check circuit breaker states
		if (conditions.circuitStates && conditions.circuitStates.length > 0) {
			const circuitState = this.getCircuitBreakerState(context.operationName);
			if (circuitState && !conditions.circuitStates.includes(circuitState)) {
				return false;
			}
		}

		// Check retry count
		if (conditions.maxRetries !== undefined && context.retryCount > conditions.maxRetries) {
			return false;
		}

		// Check timeout
		if (conditions.timeoutMs !== undefined) {
			const elapsed = Date.now() - context.startTime;
			if (elapsed > conditions.timeoutMs) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Execute a specific fallback strategy
	 */
	private async executeStrategy<T>(strategy: FallbackConfig, context: FallbackContext): Promise<FallbackResult<T>> {
		const strategyStartTime = Date.now();

		this.logger.debug('Executing fallback strategy', {
			operation: context.operationName,
			strategy: strategy.strategy
		});

		switch (strategy.strategy) {
			case FallbackStrategy.CACHE_ONLY:
				return await this.executeCacheOnlyStrategy<T>(strategy, context);

			case FallbackStrategy.SIMPLIFIED:
				return await this.executeSimplifiedStrategy<T>(strategy, context);

			case FallbackStrategy.STATIC_RESPONSE:
				return await this.executeStaticResponseStrategy<T>(strategy, context);

			case FallbackStrategy.DEGRADED_SERVICE:
				return await this.executeDegradedServiceStrategy<T>(strategy, context);

			case FallbackStrategy.EMPTY_RESPONSE:
				return await this.executeEmptyResponseStrategy<T>(strategy, context);

			case FallbackStrategy.ERROR_RESPONSE:
				return await this.executeErrorResponseStrategy<T>(strategy, context);

			case FallbackStrategy.REDIRECT:
				return await this.executeRedirectStrategy<T>(strategy, context);

			default:
				throw new Error(`Unknown fallback strategy: ${strategy.strategy}`);
		}
	}

	/**
	 * Execute cache-only fallback strategy
	 */
	private async executeCacheOnlyStrategy<T>(
		strategy: FallbackConfig,
		context: FallbackContext
	): Promise<FallbackResult<T>> {
		const cacheKey = strategy.config.cacheKey || context.operationName;
		
		// Try fallback cache first
		const fallbackCached = this.fallbackCache.get(cacheKey);
		if (fallbackCached && Date.now() - fallbackCached.timestamp < fallbackCached.ttl) {
			return {
				success: true,
				data: fallbackCached.data,
				strategy: strategy.strategy,
				executionTime: Date.now() - context.startTime,
				fromCache: true,
				metadata: {
					originalError: context.originalError.message,
					retryCount: context.retryCount,
					circuitBreakerState: this.getCircuitBreakerState(context.operationName)
				}
			};
		}

		// Try external cache service
		if (this.cacheService) {
			try {
				const cachedData = await this.cacheService.get(cacheKey);
				if (cachedData) {
					return {
						success: true,
						data: cachedData,
						strategy: strategy.strategy,
						executionTime: Date.now() - context.startTime,
						fromCache: true,
						metadata: {
							originalError: context.originalError.message,
							retryCount: context.retryCount,
							circuitBreakerState: this.getCircuitBreakerState(context.operationName)
						}
					};
				}
			} catch (cacheError) {
				this.logger.warn('Cache service failed during fallback', {
					operation: context.operationName,
					error: cacheError instanceof Error ? cacheError.message : 'Unknown error'
				});
			}
		}

		throw new Error('No cached data available for cache-only fallback');
	}

	/**
	 * Execute simplified fallback strategy
	 */
	private async executeSimplifiedStrategy<T>(
		strategy: FallbackConfig,
		context: FallbackContext
	): Promise<FallbackResult<T>> {
		// Return a simplified version based on operation type
		let simplifiedData: any;

		switch (context.operationName) {
			case 'findIcons':
				simplifiedData = [{
					type: 'text',
					text: 'Service temporarily degraded. Please try basic icon names like "home", "user", "settings".'
				}];
				break;
			
			case 'getIconCategories':
				simplifiedData = [
					{ type: 'text', text: 'System' },
					{ type: 'text', text: 'User & Faces' },
					{ type: 'text', text: 'Business' }
				];
				break;

			default:
				simplifiedData = { message: 'Simplified response due to service degradation' };
		}

		return {
			success: true,
			data: simplifiedData,
			strategy: strategy.strategy,
			executionTime: Date.now() - context.startTime,
			fromCache: false,
			metadata: {
				originalError: context.originalError.message,
				retryCount: context.retryCount,
				circuitBreakerState: this.getCircuitBreakerState(context.operationName)
			}
		};
	}

	/**
	 * Execute static response fallback strategy
	 */
	private async executeStaticResponseStrategy<T>(
		strategy: FallbackConfig,
		context: FallbackContext
	): Promise<FallbackResult<T>> {
		const staticKey = strategy.config.cacheKey || context.operationName;
		const staticData = strategy.config.staticData || this.staticResponses.get(staticKey);

		if (!staticData) {
			throw new Error(`No static response configured for key: ${staticKey}`);
		}

		return {
			success: true,
			data: staticData,
			strategy: strategy.strategy,
			executionTime: Date.now() - context.startTime,
			fromCache: false,
			metadata: {
				originalError: context.originalError.message,
				retryCount: context.retryCount,
				circuitBreakerState: this.getCircuitBreakerState(context.operationName)
			}
		};
	}

	/**
	 * Execute degraded service fallback strategy
	 */
	private async executeDegradedServiceStrategy<T>(
		strategy: FallbackConfig,
		context: FallbackContext
	): Promise<FallbackResult<T>> {
		// This would typically call a degraded version of the service
		// For now, return a degraded response
		const degradedData: any = {
			message: 'Service running in degraded mode',
			operation: context.operationName,
			limitedFeatures: true
		};

		return {
			success: true,
			data: degradedData,
			strategy: strategy.strategy,
			executionTime: Date.now() - context.startTime,
			fromCache: false,
			metadata: {
				originalError: context.originalError.message,
				retryCount: context.retryCount,
				circuitBreakerState: this.getCircuitBreakerState(context.operationName)
			}
		};
	}

	/**
	 * Execute empty response fallback strategy
	 */
	private async executeEmptyResponseStrategy<T>(
		strategy: FallbackConfig,
		context: FallbackContext
	): Promise<FallbackResult<T>> {
		const emptyData: any = context.operationName.includes('get') || context.operationName.includes('find') 
			? [] 
			: {};

		return {
			success: true,
			data: emptyData,
			strategy: strategy.strategy,
			executionTime: Date.now() - context.startTime,
			fromCache: false,
			metadata: {
				originalError: context.originalError.message,
				retryCount: context.retryCount,
				circuitBreakerState: this.getCircuitBreakerState(context.operationName)
			}
		};
	}

	/**
	 * Execute error response fallback strategy
	 */
	private async executeErrorResponseStrategy<T>(
		strategy: FallbackConfig,
		context: FallbackContext
	): Promise<FallbackResult<T>> {
		const errorMessage = strategy.config.errorMessage || 
			`Service temporarily unavailable. Operation: ${context.operationName}`;

		return {
			success: false,
			strategy: strategy.strategy,
			executionTime: Date.now() - context.startTime,
			fromCache: false,
			error: new Error(errorMessage),
			metadata: {
				originalError: context.originalError.message,
				retryCount: context.retryCount,
				circuitBreakerState: this.getCircuitBreakerState(context.operationName)
			}
		};
	}

	/**
	 * Execute redirect fallback strategy
	 */
	private async executeRedirectStrategy<T>(
		strategy: FallbackConfig,
		context: FallbackContext
	): Promise<FallbackResult<T>> {
		const redirectUrl = strategy.config.redirectUrl;
		
		if (!redirectUrl) {
			throw new Error('No redirect URL configured for redirect fallback');
		}

		// This would typically perform the redirect
		// For now, return redirect information
		const redirectData: any = {
			redirect: true,
			url: redirectUrl,
			reason: 'Service temporarily unavailable'
		};

		return {
			success: true,
			data: redirectData,
			strategy: strategy.strategy,
			executionTime: Date.now() - context.startTime,
			fromCache: false,
			metadata: {
				originalError: context.originalError.message,
				retryCount: context.retryCount,
				circuitBreakerState: this.getCircuitBreakerState(context.operationName)
			}
		};
	}

	/**
	 * Get circuit breaker state for an operation
	 */
	private getCircuitBreakerState(operationName: string): string | undefined {
		const circuitBreaker = this.circuitBreakers?.get(operationName);
		return circuitBreaker?.getState();
	}

	/**
	 * Record execution statistics
	 */
	private recordStats(operationName: string, result: {
		success: boolean;
		strategy: FallbackStrategy | null;
		executionTime: number;
	}): void {
		let stats = this.executionStats.get(operationName);
		
		if (!stats) {
			stats = {
				totalExecutions: 0,
				successfulFallbacks: 0,
				fallbacksByStrategy: new Map(),
				averageExecutionTime: 0,
				lastExecutionTime: 0
			};
			this.executionStats.set(operationName, stats);
		}

		stats.totalExecutions++;
		stats.lastExecutionTime = Date.now();
		
		// Update average execution time
		stats.averageExecutionTime = 
			(stats.averageExecutionTime * (stats.totalExecutions - 1) + result.executionTime) / 
			stats.totalExecutions;

		if (result.success && result.strategy) {
			stats.successfulFallbacks++;
			const strategyCount = stats.fallbacksByStrategy.get(result.strategy) || 0;
			stats.fallbacksByStrategy.set(result.strategy, strategyCount + 1);
		}

		// Record telemetry
		if (this.telemetryService) {
			this.telemetryService.recordEvent('fallback.execution', {
				operation: operationName,
				success: result.success,
				strategy: result.strategy,
				executionTime: result.executionTime
			});
		}
	}

	/**
	 * Clean up expired cache entries
	 */
	private cleanupCache(): void {
		const now = Date.now();
		let cleanedCount = 0;

		for (const [key, entry] of this.fallbackCache.entries()) {
			if (now - entry.timestamp > entry.ttl) {
				this.fallbackCache.delete(key);
				cleanedCount++;
			}
		}

		if (cleanedCount > 0) {
			this.logger.debug('Cleaned up expired fallback cache entries', { count: cleanedCount });
		}
	}

	/**
	 * Cache data for fallback use
	 */
	cacheForFallback(key: string, data: any, ttlMs: number = 300000): void { // Default 5 minutes
		this.fallbackCache.set(key, {
			data,
			timestamp: Date.now(),
			ttl: ttlMs
		});
	}

	/**
	 * Get fallback statistics
	 */
	getStatistics(): Map<string, {
		totalExecutions: number;
		successfulFallbacks: number;
		fallbacksByStrategy: Map<FallbackStrategy, number>;
		averageExecutionTime: number;
		lastExecutionTime: number;
		fallbackSuccessRate: number;
	}> {
		const result = new Map();

		for (const [operation, stats] of this.executionStats.entries()) {
			result.set(operation, {
				...stats,
				fallbackSuccessRate: stats.totalExecutions > 0 
					? stats.successfulFallbacks / stats.totalExecutions 
					: 0
			});
		}

		return result;
	}

	/**
	 * Clear all cached data and statistics
	 */
	clear(): void {
		this.fallbackCache.clear();
		this.executionStats.clear();
		this.logger.info('Fallback manager cleared');
	}
}
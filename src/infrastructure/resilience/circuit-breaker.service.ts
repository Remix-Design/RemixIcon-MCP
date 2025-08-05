import { ILogger } from '../logging/logger';
import { TelemetryService } from '../observability/telemetry.service';

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
	CLOSED = 'closed',     // Normal operation
	OPEN = 'open',         // Circuit is open, requests fail fast
	HALF_OPEN = 'half_open' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
	failureThreshold: number;      // Number of failures before opening
	successThreshold: number;      // Number of successes to close from half-open
	timeout: number;               // Time to wait before trying half-open (ms)
	monitoringWindow: number;      // Window for failure rate calculation (ms)
	volumeThreshold: number;       // Minimum requests before considering failure rate
	errorThreshold: number;        // Error rate threshold (0-1)
}

/**
 * Circuit breaker metrics
 */
interface CircuitBreakerMetrics {
	totalRequests: number;
	successfulRequests: number;
	failedRequests: number;
	rejectedRequests: number;
	lastFailureTime: number;
	lastSuccessTime: number;
	consecutiveFailures: number;
	consecutiveSuccesses: number;
	stateTransitions: Array<{
		from: CircuitBreakerState;
		to: CircuitBreakerState;
		timestamp: number;
		reason: string;
	}>;
}

/**
 * Circuit breaker result
 */
export interface CircuitBreakerResult<T> {
	success: boolean;
	data?: T;
	error?: Error;
	fromCache?: boolean;
	fallbackUsed?: boolean;
	circuitState: CircuitBreakerState;
	executionTime: number;
}

/**
 * Fallback function type
 */
export type FallbackFunction<T> = (error: Error, context?: any) => Promise<T>;

/**
 * Circuit breaker implementation for resilient service calls
 */
export class CircuitBreakerService {
	private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
	private metrics: CircuitBreakerMetrics;
	private lastStateChange: number = Date.now();
	private readonly requestWindow: Array<{ timestamp: number; success: boolean }> = [];

	constructor(
		private readonly name: string,
		private readonly config: CircuitBreakerConfig,
		private readonly logger: ILogger,
		private readonly telemetryService?: TelemetryService
	) {
		this.metrics = {
			totalRequests: 0,
			successfulRequests: 0,
			failedRequests: 0,
			rejectedRequests: 0,
			lastFailureTime: 0,
			lastSuccessTime: 0,
			consecutiveFailures: 0,
			consecutiveSuccesses: 0,
			stateTransitions: []
		};

		this.logger.info('Circuit breaker initialized', {
			name: this.name,
			config: this.config
		});
	}

	/**
	 * Execute a function with circuit breaker protection
	 */
	async execute<T>(
		fn: () => Promise<T>,
		fallback?: FallbackFunction<T>,
		context?: any
	): Promise<CircuitBreakerResult<T>> {
		const startTime = Date.now();
		
		// Check if circuit is open
		if (this.state === CircuitBreakerState.OPEN) {
			if (this.shouldAttemptReset()) {
				this.changeState(CircuitBreakerState.HALF_OPEN, 'Timeout expired, attempting reset');
			} else {
				this.metrics.rejectedRequests++;
				this.recordTelemetry('request_rejected', { reason: 'circuit_open' });
				
				// Try fallback if available
				if (fallback) {
					try {
						const fallbackData = await fallback(new Error('Circuit breaker is open'), context);
						return {
							success: true,
							data: fallbackData,
							fallbackUsed: true,
							circuitState: this.state,
							executionTime: Date.now() - startTime
						};
					} catch (fallbackError) {
						return {
							success: false,
							error: fallbackError instanceof Error ? fallbackError : new Error('Fallback failed'),
							fallbackUsed: true,
							circuitState: this.state,
							executionTime: Date.now() - startTime
						};
					}
				}

				return {
					success: false,
					error: new Error(`Circuit breaker '${this.name}' is open`),
					circuitState: this.state,
					executionTime: Date.now() - startTime
				};
			}
		}

		this.metrics.totalRequests++;

		try {
			// Execute the function
			const result = await fn();
			
			// Record success
			this.onSuccess();
			this.recordTelemetry('request_success');

			return {
				success: true,
				data: result,
				circuitState: this.state,
				executionTime: Date.now() - startTime
			};

		} catch (error) {
			// Record failure
			this.onFailure(error instanceof Error ? error : new Error('Unknown error'));
			this.recordTelemetry('request_failure', { error: error.message });

			// Try fallback if available
			if (fallback) {
				try {
					const fallbackData = await fallback(error instanceof Error ? error : new Error('Unknown error'), context);
					return {
						success: true,
						data: fallbackData,
						fallbackUsed: true,
						circuitState: this.state,
						executionTime: Date.now() - startTime
					};
				} catch (fallbackError) {
					return {
						success: false,
						error: fallbackError instanceof Error ? fallbackError : new Error('Fallback failed'),
						fallbackUsed: true,
						circuitState: this.state,
						executionTime: Date.now() - startTime
					};
				}
			}

			return {
				success: false,
				error: error instanceof Error ? error : new Error('Unknown error'),
				circuitState: this.state,
				executionTime: Date.now() - startTime
			};
		}
	}

	/**
	 * Handle successful execution
	 */
	private onSuccess(): void {
		this.metrics.successfulRequests++;
		this.metrics.lastSuccessTime = Date.now();
		this.metrics.consecutiveFailures = 0;
		this.metrics.consecutiveSuccesses++;

		// Add to request window
		this.addToRequestWindow(true);

		// If in half-open state, check if we can close the circuit
		if (this.state === CircuitBreakerState.HALF_OPEN) {
			if (this.metrics.consecutiveSuccesses >= this.config.successThreshold) {
				this.changeState(CircuitBreakerState.CLOSED, 'Success threshold reached');
			}
		}
	}

	/**
	 * Handle failed execution
	 */
	private onFailure(error: Error): void {
		this.metrics.failedRequests++;
		this.metrics.lastFailureTime = Date.now();
		this.metrics.consecutiveFailures++;
		this.metrics.consecutiveSuccesses = 0;

		// Add to request window
		this.addToRequestWindow(false);

		this.logger.warn('Circuit breaker recorded failure', {
			name: this.name,
			error: error.message,
			consecutiveFailures: this.metrics.consecutiveFailures,
			state: this.state
		});

		// Check if we should open the circuit
		if (this.shouldOpenCircuit()) {
			this.changeState(CircuitBreakerState.OPEN, `Failure threshold exceeded: ${this.metrics.consecutiveFailures} consecutive failures`);
		}
	}

	/**
	 * Add request result to monitoring window
	 */
	private addToRequestWindow(success: boolean): void {
		const now = Date.now();
		this.requestWindow.push({ timestamp: now, success });

		// Clean old entries outside monitoring window
		const cutoff = now - this.config.monitoringWindow;
		while (this.requestWindow.length > 0 && this.requestWindow[0].timestamp < cutoff) {
			this.requestWindow.shift();
		}
	}

	/**
	 * Check if circuit should be opened
	 */
	private shouldOpenCircuit(): boolean {
		// Check consecutive failures threshold
		if (this.metrics.consecutiveFailures >= this.config.failureThreshold) {
			return true;
		}

		// Check failure rate within monitoring window
		if (this.requestWindow.length >= this.config.volumeThreshold) {
			const failures = this.requestWindow.filter(req => !req.success).length;
			const failureRate = failures / this.requestWindow.length;
			
			if (failureRate >= this.config.errorThreshold) {
				this.logger.warn('Circuit breaker failure rate threshold exceeded', {
					name: this.name,
					failureRate,
					threshold: this.config.errorThreshold,
					windowSize: this.requestWindow.length
				});
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if circuit should attempt reset from open state
	 */
	private shouldAttemptReset(): boolean {
		const timeSinceLastStateChange = Date.now() - this.lastStateChange;
		return timeSinceLastStateChange >= this.config.timeout;
	}

	/**
	 * Change circuit breaker state
	 */
	private changeState(newState: CircuitBreakerState, reason: string): void {
		const oldState = this.state;
		this.state = newState;
		this.lastStateChange = Date.now();

		// Record state transition
		this.metrics.stateTransitions.push({
			from: oldState,
			to: newState,
			timestamp: this.lastStateChange,
			reason
		});

		// Keep only recent transitions (last 100)
		if (this.metrics.stateTransitions.length > 100) {
			this.metrics.stateTransitions = this.metrics.stateTransitions.slice(-100);
		}

		this.logger.info('Circuit breaker state changed', {
			name: this.name,
			from: oldState,
			to: newState,
			reason
		});

		this.recordTelemetry('state_change', { from: oldState, to: newState, reason });

		// Reset counters on state change
		if (newState === CircuitBreakerState.CLOSED) {
			this.metrics.consecutiveFailures = 0;
			this.metrics.consecutiveSuccesses = 0;
		} else if (newState === CircuitBreakerState.HALF_OPEN) {
			this.metrics.consecutiveSuccesses = 0;
		}
	}

	/**
	 * Record telemetry data
	 */
	private recordTelemetry(event: string, data?: any): void {
		if (this.telemetryService) {
			this.telemetryService.recordEvent(`circuit_breaker.${event}`, {
				circuitBreakerName: this.name,
				state: this.state,
				...data
			});
		}
	}

	/**
	 * Get current circuit breaker state
	 */
	getState(): CircuitBreakerState {
		return this.state;
	}

	/**
	 * Get circuit breaker metrics
	 */
	getMetrics(): CircuitBreakerMetrics & { 
		currentFailureRate: number;
		uptime: number;
		downtime: number;
	} {
		// Calculate current failure rate
		const recentRequests = this.requestWindow.filter(
			req => Date.now() - req.timestamp < this.config.monitoringWindow
		);
		const currentFailureRate = recentRequests.length > 0 
			? recentRequests.filter(req => !req.success).length / recentRequests.length 
			: 0;

		// Calculate uptime/downtime
		const now = Date.now();
		const transitions = this.metrics.stateTransitions;
		let uptime = 0;
		let downtime = 0;

		if (transitions.length > 0) {
			let lastTransition = transitions[0];
			for (let i = 1; i < transitions.length; i++) {
				const duration = transitions[i].timestamp - lastTransition.timestamp;
				if (lastTransition.to === CircuitBreakerState.CLOSED || lastTransition.to === CircuitBreakerState.HALF_OPEN) {
					uptime += duration;
				} else {
					downtime += duration;
				}
				lastTransition = transitions[i];
			}

			// Add current state duration
			const currentDuration = now - lastTransition.timestamp;
			if (this.state === CircuitBreakerState.CLOSED || this.state === CircuitBreakerState.HALF_OPEN) {
				uptime += currentDuration;
			} else {
				downtime += currentDuration;
			}
		} else {
			// No transitions, calculate from creation
			const totalTime = now - (now - this.config.timeout); // Approximate creation time
			if (this.state === CircuitBreakerState.CLOSED) {
				uptime = totalTime;
			}
		}

		return {
			...this.metrics,
			currentFailureRate,
			uptime,
			downtime
		};
	}

	/**
	 * Force circuit breaker state (for testing/admin purposes)
	 */
	forceState(state: CircuitBreakerState, reason: string = 'Forced by admin'): void {
		this.changeState(state, reason);
	}

	/**
	 * Reset circuit breaker metrics
	 */
	reset(): void {
		this.metrics = {
			totalRequests: 0,
			successfulRequests: 0,
			failedRequests: 0,
			rejectedRequests: 0,
			lastFailureTime: 0,
			lastSuccessTime: 0,
			consecutiveFailures: 0,
			consecutiveSuccesses: 0,
			stateTransitions: []
		};
		
		this.requestWindow.length = 0;
		this.changeState(CircuitBreakerState.CLOSED, 'Circuit breaker reset');
		
		this.logger.info('Circuit breaker reset', { name: this.name });
	}

	/**
	 * Get health status
	 */
	getHealthStatus(): {
		healthy: boolean;
		state: CircuitBreakerState;
		failureRate: number;
		consecutiveFailures: number;
		timeSinceLastFailure: number;
	} {
		const now = Date.now();
		const metrics = this.getMetrics();
		
		return {
			healthy: this.state === CircuitBreakerState.CLOSED,
			state: this.state,
			failureRate: metrics.currentFailureRate,
			consecutiveFailures: this.metrics.consecutiveFailures,
			timeSinceLastFailure: this.metrics.lastFailureTime > 0 ? now - this.metrics.lastFailureTime : -1
		};
	}
}
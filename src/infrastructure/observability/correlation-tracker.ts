import { ILogger } from '../logging/logger';

/**
 * Correlation context for tracking requests across services
 */
export interface CorrelationContext {
	correlationId: string;
	parentId?: string;
	traceId: string;
	userId?: string;
	sessionId?: string;
	requestId: string;
	startTime: number;
	metadata: Record<string, any>;
}

/**
 * Request correlation data
 */
export interface CorrelationData {
	correlationId: string;
	operations: Array<{
		operation: string;
		service: string;
		startTime: number;
		endTime?: number;
		duration?: number;
		status: 'pending' | 'success' | 'error';
		metadata: Record<string, any>;
	}>;
	totalDuration?: number;
	status: 'active' | 'completed' | 'failed';
	createdAt: number;
	updatedAt: number;
}

/**
 * Correlation tracker for distributed tracing and request correlation
 * Helps track requests across multiple services and operations
 */
export class CorrelationTracker {
	private readonly activeContexts = new Map<string, CorrelationContext>();
	private readonly correlationData = new Map<string, CorrelationData>();
	private readonly maxActiveContexts = 1000;
	private readonly contextTTL = 300000; // 5 minutes
	
	constructor(private readonly logger: ILogger) {
		// Clean up expired contexts periodically
		setInterval(() => this.cleanupExpiredContexts(), 60000); // Every minute
	}

	/**
	 * Create a new correlation context
	 */
	createContext(options: {
		parentId?: string;
		userId?: string;
		sessionId?: string;
		metadata?: Record<string, any>;
	} = {}): CorrelationContext {
		const correlationId = this.generateCorrelationId();
		const traceId = options.parentId ? this.getTraceId(options.parentId) : this.generateTraceId();
		const requestId = this.generateRequestId();
		
		const context: CorrelationContext = {
			correlationId,
			parentId: options.parentId,
			traceId,
			userId: options.userId,
			sessionId: options.sessionId,
			requestId,
			startTime: Date.now(),
			metadata: options.metadata || {}
		};
		
		this.activeContexts.set(correlationId, context);
		
		// Initialize correlation data
		this.correlationData.set(correlationId, {
			correlationId,
			operations: [],
			status: 'active',
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
		
		// Clean up if we have too many contexts
		if (this.activeContexts.size > this.maxActiveContexts) {
			this.cleanupOldestContexts();
		}
		
		this.logger.debug('Correlation context created', {
			correlationId,
			traceId,
			parentId: options.parentId,
			userId: options.userId
		});
		
		return context;
	}

	/**
	 * Get existing correlation context
	 */
	getContext(correlationId: string): CorrelationContext | null {
		return this.activeContexts.get(correlationId) || null;
	}

	/**
	 * Update correlation context metadata
	 */
	updateContext(correlationId: string, metadata: Record<string, any>): void {
		const context = this.activeContexts.get(correlationId);
		if (context) {
			Object.assign(context.metadata, metadata);
			this.logger.debug('Correlation context updated', {
				correlationId,
				metadata
			});
		}
	}

	/**
	 * Track an operation within a correlation context
	 */
	trackOperation(
		correlationId: string,
		operation: string,
		service: string,
		metadata: Record<string, any> = {}
	): string {
		const operationId = this.generateOperationId();
		const correlationData = this.correlationData.get(correlationId);
		
		if (correlationData) {
			correlationData.operations.push({
				operation,
				service,
				startTime: Date.now(),
				status: 'pending',
				metadata: { ...metadata, operationId }
			});
			correlationData.updatedAt = Date.now();
			
			this.logger.debug('Operation tracked', {
				correlationId,
				operationId,
				operation,
				service
			});
		}
		
		return operationId;
	}

	/**
	 * Complete an operation
	 */
	completeOperation(
		correlationId: string,
		operationId: string,
		status: 'success' | 'error',
		metadata: Record<string, any> = {}
	): void {
		const correlationData = this.correlationData.get(correlationId);
		if (!correlationData) return;
		
		const operation = correlationData.operations.find(
			op => op.metadata.operationId === operationId
		);
		
		if (operation) {
			operation.endTime = Date.now();
			operation.duration = operation.endTime - operation.startTime;
			operation.status = status;
			Object.assign(operation.metadata, metadata);
			
			correlationData.updatedAt = Date.now();
			
			this.logger.debug('Operation completed', {
				correlationId,
				operationId,
				duration: operation.duration,
				status
			});
		}
	}

	/**
	 * Complete a correlation context
	 */
	completeContext(correlationId: string, status: 'completed' | 'failed' = 'completed'): void {
		const context = this.activeContexts.get(correlationId);
		const correlationData = this.correlationData.get(correlationId);
		
		if (context && correlationData) {
			const totalDuration = Date.now() - context.startTime;
			
			correlationData.totalDuration = totalDuration;
			correlationData.status = status;
			correlationData.updatedAt = Date.now();
			
			// Mark any pending operations as completed
			for (const operation of correlationData.operations) {
				if (operation.status === 'pending') {
					operation.endTime = Date.now();
					operation.duration = operation.endTime - operation.startTime;
					operation.status = status === 'completed' ? 'success' : 'error';
				}
			}
			
			this.logger.info('Correlation context completed', {
				correlationId,
				totalDuration,
				status,
				operationCount: correlationData.operations.length
			});
			
			// Keep completed contexts for a while for analysis
			setTimeout(() => {
				this.activeContexts.delete(correlationId);
				this.correlationData.delete(correlationId);
			}, this.contextTTL);
		}
	}

	/**
	 * Get correlation data for analysis
	 */
	getCorrelationData(correlationId: string): CorrelationData | null {
		return this.correlationData.get(correlationId) || null;
	}

	/**
	 * Get all active correlation contexts
	 */
	getActiveContexts(): CorrelationContext[] {
		return Array.from(this.activeContexts.values());
	}

	/**
	 * Get correlation analytics
	 */
	getAnalytics(): {
		activeContexts: number;
		totalContexts: number;
		avgRequestDuration: number;
		operationStats: Array<{
			operation: string;
			service: string;
			count: number;
			avgDuration: number;
			successRate: number;
		}>;
		errorRate: number;
	} {
		const allData = Array.from(this.correlationData.values());
		const completedData = allData.filter(data => data.status !== 'active');
		
		// Calculate average request duration
		const avgRequestDuration = completedData.length > 0
			? completedData.reduce((sum, data) => sum + (data.totalDuration || 0), 0) / completedData.length
			: 0;
		
		// Calculate operation statistics
		const operationMap = new Map<string, {
			count: number;
			totalDuration: number;
			successCount: number;
		}>();
		
		for (const data of allData) {
			for (const operation of data.operations) {
				const key = `${operation.service}:${operation.operation}`;
				const stats = operationMap.get(key) || {
					count: 0,
					totalDuration: 0,
					successCount: 0
				};
				
				stats.count++;
				if (operation.duration) stats.totalDuration += operation.duration;
				if (operation.status === 'success') stats.successCount++;
				
				operationMap.set(key, stats);
			}
		}
		
		const operationStats = Array.from(operationMap.entries()).map(([key, stats]) => {
			const [service, operation] = key.split(':');
			return {
				operation,
				service,
				count: stats.count,
				avgDuration: stats.count > 0 ? stats.totalDuration / stats.count : 0,
				successRate: stats.count > 0 ? stats.successCount / stats.count : 0
			};
		});
		
		// Calculate error rate
		const failedContexts = allData.filter(data => data.status === 'failed').length;
		const errorRate = allData.length > 0 ? failedContexts / allData.length : 0;
		
		return {
			activeContexts: this.activeContexts.size,
			totalContexts: this.correlationData.size,
			avgRequestDuration,
			operationStats,
			errorRate
		};
	}

	/**
	 * Export correlation data for external analysis
	 */
	exportData(since?: number): CorrelationData[] {
		const cutoff = since || 0;
		return Array.from(this.correlationData.values())
			.filter(data => data.createdAt >= cutoff)
			.sort((a, b) => b.createdAt - a.createdAt);
	}

	/**
	 * Clear all correlation data (useful for testing)
	 */
	clear(): void {
		this.activeContexts.clear();
		this.correlationData.clear();
	}

	/**
	 * Generate correlation ID
	 */
	private generateCorrelationId(): string {
		return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Generate trace ID
	 */
	private generateTraceId(): string {
		return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Generate request ID
	 */
	private generateRequestId(): string {
		return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Generate operation ID
	 */
	private generateOperationId(): string {
		return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Get trace ID from parent context
	 */
	private getTraceId(parentId: string): string {
		const parentContext = this.activeContexts.get(parentId);
		return parentContext?.traceId || this.generateTraceId();
	}

	/**
	 * Clean up expired contexts
	 */
	private cleanupExpiredContexts(): void {
		const now = Date.now();
		const expiredIds: string[] = [];
		
		for (const [id, context] of this.activeContexts.entries()) {
			if (now - context.startTime > this.contextTTL) {
				expiredIds.push(id);
			}
		}
		
		for (const id of expiredIds) {
			this.activeContexts.delete(id);
			const correlationData = this.correlationData.get(id);
			if (correlationData && correlationData.status === 'active') {
				correlationData.status = 'failed';
				correlationData.updatedAt = now;
			}
		}
		
		if (expiredIds.length > 0) {
			this.logger.debug('Cleaned up expired correlation contexts', {
				count: expiredIds.length
			});
		}
	}

	/**
	 * Clean up oldest contexts when limit is reached
	 */
	private cleanupOldestContexts(): void {
		const contexts = Array.from(this.activeContexts.entries())
			.sort((a, b) => a[1].startTime - b[1].startTime);
		
		// Remove oldest 10% of contexts
		const toRemove = Math.floor(contexts.length * 0.1);
		for (let i = 0; i < toRemove; i++) {
			const [id] = contexts[i];
			this.activeContexts.delete(id);
			
			const correlationData = this.correlationData.get(id);
			if (correlationData && correlationData.status === 'active') {
				correlationData.status = 'failed';
				correlationData.updatedAt = Date.now();
			}
		}
		
		this.logger.debug('Cleaned up oldest correlation contexts', {
			removed: toRemove
		});
	}
}
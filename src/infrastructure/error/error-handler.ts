import { ILogger } from '../logging/logger';
import { Result } from '../result/result';

/**
 * Error types for better error categorization
 */
export enum ErrorType {
	VALIDATION = 'VALIDATION',
	STORAGE = 'STORAGE', 
	CACHE = 'CACHE',
	SEARCH = 'SEARCH',
	NETWORK = 'NETWORK',
	SYSTEM = 'SYSTEM'
}

/**
 * Structured error information
 */
export interface ErrorInfo {
	type: ErrorType;
	code: string;
	message: string;
	context?: Record<string, unknown>;
	originalError?: Error;
}

/**
 * Unified error handler for consistent error management across services
 */
export class ErrorHandler {
	constructor(private readonly logger: ILogger) {}

	/**
	 * Handle and log an error, returning a Result
	 */
	handleError<T>(
		error: unknown,
		type: ErrorType,
		code: string,
		message: string,
		context?: Record<string, unknown>
	): Result<T> {
		const errorInfo = this.createErrorInfo(error, type, code, message, context);
		this.logError(errorInfo);
		return Result.failure(new Error(errorInfo.message));
	}

	/**
	 * Handle error for async operations that return empty arrays
	 */
	handleAsyncArrayError(
		error: unknown,
		type: ErrorType,
		operation: string,
		context?: Record<string, unknown>
	): never[] {
		const errorInfo = this.createErrorInfo(
			error,
			type,
			`${type}_${operation.toUpperCase()}_FAILED`,
			`Failed to ${operation}`,
			context
		);
		this.logError(errorInfo);
		return [];
	}

	/**
	 * Safely execute an operation with error handling
	 */
	async safeExecute<T>(
		operation: () => Promise<T>,
		type: ErrorType,
		operationName: string,
		context?: Record<string, unknown>
	): Promise<Result<T>> {
		try {
			const result = await operation();
			return Result.success(result);
		} catch (error) {
			return this.handleError(
				error,
				type,
				`${type}_${operationName.toUpperCase()}_FAILED`,
				`Failed to ${operationName}`,
				context
			);
		}
	}

	/**
	 * Validate parameters and return error if invalid
	 */
	validateParams<T>(
		params: T,
		validator: (params: T) => boolean,
		errorMessage: string
	): Result<T> {
		if (!validator(params)) {
			return this.handleError(
				new Error('Validation failed'),
				ErrorType.VALIDATION,
				'INVALID_PARAMS',
				errorMessage,
				{ params }
			);
		}
		return Result.success(params);
	}

	/**
	 * Create structured error information
	 */
	private createErrorInfo(
		error: unknown,
		type: ErrorType,
		code: string,
		message: string,
		context?: Record<string, unknown>
	): ErrorInfo {
		return {
			type,
			code,
			message,
			context,
			originalError: error instanceof Error ? error : new Error(String(error))
		};
	}

	/**
	 * Log error with appropriate level based on type
	 */
	private logError(errorInfo: ErrorInfo): void {
		const logContext = {
			type: errorInfo.type,
			code: errorInfo.code,
			context: errorInfo.context,
			error: errorInfo.originalError?.message,
			stack: errorInfo.originalError?.stack
		};

		// Different log levels based on error type
		switch (errorInfo.type) {
			case ErrorType.VALIDATION:
				this.logger.warn(errorInfo.message, logContext);
				break;
			case ErrorType.CACHE:
				this.logger.debug(errorInfo.message, logContext);
				break;
			case ErrorType.STORAGE:
			case ErrorType.SEARCH:
			case ErrorType.NETWORK:
			case ErrorType.SYSTEM:
			default:
				this.logger.error(errorInfo.message, logContext);
				break;
		}
	}
}
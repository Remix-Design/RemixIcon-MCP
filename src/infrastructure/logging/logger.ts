/**
 * Log level enum
 * Defines the severity levels for logging
 */
export enum LogLevel {
	DEBUG = 'debug',
	INFO = 'info',
	WARN = 'warn',
	ERROR = 'error',
}

/**
 * Logger interface
 * Defines the contract for logger implementations
 */
export interface ILogger {
	/**
	 * Logs a debug message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	debug(message: string, context?: Record<string, any>): void;

	/**
	 * Logs an info message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	info(message: string, context?: Record<string, any>): void;

	/**
	 * Logs a warning message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	warn(message: string, context?: Record<string, any>): void;

	/**
	 * Logs an error message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	error(message: string, context?: Record<string, any>): void;
}

/**
 * Console logger implementation
 * Logs messages to the console
 */
export class ConsoleLogger implements ILogger {
	/**
	 * Current log level
	 * @private
	 */
	private level: LogLevel;

	/**
	 * Creates a new console logger
	 * @param level - Minimum log level to display
	 */
	constructor(level: LogLevel = LogLevel.INFO) {
		this.level = level;
	}

	/**
	 * Logs a debug message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	debug(message: string, context?: Record<string, any>): void {
		if (this.shouldLog(LogLevel.DEBUG)) {
			console.debug(`[DEBUG] ${message}`, context || '');
		}
	}

	/**
	 * Logs an info message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	info(message: string, context?: Record<string, any>): void {
		if (this.shouldLog(LogLevel.INFO)) {
			console.info(`[INFO] ${message}`, context || '');
		}
	}

	/**
	 * Logs a warning message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	warn(message: string, context?: Record<string, any>): void {
		if (this.shouldLog(LogLevel.WARN)) {
			console.warn(`[WARN] ${message}`, context || '');
		}
	}

	/**
	 * Logs an error message
	 * @param message - Log message
	 * @param context - Optional context data
	 */
	error(message: string, context?: Record<string, any>): void {
		if (this.shouldLog(LogLevel.ERROR)) {
			console.error(`[ERROR] ${message}`, context || '');
		}
	}

	/**
	 * Checks if a message with the given level should be logged
	 * @param messageLevel - Level of the message
	 * @returns True if the message should be logged, false otherwise
	 * @private
	 */
	private shouldLog(messageLevel: LogLevel): boolean {
		const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
		const currentLevelIndex = levels.indexOf(this.level);
		const messageLevelIndex = levels.indexOf(messageLevel);

		return messageLevelIndex >= currentLevelIndex;
	}
}

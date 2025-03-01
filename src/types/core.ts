/**
 * Core type definitions for the application
 */

/**
 * Generic result type for all operations
 * @template T The type of successful result data
 */
export type Result<T> = {
	success: boolean;
	data?: T;
	error?: Error;
};

/**
 * Generic cache entry type for storing values with timestamps
 */
export type CacheEntry = {
	value: number;
	timestamp: number;
};

/**
 * Base configuration interface for all config types
 */
export type BaseConfig = {
	cache: {
		maxSize: number;
		ttl: number; // milliseconds
	};
};

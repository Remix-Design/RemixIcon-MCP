import { ILogger } from '../../../infrastructure/logging/logger';
import { SearchConfig } from '../types/search.types';

/**
 * Cache interface
 * Defines the contract for cache implementations
 */
export interface ICache {
	/**
	 * Gets a value from the cache
	 * @param key - Cache key
	 * @returns Cached value or undefined if not found
	 */
	get(key: string): number | undefined;

	/**
	 * Sets a value in the cache
	 * @param key - Cache key
	 * @param value - Value to cache
	 */
	set(key: string, value: number): void;

	/**
	 * Clears the cache
	 */
	clear(): void;
}

/**
 * In-memory cache implementation
 * Provides caching functionality with TTL support
 */
export class InMemoryCache implements ICache {
	/**
	 * Cache storage
	 * @private
	 */
	private cache: Map<string, { value: number; expiry: number }> = new Map();

	/**
	 * Creates a new in-memory cache
	 * @param config - Search configuration
	 * @param logger - Logger instance
	 */
	constructor(private readonly config: SearchConfig, private readonly logger: ILogger) {}

	/**
	 * Gets a value from the cache
	 * @param key - Cache key
	 * @returns Cached value or undefined if not found or expired
	 */
	get(key: string): number | undefined {
		try {
			const entry = this.cache.get(key);

			if (!entry) {
				return undefined;
			}

			const now = Date.now();

			if (entry.expiry < now) {
				// Entry has expired
				this.cache.delete(key);
				return undefined;
			}

			return entry.value;
		} catch (error) {
			this.logger.error('Cache get error', { error, key });
			return undefined;
		}
	}

	/**
	 * Sets a value in the cache
	 * @param key - Cache key
	 * @param value - Value to cache
	 */
	set(key: string, value: number): void {
		try {
			const ttl = this.config.cacheTTL || 3600000; // Default to 1 hour
			const expiry = Date.now() + ttl;

			this.cache.set(key, { value, expiry });

			// Cleanup expired entries if cache is getting large
			if (this.cache.size > (this.config.cacheMaxSize || 1000)) {
				this.cleanupExpiredEntries();
			}
		} catch (error) {
			this.logger.error('Cache set error', { error, key });
		}
	}

	/**
	 * Clears the cache
	 */
	clear(): void {
		try {
			this.cache.clear();
		} catch (error) {
			this.logger.error('Cache clear error', { error });
		}
	}

	/**
	 * Removes expired entries from the cache
	 * @private
	 */
	private cleanupExpiredEntries(): void {
		try {
			const now = Date.now();

			for (const [key, entry] of this.cache.entries()) {
				if (entry.expiry < now) {
					this.cache.delete(key);
				}
			}
		} catch (error) {
			this.logger.error('Cache cleanup error', { error });
		}
	}
}

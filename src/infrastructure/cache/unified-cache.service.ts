import { ILogger } from '../logging/logger';
import { Result } from '../result/result';
import { ICache as DomainICache } from '../../domain/search/services/cache.service';

/**
 * Configuration for the unified cache service
 */
interface CacheConfig {
	memoryTTL: number;
	cloudflareeTTL: number;
	maxMemorySize: number;
	cacheKeyPrefix: string;
}

/**
 * Default cache configuration
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
	memoryTTL: 300000, // 5 minutes
	cloudflareeTTL: 3600, // 1 hour
	maxMemorySize: 500,
	cacheKeyPrefix: 'mcp-remix-icon:'
};

/**
 * Unified cache service that combines in-memory LRU with Cloudflare Cache API
 * Simplifies the caching layer by providing a single, consistent interface
 */
export class UnifiedCacheService implements DomainICache {
	private memoryCache = new Map<string, { value: number; timestamp: number }>();
	private pendingWrites = new Set<string>();
	private hits = 0;
	private misses = 0;
	
	constructor(
		private readonly logger: ILogger,
		private readonly config: CacheConfig = DEFAULT_CACHE_CONFIG
	) {}

	/**
	 * Get value from cache (memory first, then Cloudflare cache)
	 */
	get(key: string): number | undefined {
		// Try memory cache first
		const memoryValue = this.getFromMemory(key);
		if (memoryValue !== undefined) {
			this.hits++;
			return memoryValue;
		}

		// Load from Cloudflare cache asynchronously
		this.loadFromCloudflare(key);
		this.misses++;
		return undefined;
	}

	/**
	 * Set value in cache (memory immediately, Cloudflare asynchronously)
	 */
	set(key: string, value: number): void {
		this.setInMemory(key, value);
		this.saveToCloudflare(key, value);
	}

	/**
	 * Clear both memory and Cloudflare cache
	 */
	clear(): void {
		this.memoryCache.clear();
		this.hits = 0;
		this.misses = 0;
		
		// Clear Cloudflare cache asynchronously
		this.clearCloudflareCache();
	}

	/**
	 * Get cache statistics
	 */
	getStats(): { hits: number; misses: number; size: number; hitRatio: number } {
		const total = this.hits + this.misses;
		return {
			hits: this.hits,
			misses: this.misses,
			size: this.memoryCache.size,
			hitRatio: total > 0 ? this.hits / total : 0
		};
	}

	/**
	 * Get value from memory cache
	 */
	private getFromMemory(key: string): number | undefined {
		const entry = this.memoryCache.get(key);
		if (!entry) return undefined;

		const age = Date.now() - entry.timestamp;
		if (age < this.config.memoryTTL) {
			// Move to end (LRU)
			this.memoryCache.delete(key);
			this.memoryCache.set(key, entry);
			return entry.value;
		}

		// Expired, remove it
		this.memoryCache.delete(key);
		return undefined;
	}

	/**
	 * Set value in memory cache with LRU eviction
	 */
	private setInMemory(key: string, value: number): void {
		// Remove if exists to re-insert at end
		if (this.memoryCache.has(key)) {
			this.memoryCache.delete(key);
		}

		// Evict oldest if at capacity
		if (this.memoryCache.size >= this.config.maxMemorySize) {
			const firstKey = this.memoryCache.keys().next().value;
			if (firstKey) this.memoryCache.delete(firstKey);
		}

		this.memoryCache.set(key, {
			value,
			timestamp: Date.now()
		});
	}

	/**
	 * Load value from Cloudflare cache asynchronously
	 */
	private async loadFromCloudflare(key: string): Promise<void> {
		try {
			const cacheKey = this.generateCacheKey(key);
			const request = new Request(cacheKey);
			const response = await caches.default.match(request);
			
			if (response) {
				const data = await response.json();
				const cacheAge = this.getCacheAge(response);
				
				if (cacheAge < this.config.cloudflareeTTL) {
					this.setInMemory(key, data.score);
					this.logger.debug('Loaded from Cloudflare cache', { key, value: data.score, age: cacheAge });
				}
			}
		} catch (error) {
			this.logger.debug('Failed to load from Cloudflare cache', { error, key });
		}
	}

	/**
	 * Save value to Cloudflare cache asynchronously
	 */
	private async saveToCloudflare(key: string, value: number): Promise<void> {
		// Prevent duplicate writes
		if (this.pendingWrites.has(key)) return;
		this.pendingWrites.add(key);

		try {
			const cacheKey = this.generateCacheKey(key);
			const cacheData = { score: value, timestamp: Date.now() };
			
			const response = new Response(JSON.stringify(cacheData), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': `public, max-age=${this.config.cloudflareeTTL}`,
					'Date': new Date().toUTCString()
				}
			});
			
			await caches.default.put(new Request(cacheKey), response);
			this.logger.debug('Saved to Cloudflare cache', { key, value });
		} catch (error) {
			this.logger.debug('Failed to save to Cloudflare cache', { error, key, value });
		} finally {
			this.pendingWrites.delete(key);
		}
	}

	/**
	 * Clear Cloudflare cache asynchronously
	 */
	private async clearCloudflareCache(): Promise<void> {
		try {
			// Note: Cloudflare Cache API doesn't provide a direct clear all method
			// This is a placeholder - in practice, cache entries will expire naturally
			this.logger.warn('Cloudflare cache clear requested - entries will expire naturally');
		} catch (error) {
			this.logger.error('Failed to clear Cloudflare cache', { error });
		}
	}

	/**
	 * Generate cache key with prefix
	 */
	private generateCacheKey(key: string): string {
		const safeKey = btoa(key).replace(/[+/=]/g, (match) => {
			switch (match) {
				case '+': return '-';
				case '/': return '_';
				case '=': return '';
				default: return match;
			}
		});
		return `https://cache.remix-icon-mcp.workers.dev/${this.config.cacheKeyPrefix}${safeKey}`;
	}

	/**
	 * Get cache age from response headers
	 */
	private getCacheAge(response: Response): number {
		const dateHeader = response.headers.get('date');
		if (!dateHeader) return Infinity;
		
		const cacheTime = new Date(dateHeader).getTime();
		return (Date.now() - cacheTime) / 1000;
	}
}
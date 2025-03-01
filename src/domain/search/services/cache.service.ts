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

	/**
	 * Gets cache statistics
	 * @returns Object containing cache statistics
	 */
	getStats(): CacheStats;
}

/**
 * Cache statistics
 */
export interface CacheStats {
	/**
	 * Total number of cache hits
	 */
	hits: number;

	/**
	 * Total number of cache misses
	 */
	misses: number;

	/**
	 * Cache hit ratio (hits / (hits + misses))
	 */
	hitRatio: number;

	/**
	 * Current cache size
	 */
	size: number;

	/**
	 * Maximum cache size
	 */
	maxSize: number;

	/**
	 * Number of cache evictions
	 */
	evictions: number;
}

/**
 * LRU Cache node for doubly linked list
 */
class LRUNode {
	key: string;
	value: number;
	next: LRUNode | null = null;
	prev: LRUNode | null = null;

	constructor(key: string, value: number) {
		this.key = key;
		this.value = value;
	}
}

/**
 * LRU Cache implementation
 * Uses a doubly linked list and hash map for O(1) operations
 */
export class LRUCache implements ICache {
	private cache: Map<string, LRUNode> = new Map();
	private head: LRUNode | null = null;
	private tail: LRUNode | null = null;
	private hits = 0;
	private misses = 0;
	private evictions = 0;

	/**
	 * Creates a new LRU cache
	 * @param config - Search configuration
	 * @param logger - Logger instance
	 */
	constructor(private readonly config: SearchConfig, private readonly logger: ILogger) {}

	/**
	 * Gets a value from the cache
	 * @param key - Cache key
	 * @returns Cached value or undefined if not found
	 */
	get(key: string): number | undefined {
		const node = this.cache.get(key);

		if (node) {
			// Cache hit - move to front (most recently used)
			this.moveToFront(node);
			this.hits++;
			return node.value;
		}

		// Cache miss
		this.misses++;
		return undefined;
	}

	/**
	 * Sets a value in the cache
	 * @param key - Cache key
	 * @param value - Value to cache
	 */
	set(key: string, value: number): void {
		// Check if key already exists
		if (this.cache.has(key)) {
			// Update existing node
			const node = this.cache.get(key)!;
			node.value = value;
			this.moveToFront(node);
			return;
		}

		// Create new node
		const newNode = new LRUNode(key, value);

		// Add to cache
		this.cache.set(key, newNode);

		// Add to front of list
		if (!this.head) {
			// First node
			this.head = newNode;
			this.tail = newNode;
		} else {
			// Add to front
			newNode.next = this.head;
			this.head.prev = newNode;
			this.head = newNode;
		}

		// Check if we need to evict
		if (this.cache.size > this.config.cacheMaxSize) {
			this.evictLRU();
		}
	}

	/**
	 * Clears the cache
	 */
	clear(): void {
		this.cache.clear();
		this.head = null;
		this.tail = null;
		this.logger.debug('Cache cleared');
	}

	/**
	 * Gets cache statistics
	 * @returns Object containing cache statistics
	 */
	getStats(): CacheStats {
		const total = this.hits + this.misses;
		return {
			hits: this.hits,
			misses: this.misses,
			hitRatio: total > 0 ? this.hits / total : 0,
			size: this.cache.size,
			maxSize: this.config.cacheMaxSize,
			evictions: this.evictions,
		};
	}

	/**
	 * Moves a node to the front of the list (most recently used)
	 * @param node - Node to move
	 * @private
	 */
	private moveToFront(node: LRUNode): void {
		if (node === this.head) {
			// Already at front
			return;
		}

		// Remove from current position
		if (node.prev) {
			node.prev.next = node.next;
		}

		if (node.next) {
			node.next.prev = node.prev;
		}

		// Update tail if needed
		if (node === this.tail) {
			this.tail = node.prev;
		}

		// Move to front
		node.next = this.head;
		node.prev = null;

		if (this.head) {
			this.head.prev = node;
		}

		this.head = node;
	}

	/**
	 * Evicts the least recently used item
	 * @private
	 */
	private evictLRU(): void {
		if (!this.tail) return;

		// Remove from cache
		this.cache.delete(this.tail.key);

		// Update tail
		this.tail = this.tail.prev;

		if (this.tail) {
			this.tail.next = null;
		} else {
			// Cache is now empty
			this.head = null;
		}

		this.evictions++;
		this.logger.debug('Cache eviction', { key: this.tail?.key });
	}
}

/**
 * Multi-level cache implementation
 * Uses a small L1 cache for frequently accessed items and a larger L2 cache
 */
export class MultiLevelCache implements ICache {
	private l1Cache: LRUCache;
	private l2Cache: LRUCache;
	private l1Hits = 0;
	private l2Hits = 0;
	private misses = 0;
	private promotions = 0;

	/**
	 * Creates a new multi-level cache
	 * @param config - Search configuration
	 * @param logger - Logger instance
	 */
	constructor(private readonly config: SearchConfig, private readonly logger: ILogger) {
		// L1 cache is 20% of total cache size
		const l1Size = Math.max(10, Math.floor(config.cacheMaxSize * 0.2));
		const l2Size = config.cacheMaxSize - l1Size;

		// Create modified configs for each level
		const l1Config = { ...config, cacheMaxSize: l1Size };
		const l2Config = { ...config, cacheMaxSize: l2Size };

		this.l1Cache = new LRUCache(l1Config, logger);
		this.l2Cache = new LRUCache(l2Config, logger);

		this.logger.debug('Multi-level cache initialized', { l1Size, l2Size });
	}

	/**
	 * Gets a value from the cache
	 * @param key - Cache key
	 * @returns Cached value or undefined if not found
	 */
	get(key: string): number | undefined {
		// Try L1 cache first
		const l1Value = this.l1Cache.get(key);
		if (l1Value !== undefined) {
			this.l1Hits++;
			return l1Value;
		}

		// Try L2 cache
		const l2Value = this.l2Cache.get(key);
		if (l2Value !== undefined) {
			// Promote to L1 cache
			this.l1Cache.set(key, l2Value);
			this.l2Hits++;
			this.promotions++;
			return l2Value;
		}

		// Cache miss
		this.misses++;
		return undefined;
	}

	/**
	 * Sets a value in the cache
	 * @param key - Cache key
	 * @param value - Value to cache
	 */
	set(key: string, value: number): void {
		// Always set in L1 cache
		this.l1Cache.set(key, value);
	}

	/**
	 * Clears the cache
	 */
	clear(): void {
		this.l1Cache.clear();
		this.l2Cache.clear();
		this.l1Hits = 0;
		this.l2Hits = 0;
		this.misses = 0;
		this.promotions = 0;
		this.logger.debug('Multi-level cache cleared');
	}

	/**
	 * Gets cache statistics
	 * @returns Object containing cache statistics
	 */
	getStats(): CacheStats {
		const l1Stats = this.l1Cache.getStats();
		const l2Stats = this.l2Cache.getStats();

		const totalHits = this.l1Hits + this.l2Hits;
		const totalAccesses = totalHits + this.misses;

		return {
			hits: totalHits,
			misses: this.misses,
			hitRatio: totalAccesses > 0 ? totalHits / totalAccesses : 0,
			size: l1Stats.size + l2Stats.size,
			maxSize: l1Stats.maxSize + l2Stats.maxSize,
			evictions: l1Stats.evictions + l2Stats.evictions,
		};
	}
}

import { CacheEntry, SearchConfig } from '../../types';
import { ILogger } from '../../utils/Logger';

export interface ICache {
	get(key: string): number | undefined;
	set(key: string, value: number): void;
	clear(): void;
}

export class CacheManager implements ICache {
	private cache: Map<string, CacheEntry>;
	private readonly maxSize: number;
	private readonly ttl: number;

	constructor(config: SearchConfig, private readonly logger: ILogger) {
		this.cache = new Map();
		this.maxSize = config.cache.maxSize;
		this.ttl = config.cache.ttl;
	}

	get(key: string): number | undefined {
		const entry = this.cache.get(key);
		if (!entry) return undefined;

		if (this.isExpired(entry)) {
			this.cache.delete(key);
			return undefined;
		}

		return entry.value;
	}

	set(key: string, value: number): void {
		this.cleanup();

		if (this.cache.size >= this.maxSize) {
			const oldestKey = this.findOldestEntry();
			if (oldestKey) {
				this.cache.delete(oldestKey);
			}
		}

		this.cache.set(key, {
			value,
			timestamp: Date.now(),
		});
	}

	clear(): void {
		this.cache.clear();
	}

	private cleanup(): void {
		const now = Date.now();
		let expiredCount = 0;

		for (const [key, entry] of this.cache.entries()) {
			if (this.isExpired(entry)) {
				this.cache.delete(key);
				expiredCount++;
			}
		}

		if (expiredCount > 0) {
			this.logger.debug(`Cleaned up ${expiredCount} expired cache entries`);
		}
	}

	private isExpired(entry: CacheEntry): boolean {
		return Date.now() - entry.timestamp > this.ttl;
	}

	private findOldestEntry(): string | undefined {
		let oldestKey: string | undefined;
		let oldestTime = Infinity;

		for (const [key, entry] of this.cache.entries()) {
			if (entry.timestamp < oldestTime) {
				oldestTime = entry.timestamp;
				oldestKey = key;
			}
		}

		return oldestKey;
	}
}

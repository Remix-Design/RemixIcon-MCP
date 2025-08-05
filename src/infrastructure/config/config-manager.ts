import { SearchConfig } from '../../domain/search/types/search.types';

/**
 * Application configuration interface
 */
export interface AppConfig {
	search: SearchConfig;
	cache: CacheConfig;
	storage: StorageConfig;
	logging: LoggingConfig;
	performance: PerformanceConfig;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
	memoryTTL: number;
	cloudflareTTL: number;
	maxMemorySize: number;
	keyPrefix: string;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
	kvNamespace: string;
	catalogKey: string;
	categoryPrefix: string;
	indexKey: string;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
	level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
	enableStructuredLogging: boolean;
}

/**
 * Performance configuration
 */
export interface PerformanceConfig {
	batchSize: number;
	maxConcurrentBatches: number;
	resultLimit: number;
	earlyTerminationThreshold: number;
}

/**
 * Default application configuration
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
	search: {
		weights: {
			cosine: 0.15,
			category: 0.35,
			tags: 0.28,
			nameMatch: 0.37,
			contextual: 0.18,
		},
		thresholds: {
			similarity: 0.05,
			highScore: 0.3,
			minScore: 0.05,
			secondaryResults: 0.1,
			categoryScore: 0.1,
		},
		cacheTTL: 3600000, // 1 hour
		cacheMaxSize: 1000,
		boosts: {
			exactMatch: 2.4,
			nameMatch: 2.2,
			categoryMatch: 2.2,
			multiTerm: 1.7,
			compoundMatch: 1.9,
			context: 1.6,
			multiCategory: 1.5,
			priority: 1.7,
			importance: 1.6,
			partialMatch: 1.5,
			coherence: 1.5,
		},
		resultControl: {
			maxWordDistance: 5,
			lengthPenaltyFactor: 0.03,
			wordCountBoost: 2.0,
		},
		minScoreThreshold: 0.05,
	},
	cache: {
		memoryTTL: 300000, // 5 minutes
		cloudflareTTL: 3600, // 1 hour
		maxMemorySize: 500,
		keyPrefix: 'mcp-remix-icon:'
	},
	storage: {
		kvNamespace: 'ICON_CATALOG',
		catalogKey: 'icon_catalog',
		categoryPrefix: 'category_',
		indexKey: 'search_index'
	},
	logging: {
		level: 'INFO',
		enableStructuredLogging: true
	},
	performance: {
		batchSize: 100,
		maxConcurrentBatches: 3,
		resultLimit: 5,
		earlyTerminationThreshold: 15 // Stop if we have 3x results with high scores
	}
};

/**
 * Configuration manager for centralized configuration access
 */
export class ConfigManager {
	private config: AppConfig;

	constructor(customConfig?: Partial<AppConfig>) {
		this.config = this.mergeConfig(DEFAULT_APP_CONFIG, customConfig);
	}

	/**
	 * Get the complete configuration
	 */
	getConfig(): AppConfig {
		return { ...this.config };
	}

	/**
	 * Get search configuration
	 */
	getSearchConfig(): SearchConfig {
		return { ...this.config.search };
	}

	/**
	 * Get cache configuration
	 */
	getCacheConfig(): CacheConfig {
		return { ...this.config.cache };
	}

	/**
	 * Get storage configuration
	 */
	getStorageConfig(): StorageConfig {
		return { ...this.config.storage };
	}

	/**
	 * Get logging configuration
	 */
	getLoggingConfig(): LoggingConfig {
		return { ...this.config.logging };
	}

	/**
	 * Get performance configuration
	 */
	getPerformanceConfig(): PerformanceConfig {
		return { ...this.config.performance };
	}

	/**
	 * Update configuration at runtime (for testing or dynamic config)
	 */
	updateConfig(updates: Partial<AppConfig>): void {
		this.config = this.mergeConfig(this.config, updates);
	}

	/**
	 * Create configuration from environment variables
	 */
	static fromEnvironment(env?: Record<string, string>): ConfigManager {
		const envConfig: Partial<AppConfig> = {};

		if (env) {
			// Cache configuration from environment
			if (env.CACHE_MEMORY_TTL) {
				envConfig.cache = {
					...DEFAULT_APP_CONFIG.cache,
					memoryTTL: parseInt(env.CACHE_MEMORY_TTL)
				};
			}

			// Logging configuration from environment
			if (env.LOG_LEVEL) {
				envConfig.logging = {
					...DEFAULT_APP_CONFIG.logging,
					level: env.LOG_LEVEL as LoggingConfig['level']
				};
			}

			// Performance configuration from environment
			if (env.BATCH_SIZE || env.MAX_CONCURRENT_BATCHES) {
				envConfig.performance = {
					...DEFAULT_APP_CONFIG.performance,
					batchSize: env.BATCH_SIZE ? parseInt(env.BATCH_SIZE) : DEFAULT_APP_CONFIG.performance.batchSize,
					maxConcurrentBatches: env.MAX_CONCURRENT_BATCHES 
						? parseInt(env.MAX_CONCURRENT_BATCHES) 
						: DEFAULT_APP_CONFIG.performance.maxConcurrentBatches
				};
			}
		}

		return new ConfigManager(envConfig);
	}

	/**
	 * Deep merge configuration objects
	 */
	private mergeConfig(base: AppConfig, override?: Partial<AppConfig>): AppConfig {
		if (!override) return base;

		return {
			search: { ...base.search, ...override.search },
			cache: { ...base.cache, ...override.cache },
			storage: { ...base.storage, ...override.storage },
			logging: { ...base.logging, ...override.logging },
			performance: { ...base.performance, ...override.performance }
		};
	}
}
import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';
import { ResponseContent, IconMetadata } from './domain/icon/types/icon.types';
import { UnifiedSearchService, TieredSearchService, InvertedIndexService, QueryService, ScorerService } from './domain/search/services';
import { ConsoleLogger, LogLevel } from './infrastructure/logging/logger';
import { CloudflareKVStorage } from './infrastructure/storage/kv-storage.service';
import { UnifiedCacheService } from './infrastructure/cache/unified-cache.service';
import { SmartCacheService } from './infrastructure/cache/smart-cache.service';
import { PredictiveCacheService } from './infrastructure/cache/predictive-cache.service';
import { ConfigManager } from './infrastructure/config/config-manager';
import { TelemetryService, DashboardService, CorrelationTracker } from './infrastructure/observability';
import { TextProcessor } from './utils/text/text-processor';
import iconCatalog from './data/icon-catalog.json';

/**
 * Main RemixIcon MCP implementation
 */
export default class RemixIconMCP extends WorkerEntrypoint<Env> {
	private searchService: UnifiedSearchService;
	private tieredSearchService: TieredSearchService;
	private kvStorage: CloudflareKVStorage;
	private cacheService: UnifiedCacheService;
	private smartCacheService: SmartCacheService;
	private predictiveCacheService: PredictiveCacheService;
	private logger: ConsoleLogger;
	private configManager: ConfigManager;
	private telemetryService: TelemetryService;
	private dashboardService: DashboardService;
	private correlationTracker: CorrelationTracker;

	constructor(ctx: ExecutionContext, env: Env) {
		super(ctx, env);
		
		// Initialize configuration
		this.configManager = ConfigManager.fromEnvironment(env as any);
		const config = this.configManager.getConfig();
		
		// Initialize logger with config
		const logLevel = config.logging.level === 'DEBUG' ? LogLevel.DEBUG : LogLevel.INFO;
		this.logger = new ConsoleLogger(logLevel);
		
		// Initialize observability services
		this.correlationTracker = new CorrelationTracker(this.logger);
		this.telemetryService = new TelemetryService(
			this.logger,
			env.ANALYTICS_ENGINE, // Cloudflare Analytics Engine binding
			{
				enabled: true,
				enableAnalyticsEngine: !!env.ANALYTICS_ENGINE,
				enableCloudflareInsights: true
			}
		);
		this.dashboardService = new DashboardService(this.telemetryService, this.logger);
		
		// Initialize services with configuration
		this.kvStorage = new CloudflareKVStorage(env.ICON_CATALOG, this.logger);
		this.cacheService = new UnifiedCacheService(this.logger, config.cache);
		
		// Initialize smart caching system
		this.predictiveCacheService = new PredictiveCacheService(
			this.logger,
			this.telemetryService,
			{
				enabled: true,
				backgroundWarmingEnabled: true,
				maxConcurrentWarming: 3,
				warmingThreshold: 0.7
			}
		);
		
		this.smartCacheService = new SmartCacheService(
			this.logger,
			this.cacheService,
			this.predictiveCacheService,
			this.telemetryService,
			{
				maxMemoryMB: 50,
				maxEntries: 5000,
				warmingEnabled: true,
				telemetryEnabled: true,
				optimizationStrategy: {
					evictionPolicy: 'adaptive',
					ttlStrategy: 'adaptive',
					warmingStrategy: 'hybrid',
					compressionEnabled: true,
					adaptiveSizingEnabled: true
				}
			}
		);
		
		// Create search services
		this.searchService = createUnifiedSearchService(
			this.kvStorage,
			this.cacheService,
			this.logger,
			this.configManager,
			this.telemetryService,
			this.correlationTracker
		);
		
		// Create tiered search service for performance optimization
		this.tieredSearchService = new TieredSearchService(
			this.searchService,
			this.configManager.getSearchConfig(),
			this.logger,
			this.kvStorage,
			{
				bloomFilterFalsePositiveRate: 0.01,
				maxCandidatesPerStage: config.performance.batchSize,
				earlyTerminationThreshold: config.performance.earlyTerminationThreshold,
				enableStageMetrics: config.logging.level === 'DEBUG'
			}
		);
		
		// Connect tiered search to unified search
		this.searchService.setTieredSearchService(this.tieredSearchService);
	}

	/**
	 * Initialize search index with fallback data
	 */
	private async initializeIndex(): Promise<void> {
		try {
			// Try to load from KV storage first
			const kvResult = await this.kvStorage.getIconCatalog();
			const icons = kvResult.success && kvResult.data ? kvResult.data : iconCatalog.icons;
			
			// Build both unified and tiered search indexes
			this.searchService.buildIndex(icons);
			this.tieredSearchService.buildIndex(icons);
			
			const source = kvResult.success ? 'KV storage' : 'JSON fallback';
			this.logger.info('Search indexes built successfully', { 
				source, 
				count: icons.length,
				tieredSearchEnabled: true
			});
		} catch (error) {
			// Ultimate fallback to JSON
			this.logger.error('Error building search indexes, using JSON fallback', { error });
			this.searchService.buildIndex(iconCatalog.icons);
			this.tieredSearchService.buildIndex(iconCatalog.icons);
		}
	}

	/**
	 * Find icons based on description with enhanced matching
	 * @param {string} description - The user's description to search for icons
	 * @returns {ResponseContent[]} Array of matching icons
	 */
	async findIcons(description: string, userId?: string, sessionId?: string): Promise<ResponseContent[]> {
		await this.initializeIndex();
		
		// Try smart cache first
		const cachedResults = await this.smartCacheService.get(description, userId, sessionId);
		if (cachedResults) {
			return cachedResults;
		}
		
		// Execute search
		const resultLimit = this.configManager.getPerformanceConfig().resultLimit;
		const results = await this.searchService.findIcons(description, resultLimit);
		
		// Cache results with smart caching
		if (results.length > 0) {
			await this.smartCacheService.set(description, results);
		}
		
		return results;
	}

	/**
	 * Get all available icon categories
	 * @returns {ResponseContent[]} Array of unique icon categories
	 */
	async getIconCategories(): Promise<ResponseContent[]> {
		try {
			// Get categories from KV storage or fallback to JSON
			const catalogResult = await this.kvStorage.getIconCatalog();
			const icons = catalogResult.success && catalogResult.data 
				? catalogResult.data 
				: iconCatalog.icons;
			
			const categories = new Set<string>();
			icons.forEach((icon) => categories.add(icon.category));

			return Array.from(categories)
				.sort()
				.map((category) => ({
					type: 'text' as const,
					text: category,
				}));
		} catch (error) {
			this.logger.error('Error in getIconCategories', { error });
			return [];
		}
	}

	/**
	 * Find icons in a specific category based on description
	 * @param {string} description - The search description
	 * @param {string} category - The category to search in
	 * @returns {ResponseContent[]} Array of matching icons in the specified category
	 */
	async findIconsByCategory(description: string, category: string, userId?: string, sessionId?: string): Promise<ResponseContent[]> {
		await this.initializeIndex();
		
		const cacheKey = `${description}:category:${category}`;
		
		// Try smart cache first
		const cachedResults = await this.smartCacheService.get(cacheKey, userId, sessionId);
		if (cachedResults) {
			return cachedResults;
		}
		
		// Execute search
		const resultLimit = this.configManager.getPerformanceConfig().resultLimit;
		const results = await this.searchService.findIconsByCategory(description, category, resultLimit);
		
		// Cache results with smart caching
		if (results.length > 0) {
			await this.smartCacheService.set(cacheKey, results);
		}
		
		return results;
	}

	/**
	 * Get real-time dashboard metrics
	 * @returns {object} Dashboard metrics and analytics
	 */
	async getDashboardMetrics(): Promise<object> {
		return this.dashboardService.getDashboardMetrics();
	}

	/**
	 * Get performance telemetry data
	 * @returns {object} Performance metrics and telemetry
	 */
	async getTelemetryData(): Promise<object> {
		return this.telemetryService.exportMetrics();
	}

	/**
	 * Get correlation analytics
	 * @returns {object} Request correlation and tracing data
	 */
	async getCorrelationAnalytics(): Promise<object> {
		return this.correlationTracker.getAnalytics();
	}

	/**
	 * Get active alerts
	 * @returns {Array} Active system alerts
	 */
	async getActiveAlerts(): Promise<Array<any>> {
		return this.dashboardService.getActiveAlerts();
	}

	/**
	 * Acknowledge an alert
	 * @param {string} alertId - The alert ID to acknowledge
	 */
	async acknowledgeAlert(alertId: string): Promise<void> {
		this.dashboardService.acknowledgeAlert(alertId);
	}

	/**
	 * Execute cache warming based on predictive analysis
	 */
	async executeSmartCacheWarming(): Promise<void> {
		await this.smartCacheService.executeWarming(async (query: string) => {
			const resultLimit = this.configManager.getPerformanceConfig().resultLimit;
			return await this.searchService.findIcons(query, resultLimit);
		});
	}

	/**
	 * Get smart cache analytics
	 * @returns {object} Smart cache performance and analytics
	 */
	async getSmartCacheAnalytics(): Promise<object> {
		return {
			metrics: this.smartCacheService.getMetrics(),
			analytics: this.smartCacheService.getAnalytics(),
			warmingStats: this.predictiveCacheService.getWarmingStats()
		};
	}

	/**
	 * Get predictive cache insights
	 * @returns {object} Query pattern analysis and predictions
	 */
	async getPredictiveCacheInsights(): Promise<object> {
		const predictions = await this.predictiveCacheService.analyzePatternsAndPredict();
		const warmingStats = this.predictiveCacheService.getWarmingStats();
		
		return {
			predictions: predictions.slice(0, 20), // Top 20 predictions
			warmingStats,
			insights: {
				totalPatterns: warmingStats.totalPatterns,
				totalUsers: warmingStats.totalUsers,
				avgQueriesPerUser: warmingStats.userBehaviorInsights.avgQueriesPerUser,
				topCategories: warmingStats.userBehaviorInsights.topCategories,
				predictionConfidence: predictions.length > 0 
					? predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length 
					: 0
			}
		};
	}

	/**
	 * Clear smart cache with optional pattern
	 * @param {string} pattern - Optional pattern to match for selective clearing
	 */
	async clearSmartCache(pattern?: string): Promise<void> {
		await this.smartCacheService.clear(pattern);
	}

	/**
	 * @ignore
	 */
	async fetch(request: Request): Promise<Response> {
		return new ProxyToSelf(this).fetch(request);
	}
}

export function createUnifiedSearchService(
	kvStorage: CloudflareKVStorage,
	cacheService: UnifiedCacheService,
	logger: ConsoleLogger,
	configManager: ConfigManager,
	telemetryService?: TelemetryService,
	correlationTracker?: CorrelationTracker
): UnifiedSearchService {
	const searchConfig = configManager.getSearchConfig();
	const queryProcessor = new QueryService(searchConfig, logger);
	const scorer = new ScorerService(searchConfig, logger);
	const invertedIndex = new InvertedIndexService(searchConfig, logger);

	return new UnifiedSearchService(
		scorer,
		cacheService,
		queryProcessor,
		searchConfig,
		logger,
		kvStorage,
		invertedIndex,
		telemetryService,
		correlationTracker
	);
}

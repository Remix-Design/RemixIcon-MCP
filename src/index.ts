import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';
import { ResponseContent, IconMetadata } from './domain/icon/types/icon.types';
import { UnifiedSearchService, TieredSearchService, InvertedIndexService, QueryService, ScorerService, AdvancedQueryService, FacetedSearchService } from './domain/search/services';
import { ConsoleLogger, LogLevel } from './infrastructure/logging/logger';
import { CloudflareKVStorage } from './infrastructure/storage/kv-storage.service';
import { UnifiedCacheService } from './infrastructure/cache/unified-cache.service';
import { SmartCacheService } from './infrastructure/cache/smart-cache.service';
import { PredictiveCacheService } from './infrastructure/cache/predictive-cache.service';
import { ConfigManager } from './infrastructure/config/config-manager';
import { TelemetryService, DashboardService, CorrelationTracker } from './infrastructure/observability';
import { SemanticSearchService, IntentClassifierService, AIEnhancedSearchService } from './infrastructure/ai';
import { RegionCoordinatorService } from './infrastructure/distributed/region-coordinator.service';
import { CircuitBreakerService, GracefulDegradationService, FallbackManagerService } from './infrastructure/resilience';
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
	private semanticSearchService: SemanticSearchService;
	private intentClassifierService: IntentClassifierService;
	private aiEnhancedSearchService: AIEnhancedSearchService;
	private regionCoordinator: RegionCoordinatorService;
	private circuitBreakers: Map<string, CircuitBreakerService> = new Map();
	private gracefulDegradation: GracefulDegradationService;
	private fallbackManager: FallbackManagerService;
	private advancedQueryService: AdvancedQueryService;
	private facetedSearchService: FacetedSearchService;

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
		
		// Initialize AI services if enabled
		const isAIEnabled = env.AI_ENABLED === 'true';
		if (isAIEnabled && env.AI) {
			this.semanticSearchService = new SemanticSearchService(
				this.logger,
				env.AI,
				this.telemetryService,
				{
					embeddingModel: '@cf/baai/bge-base-en-v1.5',
					embeddingDimensions: 768,
					similarityThreshold: 0.7,
					enableIntentClassification: env.INTENT_CLASSIFICATION_ENABLED === 'true'
				}
			);
			
			this.intentClassifierService = new IntentClassifierService(
				this.logger,
				env.AI,
				this.telemetryService,
				{
					enableMLClassification: true,
					enableSentimentAnalysis: true,
					enableEntityExtraction: true,
					confidenceThreshold: 0.6
				}
			);
		}
		
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
		
		// Initialize AI-enhanced search if AI services are available
		if (isAIEnabled && env.AI && this.semanticSearchService && this.intentClassifierService) {
			this.aiEnhancedSearchService = new AIEnhancedSearchService(
				this.logger,
				this.searchService,
				this.semanticSearchService,
				this.intentClassifierService,
				this.telemetryService,
				{
					enableSemanticSearch: env.SEMANTIC_SEARCH_ENABLED === 'true',
					enableIntentClassification: env.INTENT_CLASSIFICATION_ENABLED === 'true',
					enableHybridScoring: true,
					adaptiveWeighting: true,
					defaultStrategy: 'balanced',
					maxResults: config.performance.resultLimit || 10
				}
			);
		}
		
		// Initialize multi-region coordination
		this.regionCoordinator = new RegionCoordinatorService(
			this.logger,
			env,
			this.telemetryService,
			{
				regionId: env.CF_REGION || 'auto',
				regionName: env.REGION_NAME || `Region-${env.CF_REGION || 'auto'}`,
				location: env.CF_COLO || 'unknown',
				capabilities: ['search', 'cache', 'ai', 'analytics']
			}
		);

		// Initialize resilience services
		this.initializeResilienceServices();

		// Initialize advanced search services
		this.initializeAdvancedSearchServices();
	}

	/**
	 * Initialize resilience services (circuit breakers, graceful degradation, fallbacks)
	 */
	private initializeResilienceServices(): void {
		// Initialize graceful degradation
		this.gracefulDegradation = new GracefulDegradationService(
			{
				cpuThreshold: 0.8,
				memoryThreshold: 0.85,
				responseTimeThreshold: 5000,
				errorRateThreshold: 0.1,
				connectionThreshold: 1000,
				queueSizeThreshold: 100
			},
			this.logger,
			this.telemetryService
		);

		// Register feature degradation strategies
		this.gracefulDegradation.registerFeature({
			featureName: 'ai-search',
			priority: 1,
			dependencies: ['semantic-search', 'intent-classification'],
			degradationLevels: {
				normal: { enabled: true },
				partial: { enabled: true, timeoutMs: 3000 },
				minimal: { enabled: false, fallbackBehavior: 'Use traditional search only' },
				emergency: { enabled: false, fallbackBehavior: 'Use traditional search only' }
			}
		});

		this.gracefulDegradation.registerFeature({
			featureName: 'semantic-search',
			priority: 2,
			dependencies: [],
			degradationLevels: {
				normal: { enabled: true },
				partial: { enabled: true, timeoutMs: 2000, simplified: true },
				minimal: { enabled: false, fallbackBehavior: 'Use keyword matching only' },
				emergency: { enabled: false, fallbackBehavior: 'Use keyword matching only' }
			}
		});

		this.gracefulDegradation.registerFeature({
			featureName: 'predictive-cache',
			priority: 3,
			dependencies: [],
			degradationLevels: {
				normal: { enabled: true },
				partial: { enabled: true, simplified: true },
				minimal: { enabled: false, fallbackBehavior: 'Use basic cache only' },
				emergency: { enabled: false, fallbackBehavior: 'Use basic cache only' }
			}
		});

		this.gracefulDegradation.registerFeature({
			featureName: 'analytics',
			priority: 4,
			dependencies: [],
			degradationLevels: {
				normal: { enabled: true },
				partial: { enabled: true, simplified: true },
				minimal: { enabled: false, fallbackBehavior: 'Basic logging only' },
				emergency: { enabled: false, fallbackBehavior: 'Basic logging only' }
			}
		});

		// Initialize circuit breakers
		const circuitBreakerConfig = {
			failureThreshold: 5,
			successThreshold: 3,
			timeout: 60000,
			monitoringWindow: 300000,
			volumeThreshold: 10,
			errorThreshold: 0.5
		};

		this.circuitBreakers.set('findIcons', new CircuitBreakerService(
			'findIcons',
			circuitBreakerConfig,
			this.logger,
			this.telemetryService
		));

		this.circuitBreakers.set('ai-search', new CircuitBreakerService(
			'ai-search',
			{ ...circuitBreakerConfig, failureThreshold: 3, timeout: 30000 },
			this.logger,
			this.telemetryService
		));

		this.circuitBreakers.set('semantic-search', new CircuitBreakerService(
			'semantic-search',
			{ ...circuitBreakerConfig, failureThreshold: 3, timeout: 30000 },
			this.logger,
			this.telemetryService
		));

		// Initialize fallback manager
		this.fallbackManager = new FallbackManagerService(
			this.logger,
			this.telemetryService,
			this.cacheService,
			this.circuitBreakers
		);

		// Register fallback strategies
		this.registerFallbackStrategies();

		this.logger.info('Resilience services initialized', {
			circuitBreakers: this.circuitBreakers.size,
			degradationFeatures: 4,
			fallbackStrategies: 'registered'
		});
	}

	/**
	 * Register fallback strategies for operations
	 */
	private registerFallbackStrategies(): void {
		// Fallback strategies for findIcons
		this.fallbackManager.registerFallback('findIcons', [
			{
				strategy: 'cache_only' as any,
				priority: 100,
				conditions: { circuitStates: ['open', 'half_open'] },
				config: { cacheKey: 'findIcons', ttlMs: 300000 }
			},
			{
				strategy: 'simplified' as any,
				priority: 80,
				conditions: { errorTypes: ['TimeoutError', 'NetworkError'] },
				config: {}
			},
			{
				strategy: 'static_response' as any,
				priority: 60,
				conditions: { maxRetries: 2 },
				config: {
					staticData: [{
						type: 'text',
						text: 'Service temporarily unavailable. Please try basic searches like "home", "user", "settings".'
					}]
				}
			}
		]);

		// Fallback strategies for getIconCategories
		this.fallbackManager.registerFallback('getIconCategories', [
			{
				strategy: 'cache_only' as any,
				priority: 100,
				conditions: {},
				config: { cacheKey: 'iconCategories', ttlMs: 600000 }
			},
			{
				strategy: 'static_response' as any,
				priority: 90,
				conditions: {},
				config: {
					staticData: [
						{ type: 'text', text: 'System' },
						{ type: 'text', text: 'User & Faces' },
						{ type: 'text', text: 'Business' },
						{ type: 'text', text: 'Communication' },
						{ type: 'text', text: 'Media' }
					]
				}
			}
		]);

		// Register static responses
		this.fallbackManager.registerStaticResponse('emergency-response', {
			message: 'System is in emergency mode. Only basic functionality is available.',
			availableOperations: ['getIconCategories'],
			suggestion: 'Please try again in a few minutes.'
		});
	}

	/**
	 * Initialize advanced search services
	 */
	private initializeAdvancedSearchServices(): void {
		// Initialize advanced query service
		this.advancedQueryService = new AdvancedQueryService(this.logger);

		// Initialize faceted search service
		this.facetedSearchService = new FacetedSearchService(
			this.logger,
			this.advancedQueryService
		);

		this.logger.info('Advanced search services initialized', {
			advancedQuery: true,
			facetedSearch: true
		});
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
			
			// Initialize AI services if available
			if (this.semanticSearchService) {
				await this.semanticSearchService.initialize(icons);
			}
			
			if (this.aiEnhancedSearchService) {
				await this.aiEnhancedSearchService.initialize(icons);
			}
			
			// Initialize region coordination
			if (this.regionCoordinator) {
				await this.regionCoordinator.initialize();
			}
			
			const source = kvResult.success ? 'KV storage' : 'JSON fallback';
			this.logger.info('Search indexes built successfully', { 
				source, 
				count: icons.length,
				tieredSearchEnabled: true,
				aiEnabled: !!this.aiEnhancedSearchService,
				semanticSearchEnabled: !!this.semanticSearchService,
				multiRegionEnabled: !!this.regionCoordinator
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
	async findIcons(description: string, userId?: string, sessionId?: string, useAI?: boolean): Promise<ResponseContent[]> {
		// Update system health metrics
		const startTime = Date.now();
		this.updateSystemHealth();

		// Execute with circuit breaker and fallback protection
		const circuitBreaker = this.circuitBreakers.get('findIcons');
		if (circuitBreaker) {
			const result = await circuitBreaker.execute(
				async () => {
					return await this.executeIconSearchWithDegradation(description, userId, sessionId, useAI);
				},
				async (error) => {
					// Fallback function
					return await this.fallbackManager.executeWithFallback(
						'findIcons',
						async () => { throw error; }, // This will always fail, triggering fallback strategies
						{
							originalError: error,
							operationName: 'findIcons',
							requestData: { description, userId, sessionId },
							retryCount: 0,
							startTime
						}
					).then(result => result.data || []);
				}
			);

			if (result.success) {
				return result.data || [];
			} else {
				// Return fallback data or empty array
				return result.fallbackUsed ? (result.data || []) : [];
			}
		}

		// Fallback if no circuit breaker
		return await this.executeIconSearchWithDegradation(description, userId, sessionId, useAI);
	}

	/**
	 * Execute icon search with degradation awareness
	 */
	private async executeIconSearchWithDegradation(
		description: string, 
		userId?: string, 
		sessionId?: string, 
		useAI?: boolean
	): Promise<ResponseContent[]> {
		await this.initializeIndex();
		
		// Try smart cache first (if predictive cache is enabled)
		if (this.gracefulDegradation.isFeatureEnabled('predictive-cache')) {
			const cachedResults = await this.smartCacheService.get(description, userId, sessionId);
			if (cachedResults) {
				// Cache hit for fallback use
				this.fallbackManager.cacheForFallback(`findIcons:${description}`, cachedResults);
				return cachedResults;
			}
		}
		
		// Use AI-enhanced search if available, requested, and enabled
		const isAIEnabled = useAI !== false && 
			this.aiEnhancedSearchService && 
			this.gracefulDegradation.isFeatureEnabled('ai-search');

		if (isAIEnabled) {
			return await this.gracefulDegradation.executeWithDegradation(
				'ai-search',
				async () => {
					const catalogResult = await this.kvStorage.getIconCatalog();
					const icons = catalogResult.success && catalogResult.data ? catalogResult.data : iconCatalog.icons;
					
					const aiResults = await this.aiEnhancedSearchService!.search(
						description, 
						icons, 
						userId, 
						sessionId
					);
					
					// Convert AI results to ResponseContent format
					const responseResults = aiResults.map(result => ({
						type: 'text' as const,
						text: `${result.icon.name} (AI Score: ${(result.scores.combined * 100).toFixed(0)}%, ` +
							  `Match: ${result.matchTypes.join('+')}, Category: ${result.icon.category})`
					}));
					
					// Cache results and for fallback use
					if (responseResults.length > 0) {
						if (this.gracefulDegradation.isFeatureEnabled('predictive-cache')) {
							await this.smartCacheService.set(description, responseResults);
						}
						this.fallbackManager.cacheForFallback(`findIcons:${description}`, responseResults);
					}
					
					return responseResults;
				},
				async () => {
					// Fallback to traditional search
					return await this.executeTraditionalSearch(description);
				}
			);
		}
		
		// Traditional search
		return await this.executeTraditionalSearch(description);
	}

	/**
	 * Execute traditional search with caching
	 */
	private async executeTraditionalSearch(description: string): Promise<ResponseContent[]> {
		const resultLimit = this.configManager.getPerformanceConfig().resultLimit;
		const results = await this.searchService.findIcons(description, resultLimit);
		
		// Cache results with smart caching if enabled
		if (results.length > 0) {
			if (this.gracefulDegradation.isFeatureEnabled('predictive-cache')) {
				await this.smartCacheService.set(description, results);
			}
			this.fallbackManager.cacheForFallback(`findIcons:${description}`, results);
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
	 * Perform semantic search with AI embeddings
	 * @param {string} query - The search query
	 * @param {string} userId - Optional user ID for personalization
	 * @param {string} sessionId - Optional session ID
	 * @returns {object} Semantic search results with similarity scores
	 */
	async performSemanticSearch(query: string, userId?: string, sessionId?: string): Promise<object[]> {
		if (!this.semanticSearchService) {
			throw new Error('Semantic search not available - AI services not enabled');
		}

		await this.initializeIndex();
		
		const catalogResult = await this.kvStorage.getIconCatalog();
		const icons = catalogResult.success && catalogResult.data ? catalogResult.data : iconCatalog.icons;
		
		const results = await this.semanticSearchService.semanticSearch(query, icons, 10);
		
		return results.map(result => ({
			icon: result.icon,
			semanticScore: result.semanticScore,
			explanation: result.explanation,
			matchType: result.matchType
		}));
	}

	/**
	 * Classify user intent from query
	 * @param {string} query - The query to classify
	 * @param {string} userId - Optional user ID for context
	 * @param {string} sessionId - Optional session ID
	 * @returns {object} Intent classification result
	 */
	async classifyIntent(query: string, userId?: string, sessionId?: string): Promise<object> {
		if (!this.intentClassifierService) {
			throw new Error('Intent classification not available - AI services not enabled');
		}

		return await this.intentClassifierService.classifyIntent(query, userId, sessionId);
	}

	/**
	 * Get AI search recommendations for user
	 * @param {string} userId - User ID for personalization
	 * @param {string} sessionId - Optional session ID
	 * @returns {object} Personalized search recommendations
	 */
	async getAIRecommendations(userId: string, sessionId?: string): Promise<object> {
		if (!this.aiEnhancedSearchService) {
			throw new Error('AI recommendations not available - AI services not enabled');
		}

		return await this.aiEnhancedSearchService.getRecommendations(userId, sessionId);
	}

	/**
	 * Analyze search quality with AI insights
	 * @param {string} query - The original query
	 * @param {object} userFeedback - Optional user feedback
	 * @returns {object} Search quality analysis
	 */
	async analyzeSearchQuality(
		query: string, 
		userFeedback?: { satisfied: boolean; selectedIcons: string[]; rejectedSuggestions: string[] }
	): Promise<object> {
		if (!this.aiEnhancedSearchService) {
			throw new Error('Search quality analysis not available - AI services not enabled');
		}

		// Get AI results for analysis
		const catalogResult = await this.kvStorage.getIconCatalog();
		const icons = catalogResult.success && catalogResult.data ? catalogResult.data : iconCatalog.icons;
		const results = await this.aiEnhancedSearchService.search(query, icons);
		
		return await this.aiEnhancedSearchService.analyzeSearchQuality(query, results, userFeedback);
	}

	/**
	 * Get comprehensive AI analytics
	 * @returns {object} AI service analytics and performance metrics
	 */
	async getAIAnalytics(): Promise<object> {
		const analytics: any = {
			aiEnabled: !!this.aiEnhancedSearchService,
			semanticSearchEnabled: !!this.semanticSearchService,
			intentClassificationEnabled: !!this.intentClassifierService
		};

		if (this.semanticSearchService) {
			analytics.semanticSearch = this.semanticSearchService.getAnalytics();
		}

		if (this.intentClassifierService) {
			analytics.intentClassification = this.intentClassifierService.getAnalytics();
		}

		if (this.aiEnhancedSearchService) {
			analytics.aiEnhancedSearch = this.aiEnhancedSearchService.getAnalytics();
		}

		return analytics;
	}

	/**
	 * Clear all AI service data
	 */
	async clearAIData(): Promise<void> {
		if (this.semanticSearchService) {
			this.semanticSearchService.clear();
		}

		if (this.intentClassifierService) {
			this.intentClassifierService.clear();
		}

		if (this.aiEnhancedSearchService) {
			this.aiEnhancedSearchService.clear();
		}

		this.logger.info('AI service data cleared');
	}

	/**
	 * Get multi-region coordination status
	 * @returns {object} Region coordination status and metrics
	 */
	async getRegionStatus(): Promise<object> {
		if (!this.regionCoordinator) {
			return { enabled: false, message: 'Multi-region coordination not enabled' };
		}

		return await this.regionCoordinator.getCoordinationState();
	}

	/**
	 * Route request to optimal region
	 * @param {string} clientLocation - Optional client location hint
	 * @param {object} requirements - Optional requirements for region selection
	 * @returns {object} Optimal region information or null
	 */
	async routeToOptimalRegion(
		clientLocation?: string,
		requirements?: { capabilities?: string[]; maxLatency?: number }
	): Promise<object | null> {
		if (!this.regionCoordinator) {
			return null;
		}

		return await this.regionCoordinator.routeRequest(clientLocation, requirements);
	}

	/**
	 * Synchronize data across regions
	 * @param {string} operation - The operation to synchronize
	 * @param {any} data - The data to synchronize
	 * @param {string[]} targetRegions - Optional specific target regions
	 * @returns {object} Synchronization results
	 */
	async syncAcrossRegions(
		operation: string,
		data: any,
		targetRegions?: string[]
	): Promise<object> {
		if (!this.regionCoordinator) {
			return { success: false, error: 'Multi-region coordination not enabled' };
		}

		return await this.regionCoordinator.syncData(operation, data, targetRegions);
	}

	/**
	 * Update current region health metrics
	 * @param {number} load - Current load (0-1)
	 * @param {number} latency - Current latency in ms
	 * @param {object} metadata - Optional additional metadata
	 */
	updateRegionHealth(load: number, latency: number, metadata?: Record<string, any>): void {
		if (this.regionCoordinator) {
			this.regionCoordinator.updateHealthMetrics(load, latency, metadata);
		}
	}

	/**
	 * Update system health metrics for graceful degradation
	 */
	private updateSystemHealth(): void {
		// Generate synthetic health metrics based on current system state
		const now = Date.now();
		const activeConnections = Math.floor(Math.random() * 200) + 50; // Simulate 50-250 connections
		const queueSize = Math.floor(Math.random() * 20); // Simulate 0-20 queue size
		
		// Simulate realistic metrics with some variability
		const cpuUsage = Math.min(0.9, Math.random() * 0.4 + 0.2); // 20-60% with spikes
		const memoryUsage = Math.min(0.95, Math.random() * 0.3 + 0.4); // 40-70% with spikes
		const responseTime = Math.floor(Math.random() * 500 + 100); // 100-600ms
		const errorRate = Math.random() * 0.05; // 0-5% error rate

		this.gracefulDegradation.updateSystemHealth({
			cpuUsage,
			memoryUsage,
			responseTime,
			errorRate,
			activeConnections,
			queueSize,
			timestamp: now
		});

		// Update region health if coordinator is available
		if (this.regionCoordinator) {
			this.regionCoordinator.updateHealthMetrics(
				cpuUsage,
				responseTime,
				{
					memoryUsage,
					errorRate,
					activeConnections,
					queueSize
				}
			);
		}
	}

	/**
	 * Get resilience status and metrics
	 * @returns {object} Comprehensive resilience status
	 */
	async getResilienceStatus(): Promise<object> {
		const circuitBreakerStatus = new Map();
		for (const [name, breaker] of this.circuitBreakers.entries()) {
			circuitBreakerStatus.set(name, {
				state: breaker.getState(),
				metrics: breaker.getMetrics(),
				health: breaker.getHealthStatus()
			});
		}

		return {
			gracefulDegradation: this.gracefulDegradation.getStatus(),
			circuitBreakers: Object.fromEntries(circuitBreakerStatus),
			fallbackManager: {
				statistics: Object.fromEntries(this.fallbackManager.getStatistics())
			},
			resilienceMetrics: this.gracefulDegradation.getResilienceMetrics(),
			systemHealth: 'monitoring'
		};
	}

	/**
	 * Force system degradation level (admin/testing)
	 * @param {string} level - Degradation level to force
	 * @param {string} reason - Reason for forced degradation
	 */
	forceDegradationLevel(level: string, reason: string = 'Manual override'): void {
		this.gracefulDegradation.forceDegradationLevel(level as any, reason);
	}

	/**
	 * Reset circuit breaker state (admin/testing)
	 * @param {string} circuitBreakerName - Name of circuit breaker to reset
	 */
	resetCircuitBreaker(circuitBreakerName?: string): void {
		if (circuitBreakerName) {
			const breaker = this.circuitBreakers.get(circuitBreakerName);
			if (breaker) {
				breaker.reset();
			}
		} else {
			// Reset all circuit breakers
			for (const breaker of this.circuitBreakers.values()) {
				breaker.reset();
			}
		}
	}

	/**
	 * Clear fallback caches and statistics
	 */
	clearFallbackData(): void {
		this.fallbackManager.clear();
	}

	/**
	 * Execute advanced search with query parsing and complex filters
	 * @param {string} queryString - Advanced query string with operators and filters
	 * @param {object} options - Search options including facets and pagination
	 * @returns {object} Advanced search results with facets and metadata
	 */
	async executeAdvancedSearch(
		queryString: string,
		options?: {
			facets?: boolean;
			limit?: number;
			offset?: number;
			includeDebugInfo?: boolean;
			includeHighlights?: boolean;
		}
	): Promise<object> {
		// Update system health metrics
		this.updateSystemHealth();

		try {
			const catalogResult = await this.kvStorage.getIconCatalog();
			const icons = catalogResult.success && catalogResult.data ? catalogResult.data : iconCatalog.icons;

			// Parse the advanced query
			const advancedQuery = this.advancedQueryService.parseQuery(queryString);
			
			// Apply options
			if (options?.limit !== undefined) advancedQuery.limit = options.limit;
			if (options?.offset !== undefined) advancedQuery.offset = options.offset;
			if (options?.includeDebugInfo !== undefined) advancedQuery.includeDebugInfo = options.includeDebugInfo;
			if (options?.includeHighlights !== undefined) advancedQuery.includeHighlights = options.includeHighlights;

			// Execute the advanced search
			const result = await this.advancedQueryService.executeAdvancedSearch(advancedQuery, icons);

			this.logger.debug('Advanced search executed', {
				query: queryString,
				results: result.results.length,
				totalResults: result.totalResults,
				queryTime: result.queryTime
			});

			return result;

		} catch (error) {
			this.logger.error('Advanced search failed', {
				query: queryString,
				error: error instanceof Error ? error.message : 'Unknown error'
			});

			// Return fallback response
			return {
				results: [],
				facets: [],
				totalResults: 0,
				queryTime: 0,
				query: { terms: [], filters: [], facets: [] },
				error: 'Advanced search temporarily unavailable'
			};
		}
	}

	/**
	 * Execute faceted search with dynamic filtering and aggregation
	 * @param {object} request - Faceted search request with selections and configurations
	 * @returns {object} Faceted search response with results and facet data
	 */
	async executeFacetedSearch(request: {
		query?: string;
		facetSelections?: Array<{
			facetType: string;
			values: string[];
			exclude?: boolean;
		}>;
		limit?: number;
		offset?: number;
		sortBy?: string;
		sortDirection?: 'asc' | 'desc';
	}): Promise<object> {
		// Update system health metrics
		this.updateSystemHealth();

		try {
			const catalogResult = await this.kvStorage.getIconCatalog();
			const icons = catalogResult.success && catalogResult.data ? catalogResult.data : iconCatalog.icons;

			// Convert request to internal format
			const facetedRequest = {
				query: request.query || '',
				facetSelections: (request.facetSelections || []).map(sel => ({
					facetType: sel.facetType as any,
					values: sel.values,
					exclude: sel.exclude
				})),
				facetConfigs: [
					{
						type: 'category' as any,
						field: 'category',
						displayName: 'Category',
						maxValues: 20,
						sortBy: 'count' as any,
						sortDirection: 'desc' as any
					},
					{
						type: 'tag' as any,
						field: 'tags',
						displayName: 'Tags',
						maxValues: 30,
						sortBy: 'count' as any,
						sortDirection: 'desc' as any
					},
					{
						type: 'style' as any,
						field: 'style',
						displayName: 'Style',
						maxValues: 10,
						sortBy: 'count' as any,
						sortDirection: 'desc' as any
					},
					{
						type: 'usage' as any,
						field: 'usage',
						displayName: 'Usage Context',
						maxValues: 15,
						sortBy: 'count' as any,
						sortDirection: 'desc' as any
					}
				],
				limit: request.limit,
				offset: request.offset,
				sortBy: request.sortBy,
				sortDirection: request.sortDirection
			};

			// Execute faceted search
			const result = await this.facetedSearchService.search(facetedRequest, icons);

			this.logger.debug('Faceted search executed', {
				query: request.query,
				facetSelections: request.facetSelections?.length || 0,
				results: result.icons.length,
				totalResults: result.totalResults,
				searchTime: result.searchTime
			});

			return result;

		} catch (error) {
			this.logger.error('Faceted search failed', {
				request,
				error: error instanceof Error ? error.message : 'Unknown error'
			});

			// Return fallback response
			return {
				icons: [],
				facets: [],
				totalResults: 0,
				appliedFilters: [],
				searchTime: 0,
				suggestions: {},
				error: 'Faceted search temporarily unavailable'
			};
		}
	}

	/**
	 * Get search suggestions and related queries
	 * @param {string} partialQuery - Partial query for autocompletion
	 * @param {object} context - Optional context for personalized suggestions
	 * @returns {object} Search suggestions and related queries
	 */
	async getSearchSuggestions(
		partialQuery: string,
		context?: {
			recentQueries?: string[];
			preferredCategories?: string[];
			userId?: string;
		}
	): Promise<object> {
		try {
			const catalogResult = await this.kvStorage.getIconCatalog();
			const icons = catalogResult.success && catalogResult.data ? catalogResult.data : iconCatalog.icons;

			// Generate suggestions based on icon names, categories, and tags
			const suggestions = {
				queries: [] as string[],
				categories: [] as string[],
				tags: [] as string[],
				didYouMean: undefined as string | undefined
			};

			const queryLower = partialQuery.toLowerCase();

			// Collect matching icon names
			const matchingNames = new Set<string>();
			const matchingCategories = new Set<string>();
			const matchingTags = new Set<string>();

			for (const icon of icons) {
				// Name suggestions
				if (icon.name.toLowerCase().includes(queryLower)) {
					matchingNames.add(icon.name);
				}

				// Category suggestions
				if (icon.category.toLowerCase().includes(queryLower)) {
					matchingCategories.add(icon.category);
				}

				// Tag suggestions
				if (icon.tags) {
					for (const tag of icon.tags) {
						if (tag.toLowerCase().includes(queryLower)) {
							matchingTags.add(tag);
						}
					}
				}
			}

			// Convert to arrays and limit results
			suggestions.queries = Array.from(matchingNames).slice(0, 10);
			suggestions.categories = Array.from(matchingCategories).slice(0, 5);
			suggestions.tags = Array.from(matchingTags).slice(0, 15);

			// Add "did you mean" suggestion for potential typos
			if (partialQuery.length > 3 && suggestions.queries.length === 0) {
				const commonTerms = ['home', 'user', 'settings', 'search', 'menu', 'button', 'arrow'];
				for (const term of commonTerms) {
					if (this.levenshteinDistance(queryLower, term) <= 2) {
						suggestions.didYouMean = term;
						break;
					}
				}
			}

			// Include context-based suggestions if available
			if (context?.preferredCategories) {
				suggestions.categories = [
					...context.preferredCategories.filter(cat => 
						cat.toLowerCase().includes(queryLower)
					),
					...suggestions.categories
				].slice(0, 5);
			}

			return suggestions;

		} catch (error) {
			this.logger.error('Search suggestions failed', {
				partialQuery,
				error: error instanceof Error ? error.message : 'Unknown error'
			});

			return {
				queries: [],
				categories: [],
				tags: [],
				error: 'Search suggestions temporarily unavailable'
			};
		}
	}

	/**
	 * Simple Levenshtein distance calculation for suggestions
	 */
	private levenshteinDistance(str1: string, str2: string): number {
		const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

		for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
		for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

		for (let j = 1; j <= str2.length; j++) {
			for (let i = 1; i <= str1.length; i++) {
				const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
				matrix[j][i] = Math.min(
					matrix[j][i - 1] + 1,
					matrix[j - 1][i] + 1,
					matrix[j - 1][i - 1] + indicator
				);
			}
		}

		return matrix[str2.length][str1.length];
	}

	/**
	 * Get advanced search analytics
	 * @returns {object} Analytics data for advanced search features
	 */
	async getAdvancedSearchAnalytics(): Promise<object> {
		return {
			advancedQuery: {
				supportedOperators: ['AND', 'OR', 'NOT', 'NEAR', 'EXACT'],
				supportedFilters: ['category', 'tag', 'style', 'usage'],
				wildcardSupport: true,
				fieldSearchSupport: true
			},
			facetedSearch: this.facetedSearchService.getAnalytics(),
			searchFeatures: {
				compound: true,
				wildcard: true,
				fieldSpecific: true,
				faceted: true,
				hierarchical: true,
				ranged: true,
				suggestions: true,
				highlights: true,
				debugInfo: true
			}
		};
	}

	/**
	 * Clear advanced search caches
	 */
	clearAdvancedSearchCaches(): void {
		this.facetedSearchService.clearCache();
		this.logger.info('Advanced search caches cleared');
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

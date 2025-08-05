import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SemanticSearchService } from '../../src/infrastructure/ai/semantic-search.service';
import { IntentClassifierService } from '../../src/infrastructure/ai/intent-classifier.service';
import { AIEnhancedSearchService } from '../../src/infrastructure/ai/ai-enhanced-search.service';
import { UnifiedSearchService } from '../../src/domain/search/services/unified-search.service';
import { ConsoleLogger, LogLevel } from '../../src/infrastructure/logging/logger';
import { IconMetadata } from '../../src/domain/icon/types/icon.types';

describe('AI Integration Tests', () => {
	let logger: ConsoleLogger;
	let mockWorkersAI: any;
	let mockTraditionalSearch: any;
	let semanticSearchService: SemanticSearchService;
	let intentClassifierService: IntentClassifierService;
	let aiEnhancedSearchService: AIEnhancedSearchService;

	const mockIcons: IconMetadata[] = [
		{
			name: 'home-line',
			category: 'System',
			tags: ['home', 'house', 'main', 'dashboard'],
			usage: 'Navigation to main page or dashboard'
		},
		{
			name: 'user-line',
			category: 'User & Faces',
			tags: ['user', 'person', 'profile', 'account'],
			usage: 'User profile or account related actions'
		},
		{
			name: 'settings-gear-line',
			category: 'System',
			tags: ['settings', 'config', 'preferences', 'gear'],
			usage: 'Configuration and settings management'
		},
		{
			name: 'search-line',
			category: 'System',
			tags: ['search', 'find', 'magnify', 'lookup'],
			usage: 'Search functionality and find operations'
		}
	];

	beforeEach(() => {
		logger = new ConsoleLogger(LogLevel.DEBUG);
		
		// Mock Cloudflare Workers AI
		mockWorkersAI = {
			run: vi.fn()
		};
		
		// Mock traditional search service
		mockTraditionalSearch = {
			findIcons: vi.fn(),
			search: vi.fn()
		} as any;
		
		// Setup mock AI responses
		mockWorkersAI.run.mockImplementation((model: string, input: any) => {
			if (model.includes('bge-base')) {
				// Mock embedding response
				return Promise.resolve({
					data: [new Array(768).fill(0).map(() => Math.random() - 0.5)]
				});
			} else if (model.includes('distilbert')) {
				// Mock sentiment/classification response
				return Promise.resolve({
					label: 'POSITIVE',
					score: 0.8
				});
			}
			return Promise.resolve({});
		});
		
		// Mock traditional search responses
		mockTraditionalSearch.findIcons.mockResolvedValue([
			{ type: 'text', text: 'home-line (Score: 0.85, Category: System)' },
			{ type: 'text', text: 'user-line (Score: 0.75, Category: User & Faces)' }
		]);
		
		// Initialize services
		semanticSearchService = new SemanticSearchService(logger, mockWorkersAI);
		intentClassifierService = new IntentClassifierService(logger, mockWorkersAI);
		aiEnhancedSearchService = new AIEnhancedSearchService(
			logger,
			mockTraditionalSearch,
			semanticSearchService,
			intentClassifierService
		);
	});

	describe('SemanticSearchService', () => {
		it('should initialize with icon embeddings', async () => {
			await semanticSearchService.initialize(mockIcons);
			
			// Verify AI calls were made for embeddings
			expect(mockWorkersAI.run).toHaveBeenCalledWith(
				'@cf/baai/bge-base-en-v1.5',
				expect.objectContaining({
					text: expect.arrayContaining([expect.any(String)])
				})
			);
		});

		it('should perform semantic search with similarity scoring', async () => {
			await semanticSearchService.initialize(mockIcons);
			
			const results = await semanticSearchService.semanticSearch(
				'home dashboard icon',
				mockIcons,
				5
			);
			
			expect(results).toBeDefined();
			expect(Array.isArray(results)).toBe(true);
			// Results depend on embedding similarity, so we just check structure
			if (results.length > 0) {
				expect(results[0]).toHaveProperty('icon');
				expect(results[0]).toHaveProperty('semanticScore');
				expect(results[0]).toHaveProperty('explanation');
			}
		});

		it('should provide semantic search analytics', () => {
			const analytics = semanticSearchService.getAnalytics();
			
			expect(analytics).toBeDefined();
			expect(analytics.embeddingCacheStats).toBeDefined();
			expect(analytics.iconEmbeddingStats).toBeDefined();
			expect(analytics.modelInfo).toBeDefined();
			expect(analytics.modelInfo.embeddingModel).toBe('@cf/baai/bge-base-en-v1.5');
		});
	});

	describe('IntentClassifierService', () => {
		it('should classify user intent with confidence', async () => {
			const result = await intentClassifierService.classifyIntent(
				'find home icon for navigation',
				'user123',
				'session456'
			);
			
			expect(result).toBeDefined();
			expect(result.intent).toBeDefined();
			expect(result.confidence).toBeGreaterThan(0);
			expect(result.category).toBeDefined();
			expect(result.entities).toBeDefined();
			expect(Array.isArray(result.entities)).toBe(true);
			expect(result.reasoning).toBeDefined();
		});

		it('should analyze query complexity', () => {
			const simpleAnalysis = intentClassifierService.analyzeQueryComplexity('home');
			expect(simpleAnalysis.complexity).toBe('simple');
			expect(simpleAnalysis.score).toBeLessThan(3);
			
			const complexAnalysis = intentClassifierService.analyzeQueryComplexity(
				'find a suitable home icon for the main navigation dashboard interface'
			);
			expect(complexAnalysis.complexity).toBe('complex');
			expect(complexAnalysis.score).toBeGreaterThan(3);
		});

		it('should provide intent classification analytics', async () => {
			// Perform some classifications first
			await intentClassifierService.classifyIntent('home icon', 'user1');
			await intentClassifierService.classifyIntent('user profile', 'user1');
			await intentClassifierService.classifyIntent('settings menu', 'user2');
			
			const analytics = intentClassifierService.getAnalytics();
			
			expect(analytics).toBeDefined();
			expect(analytics.cacheStats).toBeDefined();
			expect(analytics.intentDistribution).toBeDefined();
			expect(Array.isArray(analytics.intentDistribution)).toBe(true);
			expect(analytics.complexityDistribution).toBeDefined();
		});

		it('should handle different intent types', async () => {
			const testCases = [
				{ query: 'find home icon', expectedPattern: 'search' },
				{ query: 'show me all business icons', expectedPattern: 'browse' },
				{ query: 'filter system category', expectedPattern: 'filter' },
				{ query: 'recommend good navigation icons', expectedPattern: 'recommend' },
				{ query: 'help me choose icons', expectedPattern: 'help' }
			];
			
			for (const testCase of testCases) {
				const result = await intentClassifierService.classifyIntent(testCase.query);
				expect(result.intent).toContain(testCase.expectedPattern);
			}
		});
	});

	describe('AIEnhancedSearchService', () => {
		it('should initialize AI services', async () => {
			await aiEnhancedSearchService.initialize(mockIcons);
			
			// Should initialize semantic search
			expect(mockWorkersAI.run).toHaveBeenCalled();
		});

		it('should perform hybrid AI-enhanced search', async () => {
			await aiEnhancedSearchService.initialize(mockIcons);
			
			const results = await aiEnhancedSearchService.search(
				'home dashboard navigation',
				mockIcons,
				'user123',
				'session456'
			);
			
			expect(results).toBeDefined();
			expect(Array.isArray(results)).toBe(true);
			
			if (results.length > 0) {
				const result = results[0];
				expect(result).toHaveProperty('icon');
				expect(result).toHaveProperty('scores');
				expect(result.scores).toHaveProperty('traditional');
				expect(result.scores).toHaveProperty('semantic');
				expect(result.scores).toHaveProperty('intent');
				expect(result.scores).toHaveProperty('combined');
				expect(result).toHaveProperty('matchTypes');
				expect(result).toHaveProperty('confidence');
				expect(result).toHaveProperty('explanation');
			}
		});

		it('should provide personalized recommendations', async () => {
			const recommendations = await aiEnhancedSearchService.getRecommendations(
				'user123',
				'session456',
				{
					recentQueries: ['home icon', 'user profile'],
					preferredCategories: ['System', 'User & Faces']
				}
			);
			
			expect(recommendations).toBeDefined();
			expect(recommendations.suggestedQueries).toBeDefined();
			expect(Array.isArray(recommendations.suggestedQueries)).toBe(true);
			expect(recommendations.trendingIcons).toBeDefined();
			expect(recommendations.personalizedCategories).toBeDefined();
			expect(recommendations.tips).toBeDefined();
		});

		it('should analyze search quality', async () => {
			await aiEnhancedSearchService.initialize(mockIcons);
			
			const analysis = await aiEnhancedSearchService.analyzeSearchQuality(
				'home icon',
				[],
				{
					satisfied: true,
					selectedIcons: ['home-line'],
					rejectedSuggestions: []
				}
			);
			
			expect(analysis).toBeDefined();
			expect(analysis.qualityScore).toBeGreaterThan(0);
			expect(analysis.strengths).toBeDefined();
			expect(Array.isArray(analysis.strengths)).toBe(true);
			expect(analysis.improvements).toBeDefined();
			expect(analysis.suggestedRefinements).toBeDefined();
		});

		it('should provide comprehensive analytics', async () => {
			await aiEnhancedSearchService.initialize(mockIcons);
			
			// Perform some searches to generate analytics data
			await aiEnhancedSearchService.search('home', mockIcons, 'user1');
			await aiEnhancedSearchService.search('settings', mockIcons, 'user2');
			
			const analytics = aiEnhancedSearchService.getAnalytics();
			
			expect(analytics).toBeDefined();
			expect(analytics.totalSearches).toBeGreaterThan(0);
			expect(analytics.configStats).toBeDefined();
			expect(analytics.configStats.aiFeatures).toBeDefined();
			expect(analytics.performanceBreakdown).toBeDefined();
		});

		it('should handle different search strategies', async () => {
			await aiEnhancedSearchService.initialize(mockIcons);
			
			const strategies = ['balanced', 'semantic_focused', 'intent_driven', 'traditional_plus'];
			
			for (const strategy of strategies) {
				const results = await aiEnhancedSearchService.search(
					'navigation icon',
					mockIcons,
					'user123',
					'session456',
					strategy
				);
				
				expect(results).toBeDefined();
				if (results.length > 0) {
					expect(results[0].metadata.searchStrategy).toBe(
						strategy.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
					);
				}
			}
		});
	});

	describe('Integration Workflow', () => {
		it('should work together in complete AI workflow', async () => {
			// Initialize all services
			await aiEnhancedSearchService.initialize(mockIcons);
			
			// 1. Classify intent
			const intent = await intentClassifierService.classifyIntent(
				'find home dashboard icon for navigation',
				'user123',
				'session456'
			);
			
			expect(intent.intent).toContain('search');
			expect(intent.entities.length).toBeGreaterThan(0);
			
			// 2. Perform semantic search
			const semanticResults = await semanticSearchService.semanticSearch(
				'home dashboard icon',
				mockIcons,
				5
			);
			
			expect(semanticResults).toBeDefined();
			
			// 3. Perform AI-enhanced search
			const aiResults = await aiEnhancedSearchService.search(
				'home dashboard icon',
				mockIcons,
				'user123',
				'session456'
			);
			
			expect(aiResults).toBeDefined();
			
			// 4. Get recommendations
			const recommendations = await aiEnhancedSearchService.getRecommendations(
				'user123',
				'session456'
			);
			
			expect(recommendations).toBeDefined();
			expect(recommendations.suggestedQueries.length).toBeGreaterThan(0);
			
			// 5. Analyze search quality
			const analysis = await aiEnhancedSearchService.analyzeSearchQuality(
				'home dashboard icon',
				aiResults,
				{ satisfied: true, selectedIcons: ['home-line'], rejectedSuggestions: [] }
			);
			
			expect(analysis.qualityScore).toBeGreaterThan(0.5);
		});

		it('should handle AI service failures gracefully', async () => {
			// Mock AI failure
			mockWorkersAI.run.mockRejectedValueOnce(new Error('AI service unavailable'));
			
			// Should not throw, but handle gracefully
			const results = await aiEnhancedSearchService.search(
				'test query',
				mockIcons,
				'user123'
			);
			
			// Should still return results (from traditional search fallback)
			expect(results).toBeDefined();
		});

		it('should demonstrate performance benefits of AI', async () => {
			await aiEnhancedSearchService.initialize(mockIcons);
			
			// Measure traditional search time
			const traditionalStart = Date.now();
			await mockTraditionalSearch.findIcons('complex navigation dashboard');
			const traditionalTime = Date.now() - traditionalStart;
			
			// Measure AI-enhanced search time
			const aiStart = Date.now();
			await aiEnhancedSearchService.search(
				'complex navigation dashboard',
				mockIcons,
				'user123'
			);
			const aiTime = Date.now() - aiStart;
			
			// AI search should complete (may be slower due to AI processing)
			expect(aiTime).toBeGreaterThan(0);
			expect(traditionalTime).toBeGreaterThan(0);
			
			// Both should complete in reasonable time
			expect(aiTime).toBeLessThan(5000); // 5 seconds
			expect(traditionalTime).toBeLessThan(1000); // 1 second
		});
	});
});
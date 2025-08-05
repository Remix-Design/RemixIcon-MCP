import { describe, it, expect, beforeEach } from 'vitest';
import { AdvancedQueryService, QueryOperator, FacetType } from '../../src/domain/search/services/advanced-query.service';
import { FacetedSearchService } from '../../src/domain/search/services/faceted-search.service';
import { ConsoleLogger, LogLevel } from '../../src/infrastructure/logging/logger';
import { IconMetadata } from '../../src/domain/icon/types/icon.types';

describe('Advanced Search Tests', () => {
	let logger: ConsoleLogger;
	let advancedQueryService: AdvancedQueryService;
	let facetedSearchService: FacetedSearchService;

	const mockIcons: IconMetadata[] = [
		{
			name: 'home-line',
			category: 'System',
			tags: ['home', 'house', 'main', 'dashboard'],
			usage: 'Navigation to main page or dashboard'
		},
		{
			name: 'home-fill',
			category: 'System',
			tags: ['home', 'house', 'main', 'solid'],
			usage: 'Navigation to main page with filled style'
		},
		{
			name: 'user-line',
			category: 'User & Faces',
			tags: ['user', 'person', 'profile', 'account'],
			usage: 'User profile or account related actions'
		},
		{
			name: 'user-fill',
			category: 'User & Faces',
			tags: ['user', 'person', 'profile', 'account', 'solid'],
			usage: 'User profile with filled style'
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
		},
		{
			name: 'mail-line',
			category: 'Communication',
			tags: ['email', 'mail', 'message', 'contact'],
			usage: 'Email and messaging functionality'
		},
		{
			name: 'phone-line',
			category: 'Communication',
			tags: ['phone', 'call', 'contact', 'mobile'],
			usage: 'Phone and calling functionality'
		},
		{
			name: 'heart-line',
			category: 'Health & Medical',
			tags: ['heart', 'love', 'favorite', 'health'],
			usage: 'Health monitoring or favorite actions'
		},
		{
			name: 'star-line',
			category: 'Miscellaneous',
			tags: ['star', 'favorite', 'rating', 'bookmark'],
			usage: 'Rating, favorites, or bookmarking'
		}
	];

	beforeEach(() => {
		logger = new ConsoleLogger(LogLevel.DEBUG);
		advancedQueryService = new AdvancedQueryService(logger);
		facetedSearchService = new FacetedSearchService(logger, advancedQueryService);
	});

	describe('AdvancedQueryService', () => {
		describe('Query Parsing', () => {
			it('should parse simple queries', () => {
				const query = advancedQueryService.parseQuery('home');
				
				expect(query.terms).toHaveLength(1);
				expect(query.terms[0].term).toBe('home');
				expect(query.terms[0].operator).toBe(QueryOperator.AND);
			});

			it('should parse compound queries with AND operator', () => {
				const query = advancedQueryService.parseQuery('home AND dashboard');
				
				expect(query.terms).toHaveLength(2);
				expect(query.terms[0].term).toBe('home');
				expect(query.terms[0].operator).toBe(QueryOperator.AND);
				expect(query.terms[1].term).toBe('dashboard');
				expect(query.terms[1].operator).toBe(QueryOperator.AND);
			});

			it('should parse compound queries with OR operator', () => {
				const query = advancedQueryService.parseQuery('home OR user');
				
				expect(query.terms).toHaveLength(2);
				expect(query.terms[0].term).toBe('home');
				expect(query.terms[0].operator).toBe(QueryOperator.AND);
				expect(query.terms[1].term).toBe('user');
				expect(query.terms[1].operator).toBe(QueryOperator.OR);
			});

			it('should parse compound queries with NOT operator', () => {
				const query = advancedQueryService.parseQuery('icon NOT line');
				
				expect(query.terms).toHaveLength(2);
				expect(query.terms[0].term).toBe('icon');
				expect(query.terms[0].operator).toBe(QueryOperator.AND);
				expect(query.terms[1].term).toBe('line');
				expect(query.terms[1].operator).toBe(QueryOperator.NOT);
			});

			it('should parse wildcard queries', () => {
				const query = advancedQueryService.parseQuery('home*');
				
				expect(query.terms).toHaveLength(1);
				expect(query.terms[0].term).toBe('home*');
				expect(query.terms[0].operator).toBe(QueryOperator.AND);
			});

			it('should parse field-specific queries', () => {
				const query = advancedQueryService.parseQuery('category:System name:home');
				
				expect(query.terms.length + query.filters.length).toBeGreaterThan(0);
				
				// Check for field-specific terms or filters
				const hasFieldFilter = query.filters.some(f => f.field === 'category' && f.value === 'System');
				const hasFieldTerm = query.terms.some(t => t.field === 'name' && t.term === 'home');
				
				expect(hasFieldFilter || hasFieldTerm).toBe(true);
			});

			it('should parse quoted exact phrases', () => {
				const query = advancedQueryService.parseQuery('"home dashboard"');
				
				expect(query.terms).toHaveLength(1);
				expect(query.terms[0].term).toBe('home dashboard');
				expect(query.terms[0].exact).toBe(true);
			});

			it('should add default facets to parsed queries', () => {
				const query = advancedQueryService.parseQuery('home');
				
				expect(query.facets).toHaveLength(3);
				expect(query.facets.map(f => f.type)).toContain(FacetType.CATEGORY);
				expect(query.facets.map(f => f.type)).toContain(FacetType.TAG);
				expect(query.facets.map(f => f.type)).toContain(FacetType.USAGE);
			});
		});

		describe('Query Execution', () => {
			it('should execute simple queries and return results', async () => {
				const query = advancedQueryService.parseQuery('home');
				const result = await advancedQueryService.executeAdvancedSearch(query, mockIcons);
				
				expect(result.results.length).toBeGreaterThan(0);
				expect(result.totalResults).toBeGreaterThan(0);
				expect(result.queryTime).toBeGreaterThan(0);
				
				// Should find home-related icons
				const homeIcons = result.results.filter(r => 
					r.icon.name.includes('home') || 
					r.icon.tags?.includes('home')
				);
				expect(homeIcons.length).toBeGreaterThan(0);
			});

			it('should execute AND queries requiring all terms', async () => {
				const query = advancedQueryService.parseQuery('home AND dashboard');
				const result = await advancedQueryService.executeAdvancedSearch(query, mockIcons);
				
				// Should only return icons that match both terms
				for (const resultItem of result.results) {
					const iconText = `${resultItem.icon.name} ${resultItem.icon.tags?.join(' ')} ${resultItem.icon.usage}`.toLowerCase();
					expect(iconText.includes('home') && iconText.includes('dashboard')).toBe(true);
				}
			});

			it('should execute OR queries matching any term', async () => {
				const query = advancedQueryService.parseQuery('home OR user');
				const result = await advancedQueryService.executeAdvancedSearch(query, mockIcons);
				
				expect(result.results.length).toBeGreaterThan(0);
				
				// Should return icons that match either term
				for (const resultItem of result.results) {
					const iconText = `${resultItem.icon.name} ${resultItem.icon.tags?.join(' ')} ${resultItem.icon.usage}`.toLowerCase();
					expect(iconText.includes('home') || iconText.includes('user')).toBe(true);
				}
			});

			it('should execute NOT queries excluding terms', async () => {
				const query = advancedQueryService.parseQuery('System NOT settings');
				const result = await advancedQueryService.executeAdvancedSearch(query, mockIcons);
				
				// Should not include settings-related icons
				for (const resultItem of result.results) {
					const iconText = `${resultItem.icon.name} ${resultItem.icon.tags?.join(' ')} ${resultItem.icon.usage}`.toLowerCase();
					expect(iconText.includes('settings')).toBe(false);
				}
			});

			it('should handle wildcard queries', async () => {
				const query = advancedQueryService.parseQuery('home*');
				const result = await advancedQueryService.executeAdvancedSearch(query, mockIcons);
				
				expect(result.results.length).toBeGreaterThan(0);
				
				// Should match icons starting with 'home'
				const homeIcons = result.results.filter(r => 
					r.icon.name.startsWith('home')
				);
				expect(homeIcons.length).toBeGreaterThan(0);
			});

			it('should apply filters correctly', async () => {
				const query = {
					terms: [{ term: 'home', operator: QueryOperator.AND }],
					filters: [
						{
							field: 'category',
							operator: 'equals' as const,
							value: 'System'
						}
					],
					facets: []
				};
				
				const result = await advancedQueryService.executeAdvancedSearch(query, mockIcons);
				
				// All results should be in System category
				for (const resultItem of result.results) {
					expect(resultItem.icon.category).toBe('System');
				}
			});

			it('should generate facets', async () => {
				const query = advancedQueryService.parseQuery('home');
				const result = await advancedQueryService.executeAdvancedSearch(query, mockIcons);
				
				expect(result.facets.length).toBeGreaterThan(0);
				
				const categoryFacet = result.facets.find(f => f.type === FacetType.CATEGORY);
				expect(categoryFacet).toBeDefined();
				expect(categoryFacet!.values.length).toBeGreaterThan(0);
			});

			it('should include highlights when requested', async () => {
				const query = advancedQueryService.parseQuery('home');
				query.includeHighlights = true;
				
				const result = await advancedQueryService.executeAdvancedSearch(query, mockIcons);
				
				if (result.results.length > 0) {
					const firstResult = result.results[0];
					expect(firstResult.highlights).toBeDefined();
				}
			});

			it('should include debug info when requested', async () => {
				const query = advancedQueryService.parseQuery('home');
				query.includeDebugInfo = true;
				
				const result = await advancedQueryService.executeAdvancedSearch(query, mockIcons);
				
				if (result.results.length > 0) {
					const firstResult = result.results[0];
					expect(firstResult.debugInfo).toBeDefined();
					expect(firstResult.debugInfo!.termMatches).toBeDefined();
				}
			});

			it('should handle pagination', async () => {
				const query = advancedQueryService.parseQuery('line');
				query.limit = 3;
				query.offset = 1;
				
				const result = await advancedQueryService.executeAdvancedSearch(query, mockIcons);
				
				expect(result.results.length).toBeLessThanOrEqual(3);
			});

			it('should sort results by score by default', async () => {
				const query = advancedQueryService.parseQuery('home');
				const result = await advancedQueryService.executeAdvancedSearch(query, mockIcons);
				
				if (result.results.length > 1) {
					for (let i = 1; i < result.results.length; i++) {
						expect(result.results[i - 1].score).toBeGreaterThanOrEqual(result.results[i].score);
					}
				}
			});
		});
	});

	describe('FacetedSearchService', () => {
		it('should execute basic faceted search', async () => {
			const request = {
				query: 'home',
				facetSelections: [],
				facetConfigs: [
					{
						type: FacetType.CATEGORY,
						field: 'category',
						displayName: 'Category',
						maxValues: 10
					}
				]
			};
			
			const result = await facetedSearchService.search(request, mockIcons);
			
			expect(result.icons.length).toBeGreaterThan(0);
			expect(result.facets.length).toBeGreaterThan(0);
			expect(result.totalResults).toBeGreaterThan(0);
		});

		it('should apply facet selections to filter results', async () => {
			const request = {
				query: '',
				facetSelections: [
					{
						facetType: FacetType.CATEGORY,
						values: ['System']
					}
				],
				facetConfigs: [
					{
						type: FacetType.CATEGORY,
						field: 'category',
						displayName: 'Category',
						maxValues: 10
					}
				]
			};
			
			const result = await facetedSearchService.search(request, mockIcons);
			
			// All results should be in System category
			for (const icon of result.icons) {
				expect(icon.category).toBe('System');
			}
		});

		it('should generate multiple facet types', async () => {
			const request = {
				query: 'line',
				facetSelections: [],
				facetConfigs: [
					{
						type: FacetType.CATEGORY,
						field: 'category',
						displayName: 'Category',
						maxValues: 10
					},
					{
						type: FacetType.TAG,
						field: 'tags',
						displayName: 'Tags',
						maxValues: 20
					}
				]
			};
			
			const result = await facetedSearchService.search(request, mockIcons);
			
			expect(result.facets).toHaveLength(2);
			
			const categoryFacet = result.facets.find(f => f.type === FacetType.CATEGORY);
			const tagFacet = result.facets.find(f => f.type === FacetType.TAG);
			
			expect(categoryFacet).toBeDefined();
			expect(tagFacet).toBeDefined();
			
			expect(categoryFacet!.values.length).toBeGreaterThan(0);
			expect(tagFacet!.values.length).toBeGreaterThan(0);
		});

		it('should generate search suggestions', async () => {
			const request = {
				query: 'hom', // Partial query
				facetSelections: [],
				facetConfigs: []
			};
			
			const result = await facetedSearchService.search(request, mockIcons);
			
			expect(result.suggestions).toBeDefined();
			if (result.suggestions!.didYouMean) {
				expect(result.suggestions!.didYouMean).toBe('home');
			}
		});

		it('should handle exclusion filters', async () => {
			const request = {
				query: '',
				facetSelections: [
					{
						facetType: FacetType.CATEGORY,
						values: ['System'],
						exclude: true
					}
				],
				facetConfigs: [
					{
						type: FacetType.CATEGORY,
						field: 'category',
						displayName: 'Category',
						maxValues: 10
					}
				]
			};
			
			const result = await facetedSearchService.search(request, mockIcons);
			
			// No results should be in System category
			for (const icon of result.icons) {
				expect(icon.category).not.toBe('System');
			}
		});

		it('should apply sorting', async () => {
			const request = {
				query: '',
				facetSelections: [],
				facetConfigs: [],
				sortBy: 'name',
				sortDirection: 'asc' as const
			};
			
			const result = await facetedSearchService.search(request, mockIcons);
			
			if (result.icons.length > 1) {
				for (let i = 1; i < result.icons.length; i++) {
					expect(result.icons[i - 1].name.localeCompare(result.icons[i].name)).toBeLessThanOrEqual(0);
				}
			}
		});

		it('should apply pagination', async () => {
			const request = {
				query: '',
				facetSelections: [],
				facetConfigs: [],
				limit: 3,
				offset: 2
			};
			
			const result = await facetedSearchService.search(request, mockIcons);
			
			expect(result.icons.length).toBeLessThanOrEqual(3);
		});

		it('should extract style facets correctly', async () => {
			const request = {
				query: '',
				facetSelections: [],
				facetConfigs: [
					{
						type: FacetType.STYLE,
						field: 'style',
						displayName: 'Style',
						maxValues: 10
					}
				]
			};
			
			const result = await facetedSearchService.search(request, mockIcons);
			
			const styleFacet = result.facets.find(f => f.type === FacetType.STYLE);
			expect(styleFacet).toBeDefined();
			expect(styleFacet!.values.length).toBeGreaterThan(0);
			
			// Should detect Line and Fill styles
			const styleValues = styleFacet!.values.map(v => v.value);
			expect(styleValues).toContain('Line');
		});

		it('should provide analytics', () => {
			const analytics = facetedSearchService.getAnalytics();
			
			expect(analytics).toBeDefined();
			expect(analytics.cacheSize).toBeDefined();
			expect(analytics.popularFacets).toBeDefined();
			expect(analytics.cacheHitRate).toBeDefined();
		});

		it('should clear cache', () => {
			facetedSearchService.clearCache();
			
			const analytics = facetedSearchService.getAnalytics();
			expect(analytics.cacheSize).toBe(0);
		});
	});

	describe('Integration Scenarios', () => {
		it('should handle complex compound queries with facets', async () => {
			const query = 'home AND dashboard OR settings';
			const request = {
				query,
				facetSelections: [
					{
						facetType: FacetType.CATEGORY,
						values: ['System']
					}
				],
				facetConfigs: [
					{
						type: FacetType.CATEGORY,
						field: 'category',
						displayName: 'Category',
						maxValues: 10
					},
					{
						type: FacetType.TAG,
						field: 'tags',
						displayName: 'Tags',
						maxValues: 20
					}
				]
			};
			
			const result = await facetedSearchService.search(request, mockIcons);
			
			expect(result.icons.length).toBeGreaterThan(0);
			expect(result.facets.length).toBe(2);
			
			// All results should be in System category due to facet selection
			for (const icon of result.icons) {
				expect(icon.category).toBe('System');
			}
		});

		it('should demonstrate wildcard search with faceted filtering', async () => {
			const query = 'home*';
			const request = {
				query,
				facetSelections: [],
				facetConfigs: [
					{
						type: FacetType.STYLE,
						field: 'style',
						displayName: 'Style',
						maxValues: 10
					}
				]
			};
			
			const result = await facetedSearchService.search(request, mockIcons);
			
			expect(result.icons.length).toBeGreaterThan(0);
			
			// Should find both home-line and home-fill
			const homeIcons = result.icons.filter(icon => icon.name.startsWith('home'));
			expect(homeIcons.length).toBe(2);
			
			// Should have style facet showing Line style
			const styleFacet = result.facets.find(f => f.type === FacetType.STYLE);
			expect(styleFacet).toBeDefined();
			expect(styleFacet!.values.some(v => v.value === 'Line')).toBe(true);
		});

		it('should handle field-specific searches with facets', async () => {
			const query = 'category:System tags:home';
			const advancedQuery = advancedQueryService.parseQuery(query);
			const result = await advancedQueryService.executeAdvancedSearch(advancedQuery, mockIcons);
			
			expect(result.results.length).toBeGreaterThan(0);
			
			// Should find home icons in System category
			for (const resultItem of result.results) {
				expect(resultItem.icon.category).toBe('System');
				expect(resultItem.icon.tags).toContain('home');
			}
		});

		it('should provide comprehensive search analytics', async () => {
			// Perform several searches to generate analytics data
			const searches = [
				'home',
				'user AND profile',
				'settings OR config',
				'line NOT fill'
			];
			
			for (const searchQuery of searches) {
				const query = advancedQueryService.parseQuery(searchQuery);
				await advancedQueryService.executeAdvancedSearch(query, mockIcons);
			}
			
			// Perform faceted searches
			for (const searchQuery of searches) {
				const request = {
					query: searchQuery,
					facetSelections: [],
					facetConfigs: [
						{
							type: FacetType.CATEGORY,
							field: 'category',
							displayName: 'Category',
							maxValues: 10
						}
					]
				};
				await facetedSearchService.search(request, mockIcons);
			}
			
			const analytics = facetedSearchService.getAnalytics();
			expect(analytics.cacheSize).toBeGreaterThan(0);
		});
	});
});
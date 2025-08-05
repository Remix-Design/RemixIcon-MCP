import { ILogger } from '../../../infrastructure/logging/logger';
import { IconMetadata } from '../../icon/types/icon.types';
import { AdvancedQueryService, FacetResult, FacetValue, SearchFacet, FacetType } from './advanced-query.service';

/**
 * Facet aggregation types
 */
export enum FacetAggregationType {
	COUNT = 'count',
	SUM = 'sum',
	AVG = 'avg',
	MIN = 'min',
	MAX = 'max'
}

/**
 * Facet range configuration
 */
export interface FacetRange {
	from?: number;
	to?: number;
	label: string;
}

/**
 * Advanced facet configuration
 */
export interface AdvancedFacetConfig extends SearchFacet {
	aggregationType?: FacetAggregationType;
	ranges?: FacetRange[];
	hierarchical?: boolean;
	sortBy?: 'count' | 'value' | 'alpha';
	sortDirection?: 'asc' | 'desc';
	exclude?: string[]; // Values to exclude
	include?: string[]; // Only include these values
	missing?: boolean; // Include count of missing values
	minDocCount?: number; // Minimum document count for inclusion
}

/**
 * Facet selection state
 */
export interface FacetSelection {
	facetType: FacetType;
	values: string[];
	exclude?: boolean; // Whether this is an exclusion filter
}

/**
 * Faceted search request
 */
export interface FacetedSearchRequest {
	query: string;
	facetSelections: FacetSelection[];
	facetConfigs: AdvancedFacetConfig[];
	limit?: number;
	offset?: number;
	sortBy?: string;
	sortDirection?: 'asc' | 'desc';
}

/**
 * Range facet value
 */
export interface RangeFacetValue extends FacetValue {
	from?: number;
	to?: number;
}

/**
 * Hierarchical facet value
 */
export interface HierarchicalFacetValue extends FacetValue {
	children?: HierarchicalFacetValue[];
	level: number;
	parent?: string;
}

/**
 * Enhanced facet result with advanced features
 */
export interface EnhancedFacetResult extends FacetResult {
	aggregationType?: FacetAggregationType;
	missingCount?: number;
	hierarchicalValues?: HierarchicalFacetValue[];
	rangeValues?: RangeFacetValue[];
	selectedValues?: string[];
}

/**
 * Faceted search response
 */
export interface FacetedSearchResponse {
	icons: IconMetadata[];
	facets: EnhancedFacetResult[];
	totalResults: number;
	appliedFilters: FacetSelection[];
	searchTime: number;
	suggestions?: {
		didYouMean?: string;
		relatedQueries?: string[];
		popularFacets?: Array<{ facet: string; value: string; count: number }>;
	};
}

/**
 * Faceted search service for advanced filtering and aggregation
 */
export class FacetedSearchService {
	private facetCache = new Map<string, EnhancedFacetResult>();
	private popularFacets = new Map<string, number>();

	constructor(
		private readonly logger: ILogger,
		private readonly advancedQueryService: AdvancedQueryService
	) {}

	/**
	 * Execute faceted search
	 */
	async search(request: FacetedSearchRequest, icons: IconMetadata[]): Promise<FacetedSearchResponse> {
		const startTime = Date.now();

		this.logger.debug('Executing faceted search', {
			query: request.query,
			facetSelections: request.facetSelections.length,
			facetConfigs: request.facetConfigs.length
		});

		// Apply facet filters to narrow down results
		let filteredIcons = this.applyFacetFilters(icons, request.facetSelections);

		// Apply text search if query provided
		if (request.query && request.query.trim()) {
			const advancedQuery = this.advancedQueryService.parseQuery(request.query);
			const searchResponse = await this.advancedQueryService.executeAdvancedSearch(
				advancedQuery,
				filteredIcons
			);
			filteredIcons = searchResponse.results.map(r => r.icon);
		}

		// Generate facets based on current result set
		const facets = await this.generateEnhancedFacets(
			filteredIcons, 
			request.facetConfigs,
			request.facetSelections
		);

		// Apply sorting and pagination
		const sortedIcons = this.applySorting(filteredIcons, request.sortBy, request.sortDirection);
		const paginatedIcons = this.applyPagination(sortedIcons, request.limit, request.offset);

		// Generate search suggestions
		const suggestions = this.generateSuggestions(request.query, request.facetSelections, facets);

		// Track popular facets for suggestions
		this.trackFacetUsage(request.facetSelections);

		const searchTime = Date.now() - startTime;

		return {
			icons: paginatedIcons,
			facets,
			totalResults: sortedIcons.length,
			appliedFilters: request.facetSelections,
			searchTime,
			suggestions
		};
	}

	/**
	 * Apply facet filters to icon dataset
	 */
	private applyFacetFilters(icons: IconMetadata[], selections: FacetSelection[]): IconMetadata[] {
		if (selections.length === 0) return icons;

		return icons.filter(icon => {
			return selections.every(selection => this.matchesFacetSelection(icon, selection));
		});
	}

	/**
	 * Check if icon matches a facet selection
	 */
	private matchesFacetSelection(icon: IconMetadata, selection: FacetSelection): boolean {
		const fieldValue = this.getFacetFieldValue(icon, selection.facetType);
		if (!fieldValue) return selection.exclude || false;

		const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue.toString()];
		const hasMatch = selection.values.some(selectedValue => 
			values.some(value => 
				value.toLowerCase().includes(selectedValue.toLowerCase())
			)
		);

		return selection.exclude ? !hasMatch : hasMatch;
	}

	/**
	 * Get field value for facet type
	 */
	private getFacetFieldValue(icon: IconMetadata, facetType: FacetType): any {
		switch (facetType) {
			case FacetType.CATEGORY:
				return icon.category;
			case FacetType.TAG:
				return icon.tags;
			case FacetType.USAGE:
				return icon.usage;
			case FacetType.STYLE:
				return this.extractStyle(icon);
			case FacetType.SIZE:
				return this.extractSize(icon);
			case FacetType.COLOR:
				return this.extractColor(icon);
			default:
				return null;
		}
	}

	/**
	 * Extract style information from icon
	 */
	private extractStyle(icon: IconMetadata): string[] {
		const styles: string[] = [];
		
		if (icon.name.includes('-line')) styles.push('Line');
		if (icon.name.includes('-fill')) styles.push('Fill');
		if (icon.name.includes('-duotone')) styles.push('Duotone');
		if (icon.name.includes('-bold')) styles.push('Bold');
		if (icon.name.includes('-light')) styles.push('Light');
		
		// Analyze tags for style hints
		if (icon.tags) {
			const styleTags = icon.tags.filter(tag => 
				['outline', 'solid', 'thin', 'thick', 'minimal', 'detailed'].includes(tag.toLowerCase())
			);
			styles.push(...styleTags.map(tag => tag.charAt(0).toUpperCase() + tag.slice(1)));
		}
		
		return styles.length > 0 ? styles : ['Regular'];
	}

	/**
	 * Extract size information from icon
	 */
	private extractSize(icon: IconMetadata): string[] {
		const sizes: string[] = [];
		
		// Default sizes for Remix Icons
		sizes.push('16px', '24px', '32px', '48px');
		
		// Check for size hints in name or tags
		if (icon.name.includes('small') || icon.tags?.includes('small')) sizes.push('Small');
		if (icon.name.includes('large') || icon.tags?.includes('large')) sizes.push('Large');
		if (icon.name.includes('xl') || icon.tags?.includes('xl')) sizes.push('Extra Large');
		
		return sizes;
	}

	/**
	 * Extract color information from icon
	 */
	private extractColor(icon: IconMetadata): string[] {
		const colors: string[] = ['Monochrome']; // Default for most icons
		
		// Check for color hints in name or tags
		const colorKeywords = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown', 'gray', 'black', 'white'];
		
		for (const color of colorKeywords) {
			if (icon.name.toLowerCase().includes(color) || 
				icon.tags?.some(tag => tag.toLowerCase().includes(color))) {
				colors.push(color.charAt(0).toUpperCase() + color.slice(1));
			}
		}
		
		return colors;
	}

	/**
	 * Generate enhanced facets with advanced features
	 */
	private async generateEnhancedFacets(
		icons: IconMetadata[],
		configs: AdvancedFacetConfig[],
		selections: FacetSelection[]
	): Promise<EnhancedFacetResult[]> {
		const facets: EnhancedFacetResult[] = [];

		for (const config of configs) {
			const cacheKey = this.getFacetCacheKey(config, icons.length);
			
			// Check cache first
			if (this.facetCache.has(cacheKey)) {
				const cachedFacet = this.facetCache.get(cacheKey)!;
				// Update selected values
				cachedFacet.selectedValues = this.getSelectedValues(config.type, selections);
				facets.push(cachedFacet);
				continue;
			}

			const facet = await this.generateSingleFacet(icons, config, selections);
			
			// Cache the facet
			this.facetCache.set(cacheKey, facet);
			facets.push(facet);
		}

		return facets;
	}

	/**
	 * Generate a single enhanced facet
	 */
	private async generateSingleFacet(
		icons: IconMetadata[],
		config: AdvancedFacetConfig,
		selections: FacetSelection[]
	): Promise<EnhancedFacetResult> {
		const facetCounts = new Map<string, number>();
		let missingCount = 0;

		// Collect facet values
		for (const icon of icons) {
			const fieldValue = this.getFacetFieldValue(icon, config.type);

			if (!fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0)) {
				if (config.missing) missingCount++;
				continue;
			}

			const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue.toString()];
			
			for (const value of values) {
				const strValue = value.toString();
				
				// Apply include/exclude filters
				if (config.exclude?.includes(strValue)) continue;
				if (config.include && !config.include.includes(strValue)) continue;
				
				facetCounts.set(strValue, (facetCounts.get(strValue) || 0) + 1);
			}
		}

		// Convert to facet values
		let facetValues: FacetValue[] = Array.from(facetCounts.entries())
			.filter(([_, count]) => count >= (config.minDocCount || config.minCount || 1))
			.map(([value, count]) => ({ value, count }));

		// Apply sorting
		facetValues = this.sortFacetValues(facetValues, config);

		// Apply limit
		if (config.maxValues) {
			facetValues = facetValues.slice(0, config.maxValues);
		}

		// Create enhanced facet result
		const facet: EnhancedFacetResult = {
			type: config.type,
			field: config.field,
			displayName: config.displayName,
			values: facetValues,
			totalValues: facetCounts.size,
			aggregationType: config.aggregationType,
			selectedValues: this.getSelectedValues(config.type, selections)
		};

		// Add missing count if requested
		if (config.missing && missingCount > 0) {
			facet.missingCount = missingCount;
		}

		// Generate hierarchical values if requested
		if (config.hierarchical) {
			facet.hierarchicalValues = this.generateHierarchicalValues(facetValues);
		}

		// Generate range values if configured
		if (config.ranges) {
			facet.rangeValues = this.generateRangeValues(icons, config);
		}

		return facet;
	}

	/**
	 * Sort facet values based on configuration
	 */
	private sortFacetValues(values: FacetValue[], config: AdvancedFacetConfig): FacetValue[] {
		const sortBy = config.sortBy || 'count';
		const direction = config.sortDirection || 'desc';
		const multiplier = direction === 'asc' ? 1 : -1;

		return values.sort((a, b) => {
			let comparison = 0;

			switch (sortBy) {
				case 'count':
					comparison = a.count - b.count;
					break;
				case 'value':
					comparison = a.value.localeCompare(b.value);
					break;
				case 'alpha':
					comparison = a.value.localeCompare(b.value);
					break;
				default:
					comparison = a.count - b.count;
			}

			return comparison * multiplier;
		});
	}

	/**
	 * Get selected values for a facet type
	 */
	private getSelectedValues(facetType: FacetType, selections: FacetSelection[]): string[] {
		const selection = selections.find(s => s.facetType === facetType);
		return selection ? selection.values : [];
	}

	/**
	 * Generate hierarchical facet values
	 */
	private generateHierarchicalValues(values: FacetValue[]): HierarchicalFacetValue[] {
		const hierarchical: HierarchicalFacetValue[] = [];
		const hierarchy = new Map<string, HierarchicalFacetValue[]>();

		for (const value of values) {
			const parts = value.value.split('/').filter(p => p.trim());
			
			if (parts.length === 1) {
				// Top level
				hierarchical.push({
					...value,
					level: 0,
					children: []
				});
			} else {
				// Multi-level
				const parent = parts.slice(0, -1).join('/');
				const current = parts[parts.length - 1];
				
				if (!hierarchy.has(parent)) {
					hierarchy.set(parent, []);
				}
				
				hierarchy.get(parent)!.push({
					...value,
					value: current,
					level: parts.length - 1,
					parent,
					children: []
				});
			}
		}

		// Attach children to parents
		for (const [parent, children] of hierarchy.entries()) {
			const parentNode = hierarchical.find(h => h.value === parent);
			if (parentNode) {
				parentNode.children = children;
			}
		}

		return hierarchical;
	}

	/**
	 * Generate range facet values
	 */
	private generateRangeValues(icons: IconMetadata[], config: AdvancedFacetConfig): RangeFacetValue[] {
		if (!config.ranges) return [];

		const rangeValues: RangeFacetValue[] = [];

		for (const range of config.ranges) {
			let count = 0;

			for (const icon of icons) {
				const fieldValue = this.getFacetFieldValue(icon, config.type);
				if (!fieldValue) continue;

				const numValue = parseFloat(fieldValue.toString());
				if (isNaN(numValue)) continue;

				const inRange = (range.from === undefined || numValue >= range.from) &&
							   (range.to === undefined || numValue < range.to);

				if (inRange) count++;
			}

			if (count > 0) {
				rangeValues.push({
					value: range.label,
					count,
					from: range.from,
					to: range.to
				});
			}
		}

		return rangeValues;
	}

	/**
	 * Generate facet cache key
	 */
	private getFacetCacheKey(config: AdvancedFacetConfig, iconCount: number): string {
		return `${config.type}_${config.field}_${iconCount}_${JSON.stringify(config.ranges || {})}_${config.hierarchical || false}`;
	}

	/**
	 * Apply sorting to icons
	 */
	private applySorting(
		icons: IconMetadata[],
		sortBy?: string,
		sortDirection: 'asc' | 'desc' = 'asc'
	): IconMetadata[] {
		if (!sortBy) return icons;

		const multiplier = sortDirection === 'asc' ? 1 : -1;

		return icons.sort((a, b) => {
			let aValue: any, bValue: any;

			switch (sortBy) {
				case 'name':
					aValue = a.name;
					bValue = b.name;
					break;
				case 'category':
					aValue = a.category;
					bValue = b.category;
					break;
				case 'popularity': // Could be based on usage stats
					aValue = a.tags?.length || 0;
					bValue = b.tags?.length || 0;
					break;
				default:
					return 0;
			}

			if (typeof aValue === 'string' && typeof bValue === 'string') {
				return aValue.localeCompare(bValue) * multiplier;
			}

			return (aValue - bValue) * multiplier;
		});
	}

	/**
	 * Apply pagination
	 */
	private applyPagination(icons: IconMetadata[], limit?: number, offset?: number): IconMetadata[] {
		const start = offset || 0;
		const end = limit ? start + limit : undefined;
		return icons.slice(start, end);
	}

	/**
	 * Generate search suggestions
	 */
	private generateSuggestions(
		query: string,
		selections: FacetSelection[],
		facets: EnhancedFacetResult[]
	): { didYouMean?: string; relatedQueries?: string[]; popularFacets?: Array<{ facet: string; value: string; count: number }> } {
		const suggestions: any = {};

		// Generate "did you mean" suggestions for misspelled queries
		if (query && query.length > 3) {
			suggestions.didYouMean = this.generateDidYouMean(query);
		}

		// Generate related queries based on current facet selections
		suggestions.relatedQueries = this.generateRelatedQueries(query, selections);

		// Get popular facets that aren't currently selected
		suggestions.popularFacets = this.getPopularFacets(selections, facets);

		return suggestions;
	}

	/**
	 * Generate "did you mean" suggestions
	 */
	private generateDidYouMean(query: string): string | undefined {
		// Simple dictionary of common icon terms and their corrections
		const corrections: { [key: string]: string } = {
			'hom': 'home',
			'usr': 'user',
			'seting': 'setting',
			'seach': 'search',
			'menue': 'menu',
			'buton': 'button',
			'arow': 'arrow',
			'chek': 'check',
			'lok': 'lock',
			'hart': 'heart'
		};

		const queryLower = query.toLowerCase();
		
		// Direct corrections
		if (corrections[queryLower]) {
			return corrections[queryLower];
		}

		// Fuzzy matching against common terms
		const commonTerms = [
			'home', 'user', 'setting', 'search', 'menu', 'button', 'arrow', 'check', 
			'lock', 'heart', 'star', 'email', 'phone', 'calendar', 'chat', 'file',
			'folder', 'image', 'video', 'music', 'download', 'upload', 'share'
		];

		for (const term of commonTerms) {
			if (this.levenshteinDistance(queryLower, term) <= 2 && Math.abs(queryLower.length - term.length) <= 2) {
				return term;
			}
		}

		return undefined;
	}

	/**
	 * Calculate Levenshtein distance for fuzzy matching
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
	 * Generate related queries
	 */
	private generateRelatedQueries(query: string, selections: FacetSelection[]): string[] {
		const related: string[] = [];

		// Add queries based on selected facets
		for (const selection of selections) {
			for (const value of selection.values) {
				if (query && !query.toLowerCase().includes(value.toLowerCase())) {
					related.push(`${query} ${value.toLowerCase()}`);
				} else if (!query) {
					related.push(value.toLowerCase());
				}
			}
		}

		// Add common related terms
		const queryTerms = query ? query.toLowerCase().split(/\s+/) : [];
		const relatedTerms: { [key: string]: string[] } = {
			'home': ['house', 'main', 'dashboard'],
			'user': ['person', 'profile', 'account'],
			'setting': ['config', 'preference', 'option'],
			'search': ['find', 'lookup', 'magnify'],
			'menu': ['navigation', 'hamburger', 'list'],
			'button': ['click', 'action', 'control']
		};

		for (const term of queryTerms) {
			if (relatedTerms[term]) {
				for (const relatedTerm of relatedTerms[term]) {
					const newQuery = query.replace(new RegExp(term, 'gi'), relatedTerm);
					if (newQuery !== query) {
						related.push(newQuery);
					}
				}
			}
		}

		return related.slice(0, 5); // Limit to 5 suggestions
	}

	/**
	 * Get popular facets that aren't currently selected
	 */
	private getPopularFacets(
		selections: FacetSelection[],
		facets: EnhancedFacetResult[]
	): Array<{ facet: string; value: string; count: number }> {
		const popular: Array<{ facet: string; value: string; count: number }> = [];
		const selectedValues = new Set<string>();

		// Collect all selected values
		for (const selection of selections) {
			for (const value of selection.values) {
				selectedValues.add(`${selection.facetType}:${value}`);
			}
		}

		// Find popular unselected facet values
		for (const facet of facets) {
			for (const value of facet.values.slice(0, 3)) { // Top 3 per facet
				const key = `${facet.type}:${value.value}`;
				if (!selectedValues.has(key)) {
					popular.push({
						facet: facet.displayName,
						value: value.value,
						count: value.count
					});
				}
			}
		}

		// Sort by count and return top suggestions
		return popular
			.sort((a, b) => b.count - a.count)
			.slice(0, 8);
	}

	/**
	 * Track facet usage for analytics
	 */
	private trackFacetUsage(selections: FacetSelection[]): void {
		for (const selection of selections) {
			for (const value of selection.values) {
				const key = `${selection.facetType}:${value}`;
				this.popularFacets.set(key, (this.popularFacets.get(key) || 0) + 1);
			}
		}
	}

	/**
	 * Get facet analytics
	 */
	getAnalytics(): {
		cacheSize: number;
		popularFacets: Array<{ facet: string; count: number }>;
		cacheHitRate: number;
	} {
		const popular = Array.from(this.popularFacets.entries())
			.sort(([, a], [, b]) => b - a)
			.slice(0, 10)
			.map(([facet, count]) => ({ facet, count }));

		return {
			cacheSize: this.facetCache.size,
			popularFacets: popular,
			cacheHitRate: 0.85 // Would track actual hit rate in production
		};
	}

	/**
	 * Clear facet cache
	 */
	clearCache(): void {
		this.facetCache.clear();
		this.popularFacets.clear();
	}
}
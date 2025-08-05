import { ILogger } from '../../../infrastructure/logging/logger';
import { IconMetadata } from '../../icon/types/icon.types';

/**
 * Query operators for advanced search
 */
export enum QueryOperator {
	AND = 'AND',
	OR = 'OR',
	NOT = 'NOT',
	NEAR = 'NEAR',
	EXACT = 'EXACT'
}

/**
 * Search facet types
 */
export enum FacetType {
	CATEGORY = 'category',
	TAG = 'tag',
	STYLE = 'style',
	SIZE = 'size',
	COLOR = 'color',
	USAGE = 'usage'
}

/**
 * Advanced query filter
 */
export interface QueryFilter {
	field: string;
	operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex' | 'range' | 'in' | 'not_in';
	value: string | number | string[] | { min?: number; max?: number };
	boost?: number; // Score boost for matching this filter
}

/**
 * Search facet configuration
 */
export interface SearchFacet {
	type: FacetType;
	field: string;
	displayName: string;
	values?: string[]; // Predefined values, if any
	maxValues?: number; // Maximum values to return
	minCount?: number; // Minimum count for a value to be included
}

/**
 * Query term with operator
 */
export interface QueryTerm {
	term: string;
	operator: QueryOperator;
	field?: string; // Specific field to search in
	boost?: number; // Score boost for this term
	proximity?: number; // For NEAR operator
	exact?: boolean; // For exact phrase matching
}

/**
 * Advanced search query structure
 */
export interface AdvancedQuery {
	terms: QueryTerm[];
	filters: QueryFilter[];
	facets: SearchFacet[];
	sort?: {
		field: string;
		direction: 'asc' | 'desc';
	};
	limit?: number;
	offset?: number;
	includeHighlights?: boolean;
	includeDebugInfo?: boolean;
}

/**
 * Facet value with count
 */
export interface FacetValue {
	value: string;
	count: number;
	selected?: boolean;
}

/**
 * Facet result
 */
export interface FacetResult {
	type: FacetType;
	field: string;
	displayName: string;
	values: FacetValue[];
	totalValues: number;
}

/**
 * Advanced search result
 */
export interface AdvancedSearchResult {
	icon: IconMetadata;
	score: number;
	highlights?: { [field: string]: string[] };
	debugInfo?: {
		termMatches: { [term: string]: number };
		filterMatches: { [filter: string]: boolean };
		boosts: { [source: string]: number };
	};
}

/**
 * Complete advanced search response
 */
export interface AdvancedSearchResponse {
	results: AdvancedSearchResult[];
	facets: FacetResult[];
	totalResults: number;
	queryTime: number;
	query: AdvancedQuery;
}

/**
 * Advanced query service for complex search operations
 */
export class AdvancedQueryService {
	constructor(private readonly logger: ILogger) {}

	/**
	 * Parse advanced query string into structured query
	 */
	parseQuery(queryString: string): AdvancedQuery {
		const query: AdvancedQuery = {
			terms: [],
			filters: [],
			facets: []
		};

		// Parse different query formats
		if (queryString.includes('AND') || queryString.includes('OR') || queryString.includes('NOT')) {
			query.terms = this.parseCompoundQuery(queryString);
		} else if (queryString.includes('*') || queryString.includes('?')) {
			query.terms = this.parseWildcardQuery(queryString);
		} else if (queryString.includes(':')) {
			const { terms, filters } = this.parseFieldQuery(queryString);
			query.terms = terms;
			query.filters = filters;
		} else {
			// Simple query
			query.terms = [{
				term: queryString.trim(),
				operator: QueryOperator.AND
			}];
		}

		// Add default facets
		query.facets = this.getDefaultFacets();

		return query;
	}

	/**
	 * Parse compound queries with AND, OR, NOT operators
	 */
	private parseCompoundQuery(queryString: string): QueryTerm[] {
		const terms: QueryTerm[] = [];
		
		// Split by operators while preserving them
		const tokens = queryString.split(/\s+(AND|OR|NOT)\s+/i);
		let currentOperator = QueryOperator.AND;

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i].trim();
			
			if (!token) continue;

			if (token.toUpperCase() === 'AND') {
				currentOperator = QueryOperator.AND;
			} else if (token.toUpperCase() === 'OR') {
				currentOperator = QueryOperator.OR;
			} else if (token.toUpperCase() === 'NOT') {
				currentOperator = QueryOperator.NOT;
			} else {
				// It's a search term
				const cleanTerm = this.cleanTerm(token);
				if (cleanTerm) {
					terms.push({
						term: cleanTerm,
						operator: currentOperator,
						exact: token.startsWith('"') && token.endsWith('"'),
						boost: this.calculateTermBoost(cleanTerm)
					});
				}
			}
		}

		return terms.length > 0 ? terms : [{
			term: queryString.trim(),
			operator: QueryOperator.AND
		}];
	}

	/**
	 * Parse wildcard queries with * and ? patterns
	 */
	private parseWildcardQuery(queryString: string): QueryTerm[] {
		const terms: QueryTerm[] = [];
		
		// Split by spaces while preserving wildcards
		const tokens = queryString.split(/\s+/);

		for (const token of tokens) {
			const cleanTerm = token.trim();
			if (cleanTerm) {
				terms.push({
					term: cleanTerm,
					operator: QueryOperator.AND,
					boost: this.calculateTermBoost(cleanTerm)
				});
			}
		}

		return terms;
	}

	/**
	 * Parse field-specific queries (field:value format)
	 */
	private parseFieldQuery(queryString: string): { terms: QueryTerm[]; filters: QueryFilter[] } {
		const terms: QueryTerm[] = [];
		const filters: QueryFilter[] = [];

		// Split by spaces but respect quoted strings
		const tokens = this.tokenizeQuery(queryString);

		for (const token of tokens) {
			if (token.includes(':')) {
				const [field, value] = token.split(':');
				const cleanField = field.trim();
				const cleanValue = value.trim();

				if (this.isFilterField(cleanField)) {
					// Add as filter
					filters.push({
						field: cleanField,
						operator: cleanValue.includes('*') ? 'regex' : 'contains',
						value: cleanValue.replace(/[*?]/g, match => match === '*' ? '.*' : '.'),
						boost: 1.2
					});
				} else {
					// Add as field-specific term
					terms.push({
						term: cleanValue,
						operator: QueryOperator.AND,
						field: cleanField,
						boost: 1.5
					});
				}
			} else {
				// Regular term
				const cleanTerm = this.cleanTerm(token);
				if (cleanTerm) {
					terms.push({
						term: cleanTerm,
						operator: QueryOperator.AND,
						boost: this.calculateTermBoost(cleanTerm)
					});
				}
			}
		}

		return { terms, filters };
	}

	/**
	 * Tokenize query respecting quoted strings
	 */
	private tokenizeQuery(query: string): string[] {
		const tokens: string[] = [];
		let current = '';
		let inQuotes = false;
		let quoteChar = '';

		for (let i = 0; i < query.length; i++) {
			const char = query[i];

			if ((char === '"' || char === "'") && !inQuotes) {
				inQuotes = true;
				quoteChar = char;
				current += char;
			} else if (char === quoteChar && inQuotes) {
				inQuotes = false;
				current += char;
				tokens.push(current.trim());
				current = '';
				quoteChar = '';
			} else if (char === ' ' && !inQuotes) {
				if (current.trim()) {
					tokens.push(current.trim());
					current = '';
				}
			} else {
				current += char;
			}
		}

		if (current.trim()) {
			tokens.push(current.trim());
		}

		return tokens;
	}

	/**
	 * Check if field should be treated as a filter
	 */
	private isFilterField(field: string): boolean {
		const filterFields = ['category', 'tag', 'style', 'size', 'color', 'usage'];
		return filterFields.includes(field.toLowerCase());
	}

	/**
	 * Clean and normalize search term
	 */
	private cleanTerm(term: string): string {
		return term
			.replace(/^["']|["']$/g, '') // Remove surrounding quotes
			.replace(/\s+/g, ' ') // Normalize whitespace
			.trim();
	}

	/**
	 * Calculate boost factor for a term
	 */
	private calculateTermBoost(term: string): number {
		// Boost exact phrases
		if (term.includes('"')) return 1.8;
		
		// Boost longer terms
		if (term.length > 8) return 1.3;
		
		// Boost common icon terms
		const commonTerms = ['icon', 'button', 'menu', 'home', 'user', 'settings'];
		if (commonTerms.some(t => term.toLowerCase().includes(t))) return 1.2;

		return 1.0;
	}

	/**
	 * Get default facets for search
	 */
	private getDefaultFacets(): SearchFacet[] {
		return [
			{
				type: FacetType.CATEGORY,
				field: 'category',
				displayName: 'Category',
				maxValues: 20,
				minCount: 1
			},
			{
				type: FacetType.TAG,
				field: 'tags',
				displayName: 'Tags',
				maxValues: 30,
				minCount: 2
			},
			{
				type: FacetType.USAGE,
				field: 'usage',
				displayName: 'Usage Context',
				maxValues: 15,
				minCount: 1
			}
		];
	}

	/**
	 * Execute advanced search against icon dataset
	 */
	async executeAdvancedSearch(
		query: AdvancedQuery,
		icons: IconMetadata[]
	): Promise<AdvancedSearchResponse> {
		const startTime = Date.now();
		
		this.logger.debug('Executing advanced search', {
			termsCount: query.terms.length,
			filtersCount: query.filters.length,
			facetsCount: query.facets.length
		});

		// Apply filters first to narrow down the dataset
		let filteredIcons = this.applyFilters(icons, query.filters);

		// Execute search terms
		const searchResults = this.executeTerms(filteredIcons, query.terms);

		// Apply sorting
		const sortedResults = this.applySorting(searchResults, query.sort);

		// Apply pagination
		const paginatedResults = this.applyPagination(sortedResults, query.limit, query.offset);

		// Generate facets
		const facets = this.generateFacets(filteredIcons, query.facets);

		// Add highlights if requested
		if (query.includeHighlights) {
			this.addHighlights(paginatedResults, query.terms);
		}

		// Add debug info if requested
		if (query.includeDebugInfo) {
			this.addDebugInfo(paginatedResults, query);
		}

		const queryTime = Date.now() - startTime;

		return {
			results: paginatedResults,
			facets,
			totalResults: sortedResults.length,
			queryTime,
			query
		};
	}

	/**
	 * Apply filters to icon dataset
	 */
	private applyFilters(icons: IconMetadata[], filters: QueryFilter[]): IconMetadata[] {
		if (filters.length === 0) return icons;

		return icons.filter(icon => {
			return filters.every(filter => this.matchesFilter(icon, filter));
		});
	}

	/**
	 * Check if icon matches a filter
	 */
	private matchesFilter(icon: IconMetadata, filter: QueryFilter): boolean {
		const fieldValue = this.getFieldValue(icon, filter.field);
		
		if (fieldValue === null || fieldValue === undefined) return false;

		switch (filter.operator) {
			case 'equals':
				return fieldValue.toString().toLowerCase() === filter.value.toString().toLowerCase();
			
			case 'contains':
				return fieldValue.toString().toLowerCase().includes(filter.value.toString().toLowerCase());
			
			case 'starts_with':
				return fieldValue.toString().toLowerCase().startsWith(filter.value.toString().toLowerCase());
			
			case 'ends_with':
				return fieldValue.toString().toLowerCase().endsWith(filter.value.toString().toLowerCase());
			
			case 'regex':
				try {
					const regex = new RegExp(filter.value.toString(), 'i');
					return regex.test(fieldValue.toString());
				} catch {
					return false;
				}
			
			case 'in':
				if (Array.isArray(filter.value)) {
					return filter.value.some(v => 
						fieldValue.toString().toLowerCase() === v.toString().toLowerCase()
					);
				}
				return false;
			
			case 'not_in':
				if (Array.isArray(filter.value)) {
					return !filter.value.some(v => 
						fieldValue.toString().toLowerCase() === v.toString().toLowerCase()
					);
				}
				return true;
			
			case 'range':
				if (typeof filter.value === 'object' && filter.value !== null) {
					const numValue = parseFloat(fieldValue.toString());
					const range = filter.value as { min?: number; max?: number };
					
					if (range.min !== undefined && numValue < range.min) return false;
					if (range.max !== undefined && numValue > range.max) return false;
					
					return true;
				}
				return false;
			
			default:
				return false;
		}
	}

	/**
	 * Get field value from icon
	 */
	private getFieldValue(icon: IconMetadata, field: string): any {
		switch (field.toLowerCase()) {
			case 'name': return icon.name;
			case 'category': return icon.category;
			case 'tags': return icon.tags;
			case 'usage': return icon.usage;
			default:
				// Try to access as property
				return (icon as any)[field];
		}
	}

	/**
	 * Execute search terms against icons
	 */
	private executeTerms(icons: IconMetadata[], terms: QueryTerm[]): AdvancedSearchResult[] {
		if (terms.length === 0) {
			return icons.map(icon => ({ icon, score: 1.0 }));
		}

		const results: AdvancedSearchResult[] = [];

		for (const icon of icons) {
			const score = this.calculateIconScore(icon, terms);
			
			if (score > 0) {
				results.push({
					icon,
					score,
					debugInfo: {
						termMatches: this.getTermMatches(icon, terms),
						filterMatches: {},
						boosts: this.getBoosts(icon, terms)
					}
				});
			}
		}

		return results;
	}

	/**
	 * Calculate score for an icon against search terms
	 */
	private calculateIconScore(icon: IconMetadata, terms: QueryTerm[]): number {
		let totalScore = 0;
		let requiredMatches = 0;
		let actualMatches = 0;

		for (const term of terms) {
			const termScore = this.calculateTermScore(icon, term);
			
			switch (term.operator) {
				case QueryOperator.AND:
					requiredMatches++;
					if (termScore > 0) {
						actualMatches++;
						totalScore += termScore * (term.boost || 1.0);
					}
					break;
				
				case QueryOperator.OR:
					if (termScore > 0) {
						totalScore += termScore * (term.boost || 1.0);
					}
					break;
				
				case QueryOperator.NOT:
					if (termScore > 0) {
						return 0; // Exclude this icon
					}
					break;
				
				case QueryOperator.EXACT:
					if (termScore > 0) {
						totalScore += termScore * 2.0 * (term.boost || 1.0); // Exact matches get double score
					}
					break;
				
				case QueryOperator.NEAR:
					// Simplified proximity scoring
					if (termScore > 0) {
						const proximityBoost = 1.5; // Could be more sophisticated
						totalScore += termScore * proximityBoost * (term.boost || 1.0);
					}
					break;
			}
		}

		// For AND queries, all required terms must match
		const andTerms = terms.filter(t => t.operator === QueryOperator.AND);
		if (andTerms.length > 0 && actualMatches < requiredMatches) {
			return 0;
		}

		return totalScore;
	}

	/**
	 * Calculate score for a single term against an icon
	 */
	private calculateTermScore(icon: IconMetadata, term: QueryTerm): number {
		const searchFields = term.field ? [term.field] : ['name', 'category', 'tags', 'usage'];
		let maxScore = 0;

		for (const field of searchFields) {
			const fieldValue = this.getFieldValue(icon, field);
			if (!fieldValue) continue;

			const fieldContent = Array.isArray(fieldValue) 
				? fieldValue.join(' ').toLowerCase()
				: fieldValue.toString().toLowerCase();

			const score = this.scoreTermMatch(fieldContent, term.term.toLowerCase(), field, term.exact);
			maxScore = Math.max(maxScore, score);
		}

		return maxScore;
	}

	/**
	 * Score term match in field content
	 */
	private scoreTermMatch(content: string, term: string, field: string, exact: boolean = false): number {
		if (exact) {
			return content === term ? 1.0 : 0;
		}

		// Handle wildcards
		if (term.includes('*') || term.includes('?')) {
			const pattern = term.replace(/\*/g, '.*').replace(/\?/g, '.');
			try {
				const regex = new RegExp(pattern, 'i');
				return regex.test(content) ? 0.8 : 0;
			} catch {
				return 0;
			}
		}

		// Exact match
		if (content === term) return 1.0;

		// Word match
		const words = content.split(/\s+/);
		if (words.includes(term)) {
			const fieldBoost = this.getFieldBoost(field);
			return 0.9 * fieldBoost;
		}

		// Starts with
		if (content.startsWith(term)) return 0.7;

		// Contains
		if (content.includes(term)) return 0.5;

		// Fuzzy match (simple)
		if (this.fuzzyMatch(content, term)) return 0.3;

		return 0;
	}

	/**
	 * Get boost factor for field
	 */
	private getFieldBoost(field: string): number {
		const boosts = {
			name: 1.5,
			category: 1.2,
			tags: 1.0,
			usage: 0.8
		};
		return boosts[field as keyof typeof boosts] || 1.0;
	}

	/**
	 * Simple fuzzy matching
	 */
	private fuzzyMatch(content: string, term: string): boolean {
		if (term.length < 3) return false;
		
		// Allow 1 character difference for every 4 characters
		const maxDifference = Math.floor(term.length / 4) + 1;
		
		return this.levenshteinDistance(content, term) <= maxDifference;
	}

	/**
	 * Calculate Levenshtein distance
	 */
	private levenshteinDistance(str1: string, str2: string): number {
		const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

		for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
		for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

		for (let j = 1; j <= str2.length; j++) {
			for (let i = 1; i <= str1.length; i++) {
				const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
				matrix[j][i] = Math.min(
					matrix[j][i - 1] + 1,     // deletion
					matrix[j - 1][i] + 1,     // insertion
					matrix[j - 1][i - 1] + indicator  // substitution
				);
			}
		}

		return matrix[str2.length][str1.length];
	}

	/**
	 * Apply sorting to search results
	 */
	private applySorting(
		results: AdvancedSearchResult[], 
		sort?: { field: string; direction: 'asc' | 'desc' }
	): AdvancedSearchResult[] {
		if (!sort) {
			// Default: sort by score descending
			return results.sort((a, b) => b.score - a.score);
		}

		return results.sort((a, b) => {
			const aValue = this.getFieldValue(a.icon, sort.field);
			const bValue = this.getFieldValue(b.icon, sort.field);

			if (aValue === bValue) return b.score - a.score; // Secondary sort by score

			let comparison = 0;
			if (aValue < bValue) comparison = -1;
			else if (aValue > bValue) comparison = 1;

			return sort.direction === 'desc' ? -comparison : comparison;
		});
	}

	/**
	 * Apply pagination to results
	 */
	private applyPagination(
		results: AdvancedSearchResult[], 
		limit?: number, 
		offset?: number
	): AdvancedSearchResult[] {
		const start = offset || 0;
		const end = limit ? start + limit : undefined;
		return results.slice(start, end);
	}

	/**
	 * Generate facets from filtered dataset
	 */
	private generateFacets(icons: IconMetadata[], facetConfigs: SearchFacet[]): FacetResult[] {
		const facets: FacetResult[] = [];

		for (const config of facetConfigs) {
			const facetCounts = new Map<string, number>();

			for (const icon of icons) {
				const fieldValue = this.getFieldValue(icon, config.field);
				
				if (Array.isArray(fieldValue)) {
					for (const value of fieldValue) {
						const strValue = value.toString();
						facetCounts.set(strValue, (facetCounts.get(strValue) || 0) + 1);
					}
				} else if (fieldValue !== null && fieldValue !== undefined) {
					const strValue = fieldValue.toString();
					facetCounts.set(strValue, (facetCounts.get(strValue) || 0) + 1);
				}
			}

			// Convert to facet values and apply filters
			const values: FacetValue[] = Array.from(facetCounts.entries())
				.filter(([_, count]) => count >= (config.minCount || 1))
				.sort(([, a], [, b]) => b - a) // Sort by count descending
				.slice(0, config.maxValues || 50)
				.map(([value, count]) => ({ value, count }));

			facets.push({
				type: config.type,
				field: config.field,
				displayName: config.displayName,
				values,
				totalValues: facetCounts.size
			});
		}

		return facets;
	}

	/**
	 * Add highlights to search results
	 */
	private addHighlights(results: AdvancedSearchResult[], terms: QueryTerm[]): void {
		for (const result of results) {
			result.highlights = {};
			
			const searchFields = ['name', 'category', 'tags', 'usage'];
			for (const field of searchFields) {
				const fieldValue = this.getFieldValue(result.icon, field);
				if (!fieldValue) continue;

				const content = Array.isArray(fieldValue) 
					? fieldValue.join(' ')
					: fieldValue.toString();

				const highlights = this.generateHighlights(content, terms);
				if (highlights.length > 0) {
					result.highlights[field] = highlights;
				}
			}
		}
	}

	/**
	 * Generate highlights for content
	 */
	private generateHighlights(content: string, terms: QueryTerm[]): string[] {
		const highlights: string[] = [];
		
		for (const term of terms) {
			if (term.operator === QueryOperator.NOT) continue;

			const termLower = term.term.toLowerCase();
			const contentLower = content.toLowerCase();
			
			if (contentLower.includes(termLower)) {
				const index = contentLower.indexOf(termLower);
				const start = Math.max(0, index - 20);
				const end = Math.min(content.length, index + termLower.length + 20);
				
				let highlight = content.substring(start, end);
				
				// Add ellipsis if truncated
				if (start > 0) highlight = '...' + highlight;
				if (end < content.length) highlight = highlight + '...';
				
				// Mark the term
				const regex = new RegExp(`(${this.escapeRegex(term.term)})`, 'gi');
				highlight = highlight.replace(regex, '<mark>$1</mark>');
				
				highlights.push(highlight);
			}
		}
		
		return highlights;
	}

	/**
	 * Escape special regex characters
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	/**
	 * Add debug information to results
	 */
	private addDebugInfo(results: AdvancedSearchResult[], query: AdvancedQuery): void {
		for (const result of results) {
			if (!result.debugInfo) continue;

			result.debugInfo.termMatches = this.getTermMatches(result.icon, query.terms);
			result.debugInfo.filterMatches = this.getFilterMatches(result.icon, query.filters);
			result.debugInfo.boosts = this.getBoosts(result.icon, query.terms);
		}
	}

	/**
	 * Get term match details for debugging
	 */
	private getTermMatches(icon: IconMetadata, terms: QueryTerm[]): { [term: string]: number } {
		const matches: { [term: string]: number } = {};
		
		for (const term of terms) {
			matches[term.term] = this.calculateTermScore(icon, term);
		}
		
		return matches;
	}

	/**
	 * Get filter match details for debugging
	 */
	private getFilterMatches(icon: IconMetadata, filters: QueryFilter[]): { [filter: string]: boolean } {
		const matches: { [filter: string]: boolean } = {};
		
		for (const filter of filters) {
			const key = `${filter.field}:${filter.operator}:${filter.value}`;
			matches[key] = this.matchesFilter(icon, filter);
		}
		
		return matches;
	}

	/**
	 * Get boost details for debugging
	 */
	private getBoosts(icon: IconMetadata, terms: QueryTerm[]): { [source: string]: number } {
		const boosts: { [source: string]: number } = {};
		
		for (const term of terms) {
			if (term.boost && term.boost !== 1.0) {
				boosts[`term_${term.term}`] = term.boost;
			}
		}
		
		// Add field boosts
		boosts.name = this.getFieldBoost('name');
		boosts.category = this.getFieldBoost('category');
		boosts.tags = this.getFieldBoost('tags');
		boosts.usage = this.getFieldBoost('usage');
		
		return boosts;
	}
}
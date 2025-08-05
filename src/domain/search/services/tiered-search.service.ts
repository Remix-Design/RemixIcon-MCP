import { ILogger } from '../../../infrastructure/logging/logger';
import { ErrorHandler, ErrorType } from '../../../infrastructure/error/error-handler';
import { IconMetadata, ResponseContent } from '../../icon/types/icon.types';
import { SearchConfig } from '../types/search.types';
import { BloomFilter } from '../../../utils/bloom-filter/bloom-filter';
import { TextProcessor } from '../../../utils/text/text-processor';
import { SimilarityEngine } from '../../../utils/similarity/similarity';
import { UnifiedSearchService } from './unified-search.service';
import { IncrementalIndexService } from './incremental-index.service';

/**
 * Search pipeline stage results
 */
interface StageResult {
	candidates: Map<string, number>;
	stage: string;
	processingTime: number;
	candidateCount: number;
}

/**
 * Pipeline configuration
 */
interface PipelineConfig {
	bloomFilterFalsePositiveRate: number;
	maxCandidatesPerStage: number;
	earlyTerminationThreshold: number;
	enableStageMetrics: boolean;
}

/**
 * Tiered search service implementing multi-stage search pipeline
 * Stage 1: Bloom filter pre-screening (O(1))
 * Stage 2: Inverted index with term frequency (O(log n))
 * Stage 3: Advanced scoring for top candidates (O(k))
 */
export class TieredSearchService {
	private bloomFilter: BloomFilter;
	private iconNameMap: Map<string, IconMetadata> = new Map();
	private categoryBloomFilters: Map<string, BloomFilter> = new Map();
	private incrementalIndexService: IncrementalIndexService;
	private readonly errorHandler: ErrorHandler;
	private readonly pipelineConfig: PipelineConfig;
	
	constructor(
		private readonly unifiedSearchService: UnifiedSearchService,
		private readonly config: SearchConfig,
		private readonly logger: ILogger,
		private readonly kvStorage: any, // KVStorage interface
		pipelineConfig?: Partial<PipelineConfig>
	) {
		this.errorHandler = new ErrorHandler(logger);
		this.pipelineConfig = {
			bloomFilterFalsePositiveRate: 0.01,
			maxCandidatesPerStage: 100,
			earlyTerminationThreshold: 15,
			enableStageMetrics: true,
			...pipelineConfig
		};
		
		// Initialize bloom filter with reasonable defaults
		this.bloomFilter = new BloomFilter(5000, this.pipelineConfig.bloomFilterFalsePositiveRate);
		
		// Initialize incremental index service
		this.incrementalIndexService = new IncrementalIndexService(
			this.kvStorage,
			this.config,
			this.logger
		);
	}

	/**
	 * Build the tiered search index
	 */
	async buildIndex(icons: IconMetadata[]): Promise<void> {
		const startTime = Date.now();
		
		try {
			// Initialize incremental index (will check for updates automatically)
			await this.incrementalIndexService.initializeIndex(icons);
			
			// Clear existing bloom filter data
			this.bloomFilter.clear();
			this.iconNameMap.clear();
			this.categoryBloomFilters.clear();
			
			// Build main bloom filter and name mapping
			const categories = new Set<string>();
			
			for (const icon of icons) {
				// Add to main bloom filter
				const searchableTerms = this.extractSearchableTerms(icon);
				searchableTerms.forEach(term => this.bloomFilter.add(term));
				
				// Store icon mapping
				this.iconNameMap.set(icon.name, icon);
				categories.add(icon.category);
			}
			
			// Build category-specific bloom filters
			for (const category of categories) {
				const categoryIcons = icons.filter(icon => icon.category === category);
				const categoryFilter = new BloomFilter(
					Math.max(categoryIcons.length, 10), 
					this.pipelineConfig.bloomFilterFalsePositiveRate
				);
				
				for (const icon of categoryIcons) {
					const terms = this.extractSearchableTerms(icon);
					terms.forEach(term => categoryFilter.add(term));
				}
				
				this.categoryBloomFilters.set(category, categoryFilter);
			}
			
			// Build underlying unified search index
			this.unifiedSearchService.buildIndex(icons);
			
			const buildTime = Date.now() - startTime;
			this.logger.info('Tiered search index built successfully', {
				iconCount: icons.length,
				categories: categories.size,
				buildTime,
				bloomFilterStats: this.bloomFilter.getStats(),
				incrementalIndexEnabled: true
			});
			
		} catch (error) {
			this.logger.error('Error building tiered search index', { error });
			throw error;
		}
	}

	/**
	 * Perform tiered search with pipeline stages
	 */
	async performTieredSearch(description: string, resultLimit: number = 5): Promise<ResponseContent[]> {
		const validation = this.errorHandler.validateParams(
			{ description, resultLimit },
			(params) => typeof params.description === 'string' && params.description.length > 0,
			'Invalid search parameters for tiered search'
		);
		
		if (!validation.success) {
			return [];
		}

		const searchResult = await this.errorHandler.safeExecute(
			() => this.executePipeline(description, resultLimit),
			ErrorType.SEARCH,
			'tiered search',
			{ description, resultLimit }
		);

		return searchResult.success ? searchResult.data : [];
	}

	/**
	 * Perform category-specific tiered search
	 */
	async performTieredCategorySearch(description: string, category: string, resultLimit: number = 5): Promise<ResponseContent[]> {
		const validation = this.errorHandler.validateParams(
			{ description, category, resultLimit },
			(params) => typeof params.description === 'string' && typeof params.category === 'string',
			'Invalid parameters for tiered category search'
		);
		
		if (!validation.success) {
			return [];
		}

		const searchResult = await this.errorHandler.safeExecute(
			() => this.executeCategoryPipeline(description, category, resultLimit),
			ErrorType.SEARCH,
			'tiered category search',
			{ description, category, resultLimit }
		);

		return searchResult.success ? searchResult.data : [];
	}

	/**
	 * Execute the full search pipeline
	 */
	private async executePipeline(description: string, resultLimit: number): Promise<ResponseContent[]> {
		const pipelineStart = Date.now();
		const stages: StageResult[] = [];

		// Stage 1: Bloom filter pre-screening
		const stage1Result = this.executeStage1(description);
		stages.push(stage1Result);

		if (stage1Result.candidates.size === 0) {
			this.logPipelineResults('bloom_filter_no_matches', stages, pipelineStart);
			return [];
		}

		// Stage 2: Inverted index search
		const stage2Result = await this.executeStage2(description, stage1Result.candidates);
		stages.push(stage2Result);

		if (stage2Result.candidates.size === 0) {
			this.logPipelineResults('index_search_no_matches', stages, pipelineStart);
			return [];
		}

		// Early termination check
		if (stage2Result.candidates.size >= this.pipelineConfig.earlyTerminationThreshold && 
			this.hasHighQualityCandidates(stage2Result.candidates)) {
			const results = this.formatResults(stage2Result.candidates, resultLimit);
			this.logPipelineResults('early_termination', stages, pipelineStart);
			return results;
		}

		// Stage 3: Advanced scoring
		const stage3Result = await this.executeStage3(description, stage2Result.candidates, resultLimit);
		stages.push(stage3Result);

		const results = this.formatResults(stage3Result.candidates, resultLimit);
		this.logPipelineResults('full_pipeline', stages, pipelineStart);
		
		return results;
	}

	/**
	 * Execute category-specific pipeline
	 */
	private async executeCategoryPipeline(description: string, category: string, resultLimit: number): Promise<ResponseContent[]> {
		const categoryFilter = this.categoryBloomFilters.get(category);
		if (!categoryFilter) {
			// Fallback to unified search
			return this.unifiedSearchService.findIconsByCategory(description, category, resultLimit);
		}

		// Use category-specific bloom filter for stage 1
		const searchTerms = this.normalizeSearchTerms(description);
		const bloomCandidates = new Map<string, number>();

		for (const [iconName, icon] of this.iconNameMap.entries()) {
			if (icon.category !== category) continue;
			
			const hasTermMatch = searchTerms.some(term => categoryFilter.mightContain(term));
			if (hasTermMatch) {
				bloomCandidates.set(iconName, 1.0); // Initial score
			}
		}

		if (bloomCandidates.size === 0) {
			return [];
		}

		// Continue with stages 2 and 3
		const stage2Result = await this.executeStage2(description, bloomCandidates);
		const stage3Result = await this.executeStage3(description, stage2Result.candidates, resultLimit);
		
		return this.formatResults(stage3Result.candidates, resultLimit);
	}

	/**
	 * Stage 1: Bloom filter pre-screening
	 */
	private executeStage1(description: string): StageResult {
		const startTime = Date.now();
		const searchTerms = this.normalizeSearchTerms(description);
		const candidates = new Map<string, number>();

		// Check each icon against bloom filter
		for (const [iconName, icon] of this.iconNameMap.entries()) {
			const hasTermMatch = searchTerms.some(term => this.bloomFilter.mightContain(term));
			if (hasTermMatch) {
				candidates.set(iconName, 1.0); // Initial bloom filter score
			}
		}

		return {
			candidates,
			stage: 'bloom_filter',
			processingTime: Date.now() - startTime,
			candidateCount: candidates.size
		};
	}

	/**
	 * Stage 2: Enhanced index search with n-gram and phonetic matching
	 */
	private async executeStage2(description: string, bloomCandidates: Map<string, number>): StageResult {
		const startTime = Date.now();
		const candidates = new Map<string, number>();

		// 1. Traditional inverted index search
		const indexResults = this.unifiedSearchService.searchWithIndex(description);
		
		// 2. N-gram matching for fuzzy search
		const ngramResults = await this.incrementalIndexService.getNgramMatches(description);
		
		// 3. Phonetic matching for typo tolerance
		const phoneticResults = await this.incrementalIndexService.getPhoneticMatches(description);

		// Combine all results with weights
		const allResults = new Map<string, number>();
		
		// Weight traditional index results highly
		for (const [iconName, score] of indexResults.entries()) {
			allResults.set(iconName, (allResults.get(iconName) || 0) + score * 1.0);
		}
		
		// Weight n-gram results moderately
		for (const [iconName, score] of ngramResults.entries()) {
			allResults.set(iconName, (allResults.get(iconName) || 0) + score * 0.7);
		}
		
		// Weight phonetic results lower (for typo tolerance)
		for (const [iconName, score] of phoneticResults.entries()) {
			allResults.set(iconName, (allResults.get(iconName) || 0) + score * 0.5);
		}

		// Intersect with bloom filter results and boost scores
		for (const [iconName, combinedScore] of allResults.entries()) {
			if (bloomCandidates.has(iconName)) {
				// Boost score for items that passed bloom filter
				const bloomScore = bloomCandidates.get(iconName) || 0;
				const finalScore = combinedScore + (bloomScore * 0.2);
				candidates.set(iconName, finalScore);
			}
		}

		// If results are sparse, include top bloom candidates
		if (candidates.size < this.pipelineConfig.maxCandidatesPerStage / 2) {
			const topBloomCandidates = Array.from(bloomCandidates.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, this.pipelineConfig.maxCandidatesPerStage);
			
			for (const [iconName, score] of topBloomCandidates) {
				if (!candidates.has(iconName)) {
					candidates.set(iconName, score * 0.3); // Lower score for bloom-only matches
				}
			}
		}

		return {
			candidates,
			stage: 'enhanced_index',
			processingTime: Date.now() - startTime,
			candidateCount: candidates.size
		};
	}

	/**
	 * Stage 3: Advanced scoring for top candidates
	 */
	private async executeStage3(description: string, indexCandidates: Map<string, number>, resultLimit: number): StageResult {
		const startTime = Date.now();
		const candidates = new Map<string, number>();

		// Select top candidates for detailed scoring
		const topCandidates = Array.from(indexCandidates.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, Math.min(this.pipelineConfig.maxCandidatesPerStage, resultLimit * 3));

		// Perform detailed scoring on selected candidates
		for (const [iconName, preliminaryScore] of topCandidates) {
			const icon = this.iconNameMap.get(iconName);
			if (!icon) continue;

			const searchResult = await this.unifiedSearchService.search({
				description,
				usage: icon.usage,
				category: icon.category,
				name: icon.name,
				tags: icon.tags
			});

			if (searchResult.success && searchResult.data && searchResult.data >= this.config.thresholds.minScore) {
				// Combine preliminary and detailed scores
				const finalScore = (preliminaryScore * 0.3) + (searchResult.data * 0.7);
				candidates.set(iconName, finalScore);
			}
		}

		return {
			candidates,
			stage: 'advanced_scoring',
			processingTime: Date.now() - startTime,
			candidateCount: candidates.size
		};
	}

	/**
	 * Extract searchable terms from icon metadata
	 */
	private extractSearchableTerms(icon: IconMetadata): string[] {
		const terms: string[] = [];
		
		// Icon name terms
		terms.push(...TextProcessor.splitIntoWords(TextProcessor.normalizeInput(icon.name)));
		
		// Category terms
		terms.push(...TextProcessor.splitIntoWords(TextProcessor.normalizeInput(icon.category)));
		
		// Tag terms
		for (const tag of icon.tags) {
			terms.push(...TextProcessor.splitIntoWords(TextProcessor.normalizeInput(tag)));
		}
		
		// Usage terms
		terms.push(...TextProcessor.splitIntoWords(TextProcessor.normalizeInput(icon.usage)));
		
		return [...new Set(terms)]; // Deduplicate
	}

	/**
	 * Normalize search terms
	 */
	private normalizeSearchTerms(description: string): string[] {
		return TextProcessor.splitIntoWords(TextProcessor.normalizeInput(description));
	}

	/**
	 * Check if candidates have high quality scores
	 */
	private hasHighQualityCandidates(candidates: Map<string, number>): boolean {
		const scores = Array.from(candidates.values());
		const topScore = Math.max(...scores);
		return topScore >= this.config.thresholds.highScore;
	}

	/**
	 * Format search results
	 */
	private formatResults(candidates: Map<string, number>, limit: number): ResponseContent[] {
		return Array.from(candidates.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([iconName, score]) => {
				const icon = this.iconNameMap.get(iconName);
				return {
					type: 'text' as const,
					text: `${iconName} (Score: ${score.toFixed(2)}, Category: ${icon?.category || 'Unknown'})`
				};
			});
	}

	/**
	 * Log pipeline execution results
	 */
	private logPipelineResults(reason: string, stages: StageResult[], pipelineStart: number): void {
		if (!this.pipelineConfig.enableStageMetrics) return;

		const totalTime = Date.now() - pipelineStart;
		const stageMetrics = stages.map(stage => ({
			stage: stage.stage,
			candidates: stage.candidateCount,
			time: stage.processingTime
		}));

		this.logger.info('Tiered search pipeline completed', {
			reason,
			totalTime,
			stages: stageMetrics,
			finalCandidates: stages[stages.length - 1]?.candidateCount || 0
		});
	}
}
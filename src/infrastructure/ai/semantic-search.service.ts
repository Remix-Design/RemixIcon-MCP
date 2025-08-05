import { ILogger } from '../logging/logger';
import { ErrorHandler, ErrorType } from '../error/error-handler';
import { IconMetadata, ResponseContent } from '../../domain/icon/types/icon.types';
import { TelemetryService } from '../observability/telemetry.service';

/**
 * Semantic embedding vector
 */
export interface SemanticVector {
	embedding: number[];
	dimensions: number;
	model: string;
	text: string;
	metadata?: Record<string, any>;
}

/**
 * Intent classification result
 */
export interface IntentClassification {
	intent: string;
	confidence: number;
	category: string;
	subcategory?: string;
	entities: Array<{
		type: string;
		value: string;
		confidence: number;
	}>;
	reasoning: string[];
}

/**
 * Semantic search result with similarity score
 */
export interface SemanticSearchResult {
	icon: IconMetadata;
	semanticScore: number;
	traditionalScore: number;
	combinedScore: number;
	matchType: 'semantic' | 'traditional' | 'hybrid';
	explanation: string;
}

/**
 * AI model configuration
 */
interface AIModelConfig {
	embeddingModel: string;
	classificationModel: string;
	embeddingDimensions: number;
	similarityThreshold: number;
	maxEmbeddingCacheSize: number;
	enableIntent Classification: boolean;
	hybridSearchWeights: {
		semantic: number;
		traditional: number;
		intent: number;
	};
}

/**
 * Cached embedding entry
 */
interface EmbeddingCacheEntry {
	text: string;
	embedding: number[];
	timestamp: number;
	hitCount: number;
	model: string;
}

/**
 * Semantic search service using Cloudflare Workers AI
 * Provides intelligent search capabilities with embeddings and intent classification
 */
export class SemanticSearchService {
	private readonly errorHandler: ErrorHandler;
	private readonly config: AIModelConfig;
	private readonly embeddingCache = new Map<string, EmbeddingCacheEntry>();
	private iconEmbeddings = new Map<string, SemanticVector>();
	private isInitialized = false;
	
	// Intent patterns for classification
	private readonly intentPatterns = {
		search: [
			'find', 'search', 'look for', 'show me', 'get', 'need', 'want'
		],
		browse: [
			'browse', 'explore', 'see all', 'list', 'view', 'show'
		],
		filter: [
			'filter', 'category', 'type', 'kind of', 'specific'
		],
		compare: [
			'compare', 'difference', 'similar', 'like', 'alternative'
		],
		recommend: [
			'recommend', 'suggest', 'best', 'popular', 'good for'
		]
	};

	constructor(
		private readonly logger: ILogger,
		private readonly workersAI: any, // Cloudflare Workers AI binding
		private readonly telemetryService?: TelemetryService,
		config?: Partial<AIModelConfig>
	) {
		this.config = {
			embeddingModel: '@cf/baai/bge-base-en-v1.5',
			classificationModel: '@cf/huggingface/distilbert-sst-2-int8',
			embeddingDimensions: 768,
			similarityThreshold: 0.7,
			maxEmbeddingCacheSize: 1000,
			enableIntentClassification: true,
			hybridSearchWeights: {
				semantic: 0.4,
				traditional: 0.4,
				intent: 0.2
			},
			...config
		};
		
		this.errorHandler = new ErrorHandler(logger);
		
		// Clean up old cache entries periodically
		setInterval(() => this.cleanupEmbeddingCache(), 300000); // Every 5 minutes
	}

	/**
	 * Initialize the service with icon embeddings
	 */
	async initialize(icons: IconMetadata[]): Promise<void> {
		if (this.isInitialized) return;
		
		const startTime = Date.now();
		
		try {
			this.logger.info('Initializing semantic search service', { iconCount: icons.length });
			
			// Generate embeddings for all icons in batches
			await this.generateIconEmbeddings(icons);
			
			this.isInitialized = true;
			const duration = Date.now() - startTime;
			
			this.logger.info('Semantic search service initialized', {
				iconCount: icons.length,
				embeddingCount: this.iconEmbeddings.size,
				duration
			});
			
			// Record telemetry
			this.telemetryService?.recordSearchMetrics({
				operation: 'semantic_initialization',
				duration,
				resultCount: this.iconEmbeddings.size,
				cacheHit: false,
				query: 'initialization'
			});
			
		} catch (error) {
			this.logger.error('Failed to initialize semantic search', { error: error.message });
			throw error;
		}
	}

	/**
	 * Perform semantic search with intent classification
	 */
	async semanticSearch(
		query: string,
		icons: IconMetadata[],
		limit: number = 10
	): Promise<SemanticSearchResult[]> {
		const startTime = Date.now();
		
		const result = await this.errorHandler.safeExecute(
			async () => {
				// Classify user intent
				const intent = this.config.enableIntentClassification 
					? await this.classifyIntent(query)
					: null;
				
				// Generate query embedding
				const queryEmbedding = await this.generateEmbedding(query);
				
				// Calculate semantic similarities
				const results: SemanticSearchResult[] = [];
				
				for (const icon of icons) {
					const iconEmbedding = this.iconEmbeddings.get(icon.name);
					if (!iconEmbedding) continue;
					
					// Calculate semantic similarity
					const semanticScore = this.calculateCosineSimilarity(
						queryEmbedding.embedding,
						iconEmbedding.embedding
					);
					
					if (semanticScore >= this.config.similarityThreshold) {
						// Calculate combined score with intent weighting
						const combinedScore = this.calculateCombinedScore(
							semanticScore,
							0, // Traditional score handled elsewhere
							intent,
							icon
						);
						
						results.push({
							icon,
							semanticScore,
							traditionalScore: 0,
							combinedScore,
							matchType: 'semantic',
							explanation: this.generateExplanation(semanticScore, intent, icon)
						});
					}
				}
				
				// Sort by combined score and limit results
				results.sort((a, b) => b.combinedScore - a.combinedScore);
				const limitedResults = results.slice(0, limit);
				
				const duration = Date.now() - startTime;
				this.logger.debug('Semantic search completed', {
					query,
					resultsFound: results.length,
					resultsReturned: limitedResults.length,
					duration,
					intent: intent?.intent
				});
				
				// Record telemetry
				this.telemetryService?.recordSearchMetrics({
					operation: 'semantic_search',
					duration,
					resultCount: limitedResults.length,
					cacheHit: this.embeddingCache.has(query),
					query
				});
				
				return limitedResults;
			},
			ErrorType.SEARCH,
			'semantic search',
			{ query, limit }
		);
		
		return result.success ? result.data : [];
	}

	/**
	 * Perform hybrid search combining semantic and traditional results
	 */
	async hybridSearch(
		query: string,
		icons: IconMetadata[],
		traditionalResults: ResponseContent[],
		limit: number = 10
	): Promise<SemanticSearchResult[]> {
		const startTime = Date.now();
		
		try {
			// Get semantic results
			const semanticResults = await this.semanticSearch(query, icons, limit * 2);
			
			// Classify intent for weighting
			const intent = this.config.enableIntentClassification 
				? await this.classifyIntent(query)
				: null;
			
			// Create hybrid results by combining scores
			const hybridResults = new Map<string, SemanticSearchResult>();
			
			// Add semantic results
			for (const result of semanticResults) {
				hybridResults.set(result.icon.name, {
					...result,
					matchType: 'hybrid'
				});
			}
			
			// Integrate traditional results
			for (const traditional of traditionalResults) {
				const iconName = this.extractIconNameFromResponse(traditional);
				if (!iconName) continue;
				
				const icon = icons.find(i => i.name === iconName);
				if (!icon) continue;
				
				const existing = hybridResults.get(iconName);
				if (existing) {
					// Combine semantic and traditional scores
					const combinedScore = this.calculateCombinedScore(
						existing.semanticScore,
						0.8, // Estimated traditional score
						intent,
						icon
					);
					
					hybridResults.set(iconName, {
						...existing,
						traditionalScore: 0.8,
						combinedScore,
						explanation: this.generateHybridExplanation(existing.semanticScore, 0.8, intent, icon)
					});
				} else {
					// Add traditional-only result
					hybridResults.set(iconName, {
						icon,
						semanticScore: 0,
						traditionalScore: 0.8,
						combinedScore: 0.8 * this.config.hybridSearchWeights.traditional,
						matchType: 'traditional',
						explanation: 'Traditional search match'
					});
				}
			}
			
			// Sort and limit results
			const finalResults = Array.from(hybridResults.values())
				.sort((a, b) => b.combinedScore - a.combinedScore)
				.slice(0, limit);
			
			const duration = Date.now() - startTime;
			this.logger.debug('Hybrid search completed', {
				query,
				semanticResults: semanticResults.length,
				traditionalResults: traditionalResults.length,
				hybridResults: finalResults.length,
				duration
			});
			
			// Record telemetry
			this.telemetryService?.recordSearchMetrics({
				operation: 'hybrid_search',
				duration,
				resultCount: finalResults.length,
				cacheHit: false,
				query
			});
			
			return finalResults;
			
		} catch (error) {
			this.logger.error('Hybrid search failed', { query, error: error.message });
			return [];
		}
	}

	/**
	 * Classify user intent from query
	 */
	async classifyIntent(query: string): Promise<IntentClassification | null> {
		if (!this.config.enableIntentClassification) return null;
		
		try {
			const startTime = Date.now();
			
			// Simple rule-based classification (could be enhanced with AI model)
			const intent = this.classifyIntentRuleBased(query);
			
			// Extract entities (simple keyword extraction)
			const entities = this.extractEntities(query);
			
			const duration = Date.now() - startTime;
			this.logger.debug('Intent classified', { query, intent: intent.intent, confidence: intent.confidence, duration });
			
			return {
				...intent,
				entities,
				reasoning: [`Classified as ${intent.intent} based on keywords and patterns`]
			};
			
		} catch (error) {
			this.logger.warn('Intent classification failed', { query, error: error.message });
			return null;
		}
	}

	/**
	 * Get semantic search analytics
	 */
	getAnalytics(): {
		embeddingCacheStats: {
			size: number;
			hitRate: number;
			avgHits: number;
		};
		iconEmbeddingStats: {
			count: number;
			avgDimensions: number;
		};
		modelInfo: {
			embeddingModel: string;
			classificationModel: string;
			dimensions: number;
		};
		performanceStats: {
			avgEmbeddingTime: number;
			avgSearchTime: number;
		};
	} {
		const cacheEntries = Array.from(this.embeddingCache.values());
		const hitRate = cacheEntries.length > 0 
			? cacheEntries.reduce((sum, entry) => sum + entry.hitCount, 0) / cacheEntries.length 
			: 0;
		
		return {
			embeddingCacheStats: {
				size: this.embeddingCache.size,
				hitRate,
				avgHits: hitRate
			},
			iconEmbeddingStats: {
				count: this.iconEmbeddings.size,
				avgDimensions: this.config.embeddingDimensions
			},
			modelInfo: {
				embeddingModel: this.config.embeddingModel,
				classificationModel: this.config.classificationModel,
				dimensions: this.config.embeddingDimensions
			},
			performanceStats: {
				avgEmbeddingTime: 0, // Would be calculated from telemetry
				avgSearchTime: 0 // Would be calculated from telemetry
			}
		};
	}

	/**
	 * Clear embeddings and cache
	 */
	clear(): void {
		this.embeddingCache.clear();
		this.iconEmbeddings.clear();
		this.isInitialized = false;
		this.logger.info('Semantic search service cleared');
	}

	/**
	 * Generate embedding for text using Workers AI
	 */
	private async generateEmbedding(text: string): Promise<SemanticVector> {
		// Check cache first
		const cached = this.embeddingCache.get(text);
		if (cached) {
			cached.hitCount++;
			return {
				embedding: cached.embedding,
				dimensions: cached.embedding.length,
				model: cached.model,
				text
			};
		}
		
		try {
			// Call Workers AI for embedding generation
			const response = await this.workersAI.run(this.config.embeddingModel, {
				text: [text]
			});
			
			const embedding = response.data[0];
			
			// Cache the result
			if (this.embeddingCache.size >= this.config.maxEmbeddingCacheSize) {
				// Remove least recently used entry
				this.evictLRUEmbedding();
			}
			
			this.embeddingCache.set(text, {
				text,
				embedding,
				timestamp: Date.now(),
				hitCount: 1,
				model: this.config.embeddingModel
			});
			
			return {
				embedding,
				dimensions: embedding.length,
				model: this.config.embeddingModel,
				text
			};
			
		} catch (error) {
			this.logger.error('Failed to generate embedding', { text, error: error.message });
			throw error;
		}
	}

	/**
	 * Generate embeddings for all icons
	 */
	private async generateIconEmbeddings(icons: IconMetadata[]): Promise<void> {
		const batchSize = 10;
		const batches = this.chunkArray(icons, batchSize);
		
		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];
			this.logger.debug(`Processing embedding batch ${i + 1}/${batches.length}`, { batchSize: batch.length });
			
			await Promise.all(batch.map(async (icon) => {
				try {
					// Create searchable text from icon metadata
					const searchableText = this.createSearchableText(icon);
					const embedding = await this.generateEmbedding(searchableText);
					
					this.iconEmbeddings.set(icon.name, {
						...embedding,
						metadata: { iconName: icon.name, category: icon.category }
					});
					
				} catch (error) {
					this.logger.warn('Failed to generate embedding for icon', { 
						iconName: icon.name, 
						error: error.message 
					});
				}
			}));
			
			// Small delay between batches to avoid rate limits
			if (i < batches.length - 1) {
				await new Promise(resolve => setTimeout(resolve, 100));
			}
		}
	}

	/**
	 * Create searchable text from icon metadata
	 */
	private createSearchableText(icon: IconMetadata): string {
		const parts = [
			icon.name,
			icon.category,
			icon.usage,
			...icon.tags
		];
		
		return parts.filter(Boolean).join(' ');
	}

	/**
	 * Calculate cosine similarity between two vectors
	 */
	private calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
		if (vectorA.length !== vectorB.length) {
			throw new Error('Vectors must have the same dimensions');
		}
		
		let dotProduct = 0;
		let normA = 0;
		let normB = 0;
		
		for (let i = 0; i < vectorA.length; i++) {
			dotProduct += vectorA[i] * vectorB[i];
			normA += vectorA[i] * vectorA[i];
			normB += vectorB[i] * vectorB[i];
		}
		
		const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
		return Math.max(0, Math.min(1, similarity)); // Clamp to [0, 1]
	}

	/**
	 * Calculate combined score with intent weighting
	 */
	private calculateCombinedScore(
		semanticScore: number,
		traditionalScore: number,
		intent: IntentClassification | null,
		icon: IconMetadata
	): number {
		const weights = this.config.hybridSearchWeights;
		let score = semanticScore * weights.semantic + traditionalScore * weights.traditional;
		
		// Apply intent boost
		if (intent && weights.intent > 0) {
			const intentBoost = this.calculateIntentBoost(intent, icon);
			score += intentBoost * weights.intent;
		}
		
		return Math.min(1, score); // Cap at 1.0
	}

	/**
	 * Calculate intent-based boost
	 */
	private calculateIntentBoost(intent: IntentClassification, icon: IconMetadata): number {
		let boost = 0;
		
		switch (intent.intent) {
			case 'search':
				// Boost icons that are commonly searched
				if (icon.tags.some(tag => ['common', 'popular', 'frequent'].includes(tag))) {
					boost = 0.2;
				}
				break;
			case 'browse':
				// Boost category-representative icons
				if (icon.usage.includes('category') || icon.usage.includes('representative')) {
					boost = 0.15;
				}
				break;
			case 'filter':
				// Boost icons that match category/type entities
				for (const entity of intent.entities) {
					if (entity.type === 'category' && icon.category.toLowerCase().includes(entity.value.toLowerCase())) {
						boost = Math.max(boost, entity.confidence * 0.3);
					}
				}
				break;
			default:
				boost = 0;
		}
		
		return boost * intent.confidence;
	}

	/**
	 * Rule-based intent classification
	 */
	private classifyIntentRuleBased(query: string): { intent: string; confidence: number; category: string } {
		const lowerQuery = query.toLowerCase();
		let bestMatch = { intent: 'search', confidence: 0.5, category: 'general' };
		
		for (const [intentType, patterns] of Object.entries(this.intentPatterns)) {
			for (const pattern of patterns) {
				if (lowerQuery.includes(pattern)) {
					const confidence = Math.min(0.9, 0.6 + (pattern.length / query.length) * 0.3);
					if (confidence > bestMatch.confidence) {
						bestMatch = {
							intent: intentType,
							confidence,
							category: this.mapIntentToCategory(intentType)
						};
					}
				}
			}
		}
		
		return bestMatch;
	}

	/**
	 * Extract entities from query
	 */
	private extractEntities(query: string): Array<{ type: string; value: string; confidence: number }> {
		const entities: Array<{ type: string; value: string; confidence: number }> = [];
		const lowerQuery = query.toLowerCase();
		
		// Simple category detection
		const categories = ['system', 'user', 'business', 'design', 'media', 'device', 'weather'];
		for (const category of categories) {
			if (lowerQuery.includes(category)) {
				entities.push({
					type: 'category',
					value: category,
					confidence: 0.8
				});
			}
		}
		
		// Simple action detection
		const actions = ['click', 'select', 'open', 'close', 'edit', 'delete', 'add', 'remove'];
		for (const action of actions) {
			if (lowerQuery.includes(action)) {
				entities.push({
					type: 'action',
					value: action,
					confidence: 0.7
				});
			}
		}
		
		return entities;
	}

	/**
	 * Map intent to category
	 */
	private mapIntentToCategory(intent: string): string {
		const mapping: Record<string, string> = {
			search: 'navigation',
			browse: 'exploration',
			filter: 'refinement',
			compare: 'analysis',
			recommend: 'assistance'
		};
		
		return mapping[intent] || 'general';
	}

	/**
	 * Generate explanation for semantic match
	 */
	private generateExplanation(
		semanticScore: number,
		intent: IntentClassification | null,
		icon: IconMetadata
	): string {
		const reasons: string[] = [];
		
		if (semanticScore > 0.9) reasons.push('Very high semantic similarity');
		else if (semanticScore > 0.8) reasons.push('High semantic similarity');
		else if (semanticScore > 0.7) reasons.push('Good semantic match');
		else reasons.push('Moderate semantic relevance');
		
		if (intent) {
			reasons.push(`Intent: ${intent.intent} (${(intent.confidence * 100).toFixed(0)}% confidence)`);
		}
		
		return reasons.join(', ');
	}

	/**
	 * Generate explanation for hybrid match
	 */
	private generateHybridExplanation(
		semanticScore: number,
		traditionalScore: number,
		intent: IntentClassification | null,
		icon: IconMetadata
	): string {
		const reasons: string[] = [];
		
		if (semanticScore > 0) reasons.push(`Semantic: ${(semanticScore * 100).toFixed(0)}%`);
		if (traditionalScore > 0) reasons.push(`Traditional: ${(traditionalScore * 100).toFixed(0)}%`);
		if (intent) reasons.push(`Intent: ${intent.intent}`);
		
		return `Hybrid match (${reasons.join(', ')})`;
	}

	/**
	 * Extract icon name from response content
	 */
	private extractIconNameFromResponse(response: ResponseContent): string | null {
		if (response.type !== 'text') return null;
		
		const match = response.text.match(/^([^\s]+)/);
		return match ? match[1] : null;
	}

	/**
	 * Chunk array into batches
	 */
	private chunkArray<T>(array: T[], size: number): T[][] {
		const chunks: T[][] = [];
		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size));
		}
		return chunks;
	}

	/**
	 * Evict least recently used embedding from cache
	 */
	private evictLRUEmbedding(): void {
		let oldestEntry: [string, EmbeddingCacheEntry] | null = null;
		let oldestTime = Date.now();
		
		for (const [key, entry] of this.embeddingCache.entries()) {
			if (entry.timestamp < oldestTime) {
				oldestTime = entry.timestamp;
				oldestEntry = [key, entry];
			}
		}
		
		if (oldestEntry) {
			this.embeddingCache.delete(oldestEntry[0]);
		}
	}

	/**
	 * Clean up old cache entries
	 */
	private cleanupEmbeddingCache(): void {
		const now = Date.now();
		const maxAge = 3600000; // 1 hour
		
		for (const [key, entry] of this.embeddingCache.entries()) {
			if (now - entry.timestamp > maxAge && entry.hitCount < 2) {
				this.embeddingCache.delete(key);
			}
		}
	}
}
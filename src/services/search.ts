import { CATEGORY_WEIGHTS, SEARCH_ENGINE_CONFIG, SEMANTIC_GROUPS, SIMILARITY_WEIGHTS, SYNONYMS, SYNONYM_GROUPS } from '../config';
import { SimilarityEngine, TextProcessor } from '../utils';

/**
 * Enhanced search service with complex query support
 */
export class SearchService {
	private similarityCache: Map<string, number> = new Map();
	private cacheAccessOrder: string[] = [];

	/**
	 * Get cached similarity score
	 */
	private getCachedScore(key: string): number | undefined {
		const score = this.similarityCache.get(key);
		if (score !== undefined) {
			const index = this.cacheAccessOrder.indexOf(key);
			if (index > -1) {
				this.cacheAccessOrder.splice(index, 1);
			}
			this.cacheAccessOrder.push(key);
		}
		return score;
	}

	/**
	 * Set cached similarity score
	 */
	private setCachedScore(key: string, score: number): void {
		if (this.similarityCache.size >= SEARCH_ENGINE_CONFIG.MAX_CACHE_SIZE) {
			const oldestKey = this.cacheAccessOrder.shift();
			if (oldestKey) {
				this.similarityCache.delete(oldestKey);
			}
		}
		this.similarityCache.set(key, score);
		this.cacheAccessOrder.push(key);
	}

	/**
	 * Calculate similarity score with enhanced query processing
	 */
	calculateSimilarityScore(description: string, usage: string, category: string, name: string, tags: string[]): number {
		// Expand query with synonyms
		const expandedDescription = this.expandQueryWithSynonyms(description);

		const scores = {
			cosine: this.calculateCosineSimilarity(expandedDescription, usage),
			category: this.calculateCategoryScore(expandedDescription, category),
			tags: this.calculateTagsScore(expandedDescription, tags || []),
			nameMatch: this.calculateNameMatchScore(expandedDescription, name),
			semantic: this.calculateSemanticScore(expandedDescription, usage, tags),
			contextual: this.calculateContextualScore(expandedDescription, category, tags),
		};

		// Enhanced scoring logic
		let enhancedScore = 0;

		// Apply category-specific weight
		const categoryConfig = CATEGORY_WEIGHTS[category as keyof typeof CATEGORY_WEIGHTS];
		if (categoryConfig) {
			enhancedScore += scores.category * categoryConfig.weight;
		}

		// Apply name match boost for strong matches
		if (scores.nameMatch > SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.HIGH_SCORE_THRESHOLD) {
			enhancedScore += scores.nameMatch * SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.NAME_MATCH_BOOST;
		}

		// Apply semantic boost for high semantic relevance
		if (scores.semantic > SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.SEMANTIC_SIMILARITY_THRESHOLD) {
			enhancedScore += scores.semantic * SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.SEMANTIC_GROUP_BOOST;
		}

		// Handle complex queries
		if (this.isComplexQuery(expandedDescription)) {
			enhancedScore = this.handleComplexQuery(expandedDescription, scores, category, tags);
		}

		// Calculate weighted base score
		let weightedSum = 0;
		let totalWeight = 0;

		for (const [key, weight] of Object.entries(SIMILARITY_WEIGHTS)) {
			const score = scores[key as keyof typeof scores];
			weightedSum += score * weight;
			totalWeight += weight;
		}

		const baseScore = weightedSum / totalWeight;

		// Combine base score with enhanced score
		const finalScore = (baseScore + enhancedScore) / 2;

		return Math.min(finalScore, 1); // Normalize final score
	}

	/**
	 * Expand query with synonyms using improved relevance control
	 */
	private expandQueryWithSynonyms(query: string): string {
		const words = TextProcessor.splitWords(query);
		const expandedWords = new Set<string>();
		const weightedExpansions = new Map<string, number>();

		// Process each word in the query
		for (const word of words) {
			expandedWords.add(word);
			let hasDirectMatch = false;

			// Add direct synonyms with weights
			for (const [key, synonyms] of Object.entries(SYNONYMS)) {
				if (key === word) {
					hasDirectMatch = true;
					expandedWords.add(key);
					synonyms.forEach((syn) => {
						weightedExpansions.set(syn, (weightedExpansions.get(syn) || 0) + 1.0);
					});
				} else if (synonyms.includes(word)) {
					hasDirectMatch = true;
					expandedWords.add(key);
					synonyms.forEach((syn) => {
						if (syn !== word) {
							weightedExpansions.set(syn, (weightedExpansions.get(syn) || 0) + 0.8);
						}
					});
				}
			}

			// Add group synonyms with lower weights if no direct match
			if (!hasDirectMatch) {
				for (const [group, terms] of Object.entries(SYNONYM_GROUPS)) {
					if (terms.includes(word)) {
						terms.forEach((term) => {
							if (term !== word) {
								weightedExpansions.set(term, (weightedExpansions.get(term) || 0) + 0.6);
							}
						});
					}
				}
			}
		}

		// Filter and add weighted expansions
		const expansionThreshold = 0.6;
		for (const [term, weight] of weightedExpansions.entries()) {
			if (weight >= expansionThreshold) {
				expandedWords.add(term);
			}
		}

		// Combine original and expanded terms
		return Array.from(expandedWords).join(' ');
	}

	/**
	 * Check if query is complex
	 */
	private isComplexQuery(query: string): boolean {
		const words = TextProcessor.splitWords(query);
		return words.length > 3 || query.includes(' and ') || query.includes(' or ');
	}

	/**
	 * Handle complex query scoring
	 */
	private handleComplexQuery(query: string, scores: any, category: string, tags: string[]): number {
		const words = TextProcessor.splitWords(query);
		const queryParts = this.splitComplexQuery(query);

		// Calculate base scores for each part
		const partScores = queryParts.map((part) => {
			const partScore = this.calculateQueryPartScore(part, category, tags);
			const semanticScore = this.calculateSemanticScore(part, '', tags);
			return Math.max(partScore, semanticScore);
		});

		// Calculate combined score based on query structure
		let complexScore = 0;
		if (query.includes(' and ')) {
			// For AND queries, use average of part scores with a boost
			complexScore = (partScores.reduce((a, b) => a + b, 0) / partScores.length) * SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.COMPOUND_MATCH_BOOST;
		} else if (query.includes(' or ')) {
			// For OR queries, use maximum score
			complexScore = Math.max(...partScores) * SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.MULTI_TERM_BOOST;
		} else {
			// For space-separated queries, use weighted average
			const weights = partScores.map((_, index) => 1 - index * 0.1); // Decrease weight for later terms
			complexScore = partScores.reduce((sum, score, index) => sum + score * weights[index], 0) / weights.reduce((a, b) => a + b, 0);
		}

		// Apply length penalties and boosts
		const lengthPenalty = Math.max(0.7, 1 - (words.length - 3) * 0.05);
		const coherenceBoost = this.calculateQueryCoherence(queryParts);

		return complexScore * lengthPenalty * coherenceBoost;
	}

	/**
	 * Calculate query coherence score
	 */
	private calculateQueryCoherence(queryParts: string[]): number {
		let coherenceScore = 1.0;

		// Check semantic relationships between parts
		for (let i = 0; i < queryParts.length - 1; i++) {
			const current = queryParts[i];
			const next = queryParts[i + 1];

			// Check if parts are semantically related
			if (this.areTermsRelated(current, next)) {
				coherenceScore *= 1.1; // Boost for related terms
			}
		}

		return Math.min(1.5, coherenceScore); // Cap maximum boost
	}

	/**
	 * Check if terms are semantically related
	 */
	private areTermsRelated(term1: string, term2: string): boolean {
		// Check direct synonyms
		for (const [key, synonyms] of Object.entries(SYNONYMS)) {
			if (
				(key === term1 && synonyms.includes(term2)) ||
				(key === term2 && synonyms.includes(term1)) ||
				(synonyms.includes(term1) && synonyms.includes(term2))
			) {
				return true;
			}
		}

		// Check synonym groups
		for (const [_, terms] of Object.entries(SYNONYM_GROUPS)) {
			if (terms.includes(term1) && terms.includes(term2)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Split complex query with improved parsing
	 */
	private splitComplexQuery(query: string): string[] {
		// Handle explicit logical operators
		if (query.includes(' and ') || query.includes(' or ')) {
			return query
				.toLowerCase()
				.split(/\s+(?:and|or)\s+/)
				.map((part) => part.trim())
				.filter((part) => part.length > 0);
		}

		// Handle implicit grouping
		const words = TextProcessor.splitWords(query);
		const groups: string[] = [];
		let currentGroup: string[] = [];

		for (let i = 0; i < words.length; i++) {
			currentGroup.push(words[i]);

			// Check if current word forms a meaningful phrase with next word
			if (i < words.length - 1 && this.areTermsRelated(words[i], words[i + 1])) {
				continue;
			}

			// Add current group and start new one
			if (currentGroup.length > 0) {
				groups.push(currentGroup.join(' '));
				currentGroup = [];
			}
		}

		// Add remaining words
		if (currentGroup.length > 0) {
			groups.push(currentGroup.join(' '));
		}

		return groups;
	}

	/**
	 * Calculate cosine similarity between two strings
	 */
	private calculateCosineSimilarity(str1: string, str2: string): number {
		const words1 = TextProcessor.splitWords(str1);
		const words2 = TextProcessor.splitWords(str2);

		// Create term frequency maps
		const tf1 = new Map<string, number>();
		const tf2 = new Map<string, number>();

		words1.forEach((word) => {
			tf1.set(word, (tf1.get(word) || 0) + 1);
		});

		words2.forEach((word) => {
			tf2.set(word, (tf2.get(word) || 0) + 1);
		});

		const uniqueTerms = new Set([...tf1.keys(), ...tf2.keys()]);

		let dotProduct = 0;
		let magnitude1 = 0;
		let magnitude2 = 0;

		uniqueTerms.forEach((term) => {
			const freq1 = tf1.get(term) || 0;
			const freq2 = tf2.get(term) || 0;

			dotProduct += freq1 * freq2;
			magnitude1 += freq1 * freq1;
			magnitude2 += freq2 * freq2;
		});

		if (magnitude1 === 0 || magnitude2 === 0) {
			return 0;
		}

		return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
	}

	/**
	 * Calculate category score with improved matching
	 */
	private calculateCategoryScore(description: string, category: string): number {
		const categoryConfig = SEMANTIC_GROUPS[category as keyof typeof SEMANTIC_GROUPS];
		const categoryWeight = categoryConfig?.weight || 0.7;
		const descWords = TextProcessor.splitWords(description);
		const categoryWords = TextProcessor.splitWords(category);

		// Direct category match
		if (description.toLowerCase().includes(category.toLowerCase())) {
			return Math.min(1, categoryWeight * SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.EXACT_MATCH_BOOST);
		}

		// Enhanced word matching
		let maxScore = 0;
		let totalScore = 0;
		let matchedWords = 0;

		for (const descWord of descWords) {
			let wordBestScore = 0;
			for (const catWord of categoryWords) {
				const similarity = SimilarityEngine.calculateNGramSimilarity(descWord, catWord, 2);
				if (similarity > SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.SEMANTIC_THRESHOLD) {
					matchedWords++;
				}
				wordBestScore = Math.max(wordBestScore, similarity);
			}
			totalScore += wordBestScore;
			maxScore = Math.max(maxScore, wordBestScore);
		}

		// Calculate final category score
		const avgScore = totalScore / descWords.length;
		const matchRatio = matchedWords / descWords.length;

		return Math.min(1, (avgScore * 0.6 + maxScore * 0.4) * categoryWeight * (1 + matchRatio));
	}

	/**
	 * Calculate tags score with enhanced matching
	 */
	private calculateTagsScore(description: string, tags: string[]): number {
		if (!tags || tags.length === 0) {
			return 0;
		}

		const descWords = new Set(TextProcessor.splitWords(description));
		let totalScore = 0;
		let maxTagScore = 0;

		for (const tag of tags) {
			const tagWords = TextProcessor.splitWords(tag);
			let tagScore = 0;

			// Word match scoring
			const matchCount = tagWords.filter((word) => descWords.has(word)).length;
			if (matchCount > 0) {
				tagScore = matchCount / tagWords.length;
			}

			// Partial match scoring
			for (const tagWord of tagWords) {
				let wordBestScore = 0;
				for (const descWord of descWords) {
					const similarity = SimilarityEngine.calculateNGramSimilarity(tagWord, descWord, 2);
					wordBestScore = Math.max(wordBestScore, similarity);
				}
				tagScore = Math.max(tagScore, wordBestScore);
			}

			totalScore += tagScore;
			maxTagScore = Math.max(maxTagScore, tagScore);
		}

		return Math.min(1, (totalScore / tags.length) * 0.7 + maxTagScore * 0.3);
	}

	/**
	 * Calculate name match score with enhanced matching
	 */
	private calculateNameMatchScore(description: string, name: string): number {
		const cleanName = name.replace(/-(?:fill|line|3-line)$/, '');
		const descWords = TextProcessor.splitWords(description);
		const nameWords = TextProcessor.splitWords(cleanName);

		// Exact match check
		if (description === cleanName) {
			return 1.0;
		}

		let totalScore = 0;
		let maxScore = 0;

		for (const descWord of descWords) {
			let wordBestScore = 0;
			for (const nameWord of nameWords) {
				const similarity = SimilarityEngine.calculateNGramSimilarity(descWord, nameWord, 2);
				wordBestScore = Math.max(wordBestScore, similarity);
			}
			totalScore += wordBestScore;
			maxScore = Math.max(maxScore, wordBestScore);
		}

		const score = totalScore / Math.max(descWords.length, nameWords.length);
		return Math.min(1, score * 0.7 + maxScore * 0.3);
	}

	/**
	 * Calculate semantic score with improved synonym handling
	 */
	private calculateSemanticScore(description: string, usage: string, tags: string[]): number {
		const descWords = TextProcessor.splitWords(description);
		const usageWords = TextProcessor.splitWords(usage);
		const allWords = new Set([...usageWords, ...tags]);

		let semanticScore = 0;
		let maxScore = 0;
		let matchCount = 0;
		let synonymMatchBoost = 0;

		for (const descWord of descWords) {
			let wordBestScore = 0;
			let hasSynonymMatch = false;

			for (const targetWord of allWords) {
				const similarity = SimilarityEngine.calculateNGramSimilarity(descWord, targetWord, 2);

				// Check for synonym matches
				if (this.areSynonyms(descWord, targetWord)) {
					hasSynonymMatch = true;
					wordBestScore = Math.max(wordBestScore, similarity * 1.2);
				} else {
					wordBestScore = Math.max(wordBestScore, similarity);
				}

				if (similarity > SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.SEMANTIC_THRESHOLD) {
					matchCount++;
				}
			}

			if (hasSynonymMatch) {
				synonymMatchBoost += 0.1;
			}

			semanticScore += wordBestScore;
			maxScore = Math.max(maxScore, wordBestScore);
		}

		const avgScore = semanticScore / descWords.length;
		const matchRatio = matchCount / (descWords.length * allWords.size);

		return Math.min(
			1,
			avgScore * 0.6 + maxScore * 0.3 + matchRatio * SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.SEMANTIC_GROUP_BOOST + synonymMatchBoost
		);
	}

	/**
	 * Check if two terms are synonyms
	 */
	private areSynonyms(term1: string, term2: string): boolean {
		// Check direct synonyms
		for (const [key, synonyms] of Object.entries(SYNONYMS)) {
			if (
				(key === term1 && synonyms.includes(term2)) ||
				(key === term2 && synonyms.includes(term1)) ||
				(synonyms.includes(term1) && synonyms.includes(term2))
			) {
				return true;
			}
		}

		// Check synonym groups
		for (const [_, terms] of Object.entries(SYNONYM_GROUPS)) {
			if (terms.includes(term1) && terms.includes(term2)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Calculate contextual score based on category and common usage patterns
	 */
	private calculateContextualScore(description: string, category: string, tags: string[]): number {
		const descWords = TextProcessor.splitWords(description);
		const allContextWords = [...TextProcessor.splitWords(category), ...tags];

		let contextScore = 0;
		for (const descWord of descWords) {
			let wordScore = 0;
			for (const contextWord of allContextWords) {
				const similarity = SimilarityEngine.calculateNGramSimilarity(descWord, contextWord, 2);
				wordScore = Math.max(wordScore, similarity);
			}
			contextScore += wordScore;
		}

		return contextScore / Math.max(1, descWords.length);
	}

	/**
	 * Check for cross-category matches
	 */
	private hasCrossCategoryMatch(description: string, category: string, tags: string[]): boolean {
		const descWords = TextProcessor.splitWords(description);
		const categoryWords = TextProcessor.splitWords(category);
		const allWords = new Set([...categoryWords, ...tags]);

		let matches = 0;
		for (const word of descWords) {
			if (allWords.has(word)) {
				matches++;
			}
		}

		return matches >= 2; // At least two words match across categories
	}

	/**
	 * Check for compound words in description
	 */
	private hasCompoundWords(description: string): boolean {
		const words = TextProcessor.splitWords(description);
		return words.some((word) => word.includes('-') || word.length > 12);
	}

	/**
	 * Calculate partial match score
	 */
	private calculatePartialMatchScore(description: string, usage: string, tags: string[]): number {
		const descWords = TextProcessor.splitWords(description);
		const targetWords = new Set([...TextProcessor.splitWords(usage), ...tags]);

		let partialMatches = 0;
		for (const descWord of descWords) {
			for (const targetWord of targetWords) {
				if (targetWord.includes(descWord) || descWord.includes(targetWord)) {
					partialMatches++;
					break;
				}
			}
		}

		return partialMatches / descWords.length;
	}

	/**
	 * Calculate score for query part
	 */
	private calculateQueryPartScore(queryPart: string, category: string, tags: string[]): number {
		const words = TextProcessor.splitWords(queryPart);
		let score = 0;

		// Check category match
		if (category.toLowerCase().includes(queryPart)) {
			score += SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.CATEGORY_BOOST;
		}

		// Check tag matches
		const matchingTags = tags.filter((tag) => tag.toLowerCase().includes(queryPart) || queryPart.includes(tag.toLowerCase()));
		if (matchingTags.length > 0) {
			score += SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.MULTI_TERM_BOOST * (matchingTags.length / tags.length);
		}

		// Check semantic group matches
		for (const [group, terms] of Object.entries(SYNONYM_GROUPS)) {
			if (terms.some((term) => queryPart.includes(term))) {
				score += SEARCH_ENGINE_CONFIG.SEARCH_PARAMS.SEMANTIC_GROUP_BOOST;
				break;
			}
		}

		// Apply word count boost
		const wordCount = words.length;
		if (wordCount > 1) {
			score *= 1 + (wordCount - 1) * 0.1; // 10% boost per additional word
		}

		return Math.min(score, 1); // Normalize score
	}
}

import { SEMANTIC_GROUPS } from '../../config/semantic';
import { SearchConfig, SearchParams, SearchScores } from '../../types/search';
import { ILogger } from '../../utils/Logger';

export interface IScorer {
	calculate(params: SearchParams): number;
	calculatePartialScores(params: SearchParams): SearchScores;
}

export class SearchScorer implements IScorer {
	constructor(private readonly config: SearchConfig, private readonly logger: ILogger) {}

	calculate(params: SearchParams): number {
		try {
			const scores = this.calculatePartialScores(params);
			return this.combineScores(scores);
		} catch (error) {
			this.logger.error('Error calculating score', { error, params });
			return 0;
		}
	}

	calculatePartialScores(params: SearchParams): SearchScores {
		return {
			cosine: this.calculateCosineSimilarity(params.description, params.usage),
			category: this.calculateCategoryScore(params.description, params.category),
			tags: this.calculateTagsScore(params.description, params.tags),
			nameMatch: this.calculateNameMatchScore(params.description, params.name),
			semantic: this.calculateSemanticScore(params),
			contextual: this.calculateContextualScore(params),
		};
	}

	private combineScores(scores: SearchScores): number {
		const { weights } = this.config;
		let totalScore = 0;
		let totalWeight = 0;

		for (const [key, score] of Object.entries(scores)) {
			const weight = weights[key as keyof typeof weights];
			totalScore += score * weight;
			totalWeight += weight;
		}

		return Math.min(1, totalScore / totalWeight);
	}

	private calculateCosineSimilarity(str1: string, str2: string): number {
		// 实现余弦相似度计算
		const words1 = str1.toLowerCase().split(/\s+/);
		const words2 = str2.toLowerCase().split(/\s+/);

		const freqMap1 = new Map<string, number>();
		const freqMap2 = new Map<string, number>();

		words1.forEach((word) => {
			freqMap1.set(word, (freqMap1.get(word) || 0) + 1);
		});

		words2.forEach((word) => {
			freqMap2.set(word, (freqMap2.get(word) || 0) + 1);
		});

		let dotProduct = 0;
		let norm1 = 0;
		let norm2 = 0;

		const uniqueWords = new Set([...freqMap1.keys(), ...freqMap2.keys()]);

		uniqueWords.forEach((word) => {
			const freq1 = freqMap1.get(word) || 0;
			const freq2 = freqMap2.get(word) || 0;
			dotProduct += freq1 * freq2;
			norm1 += freq1 * freq1;
			norm2 += freq2 * freq2;
		});

		if (norm1 === 0 || norm2 === 0) return 0;
		return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
	}

	private calculateCategoryScore(description: string, category: string): number {
		const descWords = description.toLowerCase().split(/\s+/);
		const catWords = category.toLowerCase().split(/\s+/);

		let maxScore = 0;
		descWords.forEach((descWord) => {
			catWords.forEach((catWord) => {
				const similarity = this.calculateWordSimilarity(descWord, catWord);
				maxScore = Math.max(maxScore, similarity);
			});
		});

		return maxScore;
	}

	private calculateTagsScore(description: string, tags: string[]): number {
		if (!tags.length) return 0;

		const descWords = description.toLowerCase().split(/\s+/);
		let totalScore = 0;

		tags.forEach((tag) => {
			const tagWords = tag.toLowerCase().split(/\s+/);
			let tagScore = 0;

			descWords.forEach((descWord) => {
				tagWords.forEach((tagWord) => {
					const similarity = this.calculateWordSimilarity(descWord, tagWord);
					tagScore = Math.max(tagScore, similarity);
				});
			});

			totalScore += tagScore;
		});

		return totalScore / tags.length;
	}

	private calculateNameMatchScore(description: string, name: string): number {
		const descWords = description.toLowerCase().split(/\s+/);
		const nameWords = name.toLowerCase().split(/\s+/);

		let totalScore = 0;
		descWords.forEach((descWord) => {
			nameWords.forEach((nameWord) => {
				totalScore += this.calculateWordSimilarity(descWord, nameWord);
			});
		});

		return totalScore / (descWords.length * nameWords.length);
	}

	private calculateSemanticScore(params: SearchParams): number {
		const { description } = params;
		const descWords = description.toLowerCase().split(/\s+/);

		let totalScore = 0;
		let maxGroupScore = 0;

		// 遍历每个语义组
		for (const [groupKey, group] of Object.entries(SEMANTIC_GROUPS)) {
			let groupScore = 0;

			// 1. 直接词语匹配
			for (const descWord of descWords) {
				let wordScore = 0;
				// 检查组内的每个词
				for (const semanticWord of group.words) {
					const similarity = this.calculateWordSimilarity(descWord, semanticWord.word);
					wordScore = Math.max(wordScore, similarity * (semanticWord.weight || 1.0));
				}
				groupScore += wordScore;
			}

			// 2. 相关词匹配
			for (const descWord of descWords) {
				let relatedScore = 0;
				for (const relatedWord of group.related) {
					const similarity = this.calculateWordSimilarity(descWord, relatedWord);
					relatedScore = Math.max(relatedScore, similarity * 0.8); // 相关词权重略低
				}
				groupScore += relatedScore;
			}

			// 3. 图标类型匹配
			if (group.iconTypes) {
				for (const descWord of descWords) {
					let iconScore = 0;
					for (const iconType of group.iconTypes) {
						const similarity = this.calculateWordSimilarity(descWord, iconType);
						iconScore = Math.max(iconScore, similarity * 0.9); // 图标类型权重适中
					}
					groupScore += iconScore;
				}
			}

			// 应用组权重和元数据优先级
			const priorityBoost = group.metadata?.priority ? group.metadata.priority / 5 : 1;
			groupScore *= group.weight * priorityBoost;

			// 更新最高分
			maxGroupScore = Math.max(maxGroupScore, groupScore);
			totalScore += groupScore;
		}

		// 综合评分：考虑最高组得分和总体得分
		const normalizedScore = (maxGroupScore * 0.7 + (totalScore / Object.keys(SEMANTIC_GROUPS).length) * 0.3) / descWords.length;

		// 确保分数在0-1范围内
		return Math.min(1, Math.max(0, normalizedScore));
	}

	private calculateContextualScore(params: SearchParams): number {
		// 实现上下文评分计算
		const { description, category, tags } = params;
		const descWords = description.toLowerCase().split(/\s+/);
		const contextWords = new Set([...category.toLowerCase().split(/\s+/), ...tags.map((tag) => tag.toLowerCase())]);

		let totalScore = 0;
		descWords.forEach((word) => {
			let maxScore = 0;
			contextWords.forEach((contextWord) => {
				const similarity = this.calculateWordSimilarity(word, contextWord);
				maxScore = Math.max(maxScore, similarity);
			});
			totalScore += maxScore;
		});

		return totalScore / descWords.length;
	}

	private calculateWordSimilarity(word1: string, word2: string): number {
		if (word1 === word2) return 1;
		if (word1.includes(word2) || word2.includes(word1)) return 0.8;

		const len1 = word1.length;
		const len2 = word2.length;
		const matrix: number[][] = Array(len1 + 1)
			.fill(0)
			.map(() => Array(len2 + 1).fill(0));

		for (let i = 0; i <= len1; i++) matrix[i][0] = i;
		for (let j = 0; j <= len2; j++) matrix[0][j] = j;

		for (let i = 1; i <= len1; i++) {
			for (let j = 1; j <= len2; j++) {
				const cost = word1[i - 1] === word2[j - 1] ? 0 : 1;
				matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
			}
		}

		const maxLen = Math.max(len1, len2);
		return 1 - matrix[len1][len2] / maxLen;
	}
}

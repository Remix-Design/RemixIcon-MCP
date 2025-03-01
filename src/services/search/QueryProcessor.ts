import { SEMANTIC_GROUPS, SYNONYM_GROUPS, SYNONYM_MAP } from '../../config/semantic';
import { SearchConfig } from '../../types/search';
import { ILogger } from '../../utils/Logger';

export interface IQueryProcessor {
	processQuery(query: string): string;
	splitComplexQuery(query: string): string[];
}

export class QueryProcessor implements IQueryProcessor {
	constructor(private readonly config: SearchConfig, private readonly logger: ILogger) {}

	processQuery(query: string): string {
		try {
			const normalizedQuery = this.normalizeQuery(query);
			const expandedQuery = this.expandWithSynonyms(normalizedQuery);
			return expandedQuery;
		} catch (error) {
			this.logger.error('Error processing query', { error, query });
			return query;
		}
	}

	splitComplexQuery(query: string): string[] {
		if (query.includes(' and ') || query.includes(' or ')) {
			return query
				.toLowerCase()
				.split(/\s+(?:and|or)\s+/)
				.map((part) => part.trim())
				.filter((part) => part.length > 0);
		}

		return this.splitIntoMeaningfulPhrases(query);
	}

	private normalizeQuery(query: string): string {
		return query.toLowerCase().trim();
	}

	private expandWithSynonyms(query: string): string {
		const words = query.split(/\s+/);
		const expandedWords = new Set<string>();

		for (const word of words) {
			// 添加原始词
			expandedWords.add(word);

			// 1. 检查语义组匹配
			for (const group of Object.values(SEMANTIC_GROUPS)) {
				// 检查词是否在组内词语中
				const matchedWord = group.words.find((w) => this.calculateWordSimilarity(w.word, word) > 0.8);

				if (matchedWord) {
					// 添加组内的相关词
					group.related.forEach((r) => expandedWords.add(r));
					// 添加组内的其他高权重词
					group.words.filter((w) => w.weight && w.weight >= 1.5).forEach((w) => expandedWords.add(w.word));
					// 添加图标类型
					group.iconTypes?.forEach((t) => expandedWords.add(t));
				}
			}

			// 2. 检查直接同义词映射
			if (SYNONYM_MAP[word]) {
				SYNONYM_MAP[word].forEach((synonym) => expandedWords.add(synonym));
			}

			// 3. 检查同义词组
			for (const [groupKey, synonyms] of Object.entries(SYNONYM_GROUPS)) {
				if (synonyms.includes(word)) {
					synonyms.forEach((s) => expandedWords.add(s));
				}
			}
		}

		return Array.from(expandedWords).join(' ');
	}

	private splitIntoMeaningfulPhrases(query: string): string[] {
		// 基于语义组和同义词组进行短语分割
		const words = query.toLowerCase().split(/\s+/);
		const phrases: string[] = [];
		let currentPhrase: string[] = [];

		for (let i = 0; i < words.length; i++) {
			const word = words[i];
			currentPhrase.push(word);

			// 检查当前短语是否匹配某个语义组
			const phraseStr = currentPhrase.join(' ');
			let foundMatch = false;

			// 检查语义组
			for (const group of Object.values(SEMANTIC_GROUPS)) {
				if (group.words.some((w) => w.word.includes(phraseStr))) {
					phrases.push(currentPhrase.join(' '));
					currentPhrase = [];
					foundMatch = true;
					break;
				}
			}

			// 检查是否是最后一个词
			if (i === words.length - 1 && currentPhrase.length > 0) {
				phrases.push(currentPhrase.join(' '));
			}
		}

		return phrases.length > 0 ? phrases : [query];
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

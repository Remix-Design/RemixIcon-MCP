import { describe, expect, it } from 'vitest';
import { SimilarityEngine } from '../../src/utils/similarity/similarity';

/**
 * Unit tests for the SimilarityEngine
 */
describe('SimilarityEngine', () => {
	describe('calculateNormalizedEditDistance', () => {
		it('should return 1 for identical strings', () => {
			const result = SimilarityEngine.calculateNormalizedEditDistance('test', 'test');
			expect(result).toBe(1);
		});

		it('should handle empty strings correctly', () => {
			const result = SimilarityEngine.calculateNormalizedEditDistance('', '');
			expect(result).toBe(0);
		});

		it('should handle null or undefined inputs', () => {
			const result1 = SimilarityEngine.calculateNormalizedEditDistance('', null as any);
			const result2 = SimilarityEngine.calculateNormalizedEditDistance(null as any, '');
			const result3 = SimilarityEngine.calculateNormalizedEditDistance(undefined as any, '');

			expect(result1).toBe(0);
			expect(result2).toBe(0);
			expect(result3).toBe(0);
		});

		it('should calculate similarity for similar strings', () => {
			const result = SimilarityEngine.calculateNormalizedEditDistance('kitten', 'sitting');

			// The edit distance between 'kitten' and 'sitting' is 3
			// Normalized by max length (7), it should be 1 - 3/7 = ~0.57
			expect(result).toBeGreaterThan(0.5);
			expect(result).toBeLessThan(0.7);
		});
	});

	describe('calculateCosineSimilarity', () => {
		it('should return 1 for identical strings', () => {
			const result = SimilarityEngine.calculateCosineSimilarity('test string', 'test string');
			expect(result).toBe(1);
		});

		it('should handle empty strings', () => {
			const result = SimilarityEngine.calculateCosineSimilarity('', '');
			expect(result).toBe(0);
		});

		it('should calculate similarity for related strings', () => {
			const result = SimilarityEngine.calculateCosineSimilarity('icon search', 'search for icons');
			expect(result).toBeGreaterThan(0.3);
		});
	});
});

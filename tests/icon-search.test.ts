import { describe, expect, it } from 'vitest';
import { parseKeywordInput, searchIconsByKeywords } from '../src/icon-search';

describe('parseKeywordInput', () => {
  it('splits comma separated keywords and normalises case', () => {
    const parsed = parseKeywordInput('Layout, GRID, design');
    expect(parsed).toEqual(['layout', 'grid', 'design']);
  });

  it('handles whitespace and unicode punctuation', () => {
    const parsed = parseKeywordInput('导航 / 菜单; UI');
    expect(parsed).toEqual(['导航', '菜单', 'ui']);
  });
});

describe('searchIconsByKeywords', () => {
  it('returns ranked icons for exact token matches', () => {
    const results = searchIconsByKeywords(['layout']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.matchedKeywords).toContain('layout');
  });

  it('applies prefix search when exact token is missing', () => {
    const results = searchIconsByKeywords(['layo']);
    expect(results.length).toBeGreaterThan(0);
    const matchedTokens = results[0]?.matchedKeywords ?? [];
    expect(matchedTokens.some((token) => token.startsWith('layo'))).toBe(true);
  });

  it('returns empty array for unknown keywords', () => {
    expect(searchIconsByKeywords(['nonexistentkeyword'])).toEqual([]);
  });
});

import iconCatalog from './data/icon-catalog.json';
import { IconMetadata, IconSearchResult } from './icon-types';

const WORD_BOUNDARY = /[\p{P}\p{S}\s]+/u;

interface IndexedIcon {
  icon: IconMetadata;
  tokens: Set<string>;
}

const icons: IconMetadata[] = (iconCatalog as { icons: IconMetadata[] }).icons;

const indexedIcons: IndexedIcon[] = icons.map((icon) => ({
  icon,
  tokens: buildTokenSet(icon)
}));

const invertedIndex = buildInvertedIndex(indexedIcons);

function buildTokenSet(icon: IconMetadata): Set<string> {
  const tokens = new Set<string>();
  const addTokens = (value: string | string[] | undefined) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        tokenize(entry).forEach((token) => tokens.add(token));
      }
      return;
    }

    tokenize(value).forEach((token) => tokens.add(token));
  };

  addTokens(icon.name);
  addTokens(icon.baseName);
  addTokens(icon.category);
  addTokens(icon.style);
  addTokens(icon.usage);
  addTokens(icon.tags);

  return tokens;
}

function buildInvertedIndex(list: IndexedIcon[]): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();

  list.forEach((entry, idx) => {
    entry.tokens.forEach((token) => {
      if (!index.has(token)) {
        index.set(token, new Set<number>());
      }
      index.get(token)!.add(idx);
    });
  });

  return index;
}

function tokenize(value: string): string[] {
  return value
    .split(WORD_BOUNDARY)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

export function parseKeywordInput(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((keyword) => keyword.trim().toLowerCase())
    .flatMap((keyword) => tokenize(keyword))
    .filter(Boolean);
}

export function searchIconsByKeywords(keywords: string[], limit = 20): IconSearchResult[] {
  if (keywords.length === 0) {
    return [];
  }

  const scores = new Map<number, { score: number; matched: Set<string> }>();

  for (const keyword of keywords) {
    const normalized = keyword.toLowerCase();

    const directMatches = invertedIndex.get(normalized);
    if (directMatches) {
      for (const iconIndex of directMatches) {
        const entry = scores.get(iconIndex) ?? { score: 0, matched: new Set<string>() };
        entry.score += 2; // weighted higher for exact token match
        entry.matched.add(normalized);
        scores.set(iconIndex, entry);
      }
      continue;
    }

    // Fallback to prefix matching across the known tokens for broader keyword support
    for (const [token, iconIndexes] of invertedIndex) {
      if (!token.startsWith(normalized)) {
        continue;
      }
      for (const iconIndex of iconIndexes) {
        const entry = scores.get(iconIndex) ?? { score: 0, matched: new Set<string>() };
        entry.score += 1;
        entry.matched.add(token);
        scores.set(iconIndex, entry);
      }
    }
  }

  const ranked = Array.from(scores.entries())
    .map(([idx, value]) => ({
      icon: indexedIcons[idx]!.icon,
      score: value.score,
      matchedKeywords: Array.from(value.matched).sort()
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.icon.name.localeCompare(b.icon.name);
    });

  return ranked.slice(0, limit);
}

export function getIconCount(): number {
  return icons.length;
}

export interface IconMetadata {
  name: string;
  path: string;
  category: string;
  style: string;
  usage: string;
  baseName: string;
  tags: string[];
}

export interface IconSearchResult {
  icon: IconMetadata;
  score: number;
  matchedKeywords: string[];
}

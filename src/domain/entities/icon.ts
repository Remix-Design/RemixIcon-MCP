export interface IconMetadata {
  readonly name: string;
  readonly path: string;
  readonly category: string;
  readonly style: string;
  readonly usage: string;
  readonly baseName: string;
  readonly tags: readonly string[];
}

export interface IconMatch {
  readonly icon: IconMetadata;
  readonly score: number;
  readonly matchedTokens: readonly string[];
}

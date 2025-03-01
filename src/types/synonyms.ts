/**
 * Core synonym configuration
 */
export interface SynonymConfig {
	words: Record<string, readonly string[]>;
	groups: Record<string, readonly string[]>;
}

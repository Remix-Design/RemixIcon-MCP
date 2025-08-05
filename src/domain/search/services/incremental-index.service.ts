import { ILogger } from '../../../infrastructure/logging/logger';
import { ErrorHandler, ErrorType } from '../../../infrastructure/error/error-handler';
import { IconMetadata } from '../../icon/types/icon.types';
import { SearchConfig } from '../types/search.types';
import { IKVStorage } from '../../../infrastructure/storage/kv-storage.service';
import { TextProcessor } from '../../../utils/text/text-processor';

/**
 * Index version metadata
 */
interface IndexVersion {
	version: string;
	timestamp: number;
	iconCount: number;
	checksum: string;
	ngramVersion: string;
}

/**
 * N-gram index entry
 */
interface NgramEntry {
	ngram: string;
	iconNames: string[];
	frequency: number;
}

/**
 * Index delta for incremental updates
 */
interface IndexDelta {
	added: IconMetadata[];
	removed: string[]; // Icon names
	modified: IconMetadata[];
	version: string;
}

/**
 * Incremental index service for efficient index updates
 * Supports versioning, n-gram pre-computation, and delta updates
 */
export class IncrementalIndexService {
	private static readonly CURRENT_INDEX_VERSION = '1.0.0';
	private static readonly NGRAM_SIZE = 3;
	private static readonly INDEX_VERSION_KEY = 'index_version';
	private static readonly NGRAM_INDEX_PREFIX = 'ngram_';
	
	private currentVersion: IndexVersion | null = null;
	private ngramIndex: Map<string, NgramEntry> = new Map();
	private readonly errorHandler: ErrorHandler;
	
	constructor(
		private readonly kvStorage: IKVStorage,
		private readonly config: SearchConfig,
		private readonly logger: ILogger
	) {
		this.errorHandler = new ErrorHandler(logger);
	}

	/**
	 * Initialize or update the incremental index
	 */
	async initializeIndex(icons: IconMetadata[], forceRebuild: boolean = false): Promise<void> {
		const result = await this.errorHandler.safeExecute(
			async () => {
				// Load current version info
				await this.loadVersionInfo();
				
				// Check if rebuild is needed
				const needsRebuild = forceRebuild || await this.needsIndexRebuild(icons);
				
				if (needsRebuild) {
					this.logger.info('Performing full index rebuild');
					await this.performFullRebuild(icons);
				} else {
					this.logger.info('Performing incremental index update');
					await this.performIncrementalUpdate(icons);
				}
				
				// Load n-gram index into memory
				await this.loadNgramIndex();
			},
			ErrorType.SEARCH,
			'initialize incremental index',
			{ iconCount: icons.length, forceRebuild }
		);

		if (!result.success) {
			throw new Error(`Failed to initialize incremental index: ${result.error?.message}`);
		}
	}

	/**
	 * Get n-gram matches for a query
	 */
	async getNgramMatches(query: string): Promise<Map<string, number>> {
		const ngrams = this.generateNgrams(TextProcessor.normalizeInput(query));
		const matches = new Map<string, number>();
		
		for (const ngram of ngrams) {
			const entry = this.ngramIndex.get(ngram);
			if (entry) {
				for (const iconName of entry.iconNames) {
					const currentScore = matches.get(iconName) || 0;
					// Score based on n-gram frequency and rarity
					const score = 1.0 / Math.log(entry.frequency + 1);
					matches.set(iconName, currentScore + score);
				}
			}
		}
		
		return matches;
	}

	/**
	 * Get phonetic matches for typo tolerance
	 */
	async getPhoneticMatches(query: string): Promise<Map<string, number>> {
		const phoneticCode = this.generateSoundex(query);
		const matches = new Map<string, number>();
		
		// Look for phonetic matches in n-gram index
		for (const [ngram, entry] of this.ngramIndex.entries()) {
			if (this.generateSoundex(ngram) === phoneticCode) {
				for (const iconName of entry.iconNames) {
					matches.set(iconName, 0.8); // Lower score for phonetic matches
				}
			}
		}
		
		return matches;
	}

	/**
	 * Check if index rebuild is needed
	 */
	private async needsIndexRebuild(icons: IconMetadata[]): Promise<boolean> {
		if (!this.currentVersion) {
			return true;
		}

		// Check version compatibility
		if (this.currentVersion.version !== IncrementalIndexService.CURRENT_INDEX_VERSION) {
			this.logger.info('Index version mismatch, rebuild needed', {
				current: this.currentVersion.version,
				required: IncrementalIndexService.CURRENT_INDEX_VERSION
			});
			return true;
		}

		// Check icon count
		if (this.currentVersion.iconCount !== icons.length) {
			this.logger.info('Icon count changed, rebuild needed', {
				oldCount: this.currentVersion.iconCount,
				newCount: icons.length
			});
			return true;
		}

		// Check content checksum
		const currentChecksum = this.calculateChecksum(icons);
		if (this.currentVersion.checksum !== currentChecksum) {
			this.logger.info('Content checksum changed, rebuild needed');
			return true;
		}

		return false;
	}

	/**
	 * Perform full index rebuild
	 */
	private async performFullRebuild(icons: IconMetadata[]): Promise<void> {
		const startTime = Date.now();
		
		// Clear existing n-gram index
		this.ngramIndex.clear();
		
		// Build n-gram index
		await this.buildNgramIndex(icons);
		
		// Save n-gram index to KV
		await this.saveNgramIndex();
		
		// Update version info
		const newVersion: IndexVersion = {
			version: IncrementalIndexService.CURRENT_INDEX_VERSION,
			timestamp: Date.now(),
			iconCount: icons.length,
			checksum: this.calculateChecksum(icons),
			ngramVersion: this.generateNgramVersion()
		};
		
		await this.saveVersionInfo(newVersion);
		this.currentVersion = newVersion;
		
		const buildTime = Date.now() - startTime;
		this.logger.info('Full index rebuild completed', {
			iconCount: icons.length,
			ngramTerms: this.ngramIndex.size,
			buildTime
		});
	}

	/**
	 * Perform incremental index update
	 */
	private async performIncrementalUpdate(icons: IconMetadata[]): Promise<void> {
		// For now, perform full rebuild on any change
		// TODO: Implement proper delta calculation and incremental updates
		this.logger.warn('Incremental updates not yet implemented, performing full rebuild');
		await this.performFullRebuild(icons);
	}

	/**
	 * Build n-gram index from icons
	 */
	private async buildNgramIndex(icons: IconMetadata[]): Promise<void> {
		const ngramFrequency = new Map<string, number>();
		const ngramToIcons = new Map<string, Set<string>>();
		
		// Extract n-grams from all searchable text
		for (const icon of icons) {
			const searchableTerms = this.extractSearchableTerms(icon);
			const iconNgrams = new Set<string>();
			
			for (const term of searchableTerms) {
				const termNgrams = this.generateNgrams(term);
				for (const ngram of termNgrams) {
					iconNgrams.add(ngram);
				}
			}
			
			// Update n-gram mappings
			for (const ngram of iconNgrams) {
				// Update frequency
				ngramFrequency.set(ngram, (ngramFrequency.get(ngram) || 0) + 1);
				
				// Update icon mappings
				if (!ngramToIcons.has(ngram)) {
					ngramToIcons.set(ngram, new Set());
				}
				ngramToIcons.get(ngram)!.add(icon.name);
			}
		}
		
		// Build final n-gram index
		for (const [ngram, frequency] of ngramFrequency.entries()) {
			const iconNames = Array.from(ngramToIcons.get(ngram) || []);
			this.ngramIndex.set(ngram, {
				ngram,
				iconNames,
				frequency
			});
		}
	}

	/**
	 * Save n-gram index to KV storage
	 */
	private async saveNgramIndex(): Promise<void> {
		// Split large index into chunks for KV storage
		const chunks = this.chunkNgramIndex(1000); // 1000 entries per chunk
		
		const savePromises = chunks.map((chunk, index) => {
			const key = `${IncrementalIndexService.NGRAM_INDEX_PREFIX}${index}`;
			return this.kvStorage.setSearchIndex(new Map([[key, JSON.stringify(chunk)]]));
		});
		
		await Promise.all(savePromises);
		
		// Save chunk metadata
		const metadata = {
			chunkCount: chunks.length,
			totalEntries: this.ngramIndex.size,
			version: IncrementalIndexService.CURRENT_INDEX_VERSION
		};
		
		await this.kvStorage.setSearchIndex(new Map([['ngram_metadata', JSON.stringify(metadata)]]));
	}

	/**
	 * Load n-gram index from KV storage
	 */
	private async loadNgramIndex(): Promise<void> {
		try {
			// Load metadata
			const metadataResult = await this.kvStorage.getSearchIndex();
			if (!metadataResult.success || !metadataResult.data) {
				this.logger.warn('N-gram index metadata not found');
				return;
			}
			
			const metadataEntry = metadataResult.data.get('ngram_metadata');
			if (!metadataEntry) {
				this.logger.warn('N-gram metadata entry not found');
				return;
			}
			
			const metadata = JSON.parse(metadataEntry);
			
			// Load chunks
			const loadPromises = Array.from({ length: metadata.chunkCount }, async (_, index) => {
				const key = `${IncrementalIndexService.NGRAM_INDEX_PREFIX}${index}`;
				const result = await this.kvStorage.getSearchIndex();
				if (result.success && result.data) {
					const chunkData = result.data.get(key);
					if (chunkData) {
						return JSON.parse(chunkData) as NgramEntry[];
					}
				}
				return [];
			});
			
			const chunks = await Promise.all(loadPromises);
			
			// Rebuild in-memory index
			this.ngramIndex.clear();
			for (const chunk of chunks) {
				for (const entry of chunk) {
					this.ngramIndex.set(entry.ngram, entry);
				}
			}
			
			this.logger.info('N-gram index loaded from KV', {
				entries: this.ngramIndex.size,
				chunks: metadata.chunkCount
			});
			
		} catch (error) {
			this.logger.error('Error loading n-gram index', { error });
		}
	}

	/**
	 * Load version information from KV storage
	 */
	private async loadVersionInfo(): Promise<void> {
		try {
			const result = await this.kvStorage.getSearchIndex();
			if (result.success && result.data) {
				const versionData = result.data.get(IncrementalIndexService.INDEX_VERSION_KEY);
				if (versionData) {
					this.currentVersion = JSON.parse(versionData);
					this.logger.debug('Loaded index version info', this.currentVersion);
				}
			}
		} catch (error) {
			this.logger.warn('Could not load version info', { error });
			this.currentVersion = null;
		}
	}

	/**
	 * Save version information to KV storage
	 */
	private async saveVersionInfo(version: IndexVersion): Promise<void> {
		const versionMap = new Map([[IncrementalIndexService.INDEX_VERSION_KEY, JSON.stringify(version)]]);
		await this.kvStorage.setSearchIndex(versionMap);
	}

	/**
	 * Generate n-grams from text
	 */
	private generateNgrams(text: string): string[] {
		if (text.length < IncrementalIndexService.NGRAM_SIZE) {
			return [text];
		}
		
		const ngrams: string[] = [];
		for (let i = 0; i <= text.length - IncrementalIndexService.NGRAM_SIZE; i++) {
			ngrams.push(text.substring(i, i + IncrementalIndexService.NGRAM_SIZE));
		}
		
		return ngrams;
	}

	/**
	 * Generate Soundex code for phonetic matching
	 */
	private generateSoundex(text: string): string {
		if (!text) return '';
		
		// Simplified Soundex implementation
		const cleaned = text.toUpperCase().replace(/[^A-Z]/g, '');
		if (!cleaned) return '';
		
		let soundex = cleaned[0];
		
		const codes: Record<string, string> = {
			'BFPV': '1',
			'CGJKQSXZ': '2',
			'DT': '3',
			'L': '4',
			'MN': '5',
			'R': '6'
		};
		
		for (let i = 1; i < cleaned.length && soundex.length < 4; i++) {
			const char = cleaned[i];
			for (const [letters, code] of Object.entries(codes)) {
				if (letters.includes(char)) {
					if (soundex[soundex.length - 1] !== code) {
						soundex += code;
					}
					break;
				}
			}
		}
		
		return soundex.padEnd(4, '0').substring(0, 4);
	}

	/**
	 * Extract searchable terms from icon
	 */
	private extractSearchableTerms(icon: IconMetadata): string[] {
		const terms: string[] = [];
		
		// Add name, category, usage, and tags
		terms.push(TextProcessor.normalizeInput(icon.name));
		terms.push(TextProcessor.normalizeInput(icon.category));
		terms.push(TextProcessor.normalizeInput(icon.usage));
		
		for (const tag of icon.tags) {
			terms.push(TextProcessor.normalizeInput(tag));
		}
		
		return terms;
	}

	/**
	 * Calculate checksum for icons
	 */
	private calculateChecksum(icons: IconMetadata[]): string {
		const content = icons.map(icon => `${icon.name}:${icon.category}:${icon.tags.join(',')}`).join('|');
		return this.simpleHash(content);
	}

	/**
	 * Simple hash function
	 */
	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return hash.toString(16);
	}

	/**
	 * Generate n-gram version identifier
	 */
	private generateNgramVersion(): string {
		return `ngram_v${IncrementalIndexService.NGRAM_SIZE}_${Date.now()}`;
	}

	/**
	 * Chunk n-gram index for storage
	 */
	private chunkNgramIndex(chunkSize: number): NgramEntry[][] {
		const entries = Array.from(this.ngramIndex.values());
		const chunks: NgramEntry[][] = [];
		
		for (let i = 0; i < entries.length; i += chunkSize) {
			chunks.push(entries.slice(i, i + chunkSize));
		}
		
		return chunks;
	}
}
import { ILogger } from '../logging/logger';
import { Result } from '../result/result';
import { IconMetadata } from '../../domain/icon/types/icon.types';

/**
 * KV Storage interface for icon catalog operations
 */
export interface IKVStorage {
	getIconCatalog(): Promise<Result<IconMetadata[]>>;
	setIconCatalog(icons: IconMetadata[]): Promise<Result<void>>;
	getIconsByCategory(category: string): Promise<Result<IconMetadata[]>>;
	setIconsByCategory(category: string, icons: IconMetadata[]): Promise<Result<void>>;
	getSearchIndex(): Promise<Result<Map<string, string[]>>>;
	setSearchIndex(index: Map<string, string[]>): Promise<Result<void>>;
}

/**
 * Cloudflare KV implementation for icon storage
 */
export class CloudflareKVStorage implements IKVStorage {
	private static readonly ICON_CATALOG_KEY = 'icon_catalog';
	private static readonly CATEGORY_PREFIX = 'category_';
	private static readonly SEARCH_INDEX_KEY = 'search_index';
	
	constructor(
		private readonly kv: KVNamespace,
		private readonly logger: ILogger
	) {}

	/**
	 * Get the complete icon catalog from KV storage
	 */
	async getIconCatalog(): Promise<Result<IconMetadata[]>> {
		try {
			this.logger.debug('Fetching icon catalog from KV storage');
			const data = await this.kv.get(CloudflareKVStorage.ICON_CATALOG_KEY, 'json');
			
			if (!data) {
				this.logger.warn('Icon catalog not found in KV storage');
				return Result.failure(new Error('Icon catalog not found'));
			}

			this.logger.debug('Icon catalog fetched successfully', { count: data.length });
			return Result.success(data as IconMetadata[]);
		} catch (error) {
			this.logger.error('Error fetching icon catalog from KV', { error });
			return Result.failure(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Store the complete icon catalog in KV storage
	 */
	async setIconCatalog(icons: IconMetadata[]): Promise<Result<void>> {
		try {
			this.logger.debug('Storing icon catalog in KV storage', { count: icons.length });
			
			// Store main catalog
			await this.kv.put(CloudflareKVStorage.ICON_CATALOG_KEY, JSON.stringify(icons));
			
			// Group icons by category for faster category-based queries
			const categorizedIcons = new Map<string, IconMetadata[]>();
			icons.forEach(icon => {
				const category = icon.category;
				if (!categorizedIcons.has(category)) {
					categorizedIcons.set(category, []);
				}
				categorizedIcons.get(category)!.push(icon);
			});

			// Store each category separately
			const categoryPromises = Array.from(categorizedIcons.entries()).map(([category, categoryIcons]) =>
				this.kv.put(`${CloudflareKVStorage.CATEGORY_PREFIX}${category}`, JSON.stringify(categoryIcons))
			);

			await Promise.all(categoryPromises);
			
			this.logger.info('Icon catalog stored successfully', { 
				totalIcons: icons.length, 
				categories: categorizedIcons.size 
			});
			
			return Result.success(undefined);
		} catch (error) {
			this.logger.error('Error storing icon catalog in KV', { error });
			return Result.failure(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Get icons for a specific category
	 */
	async getIconsByCategory(category: string): Promise<Result<IconMetadata[]>> {
		try {
			this.logger.debug('Fetching icons by category from KV', { category });
			const key = `${CloudflareKVStorage.CATEGORY_PREFIX}${category}`;
			const data = await this.kv.get(key, 'json');
			
			if (!data) {
				this.logger.warn('Category not found in KV storage', { category });
				return Result.failure(new Error(`Category ${category} not found`));
			}

			this.logger.debug('Category icons fetched successfully', { category, count: data.length });
			return Result.success(data as IconMetadata[]);
		} catch (error) {
			this.logger.error('Error fetching category icons from KV', { error, category });
			return Result.failure(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Store icons for a specific category
	 */
	async setIconsByCategory(category: string, icons: IconMetadata[]): Promise<Result<void>> {
		try {
			this.logger.debug('Storing category icons in KV', { category, count: icons.length });
			const key = `${CloudflareKVStorage.CATEGORY_PREFIX}${category}`;
			await this.kv.put(key, JSON.stringify(icons));
			
			this.logger.debug('Category icons stored successfully', { category });
			return Result.success(undefined);
		} catch (error) {
			this.logger.error('Error storing category icons in KV', { error, category });
			return Result.failure(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Get the pre-built search index from KV storage
	 */
	async getSearchIndex(): Promise<Result<Map<string, string[]>>> {
		try {
			this.logger.debug('Fetching search index from KV storage');
			const data = await this.kv.get(CloudflareKVStorage.SEARCH_INDEX_KEY, 'json');
			
			if (!data) {
				this.logger.warn('Search index not found in KV storage');
				return Result.failure(new Error('Search index not found'));
			}

			// Convert back to Map
			const indexMap = new Map<string, string[]>(Object.entries(data));
			this.logger.debug('Search index fetched successfully', { terms: indexMap.size });
			return Result.success(indexMap);
		} catch (error) {
			this.logger.error('Error fetching search index from KV', { error });
			return Result.failure(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Store the pre-built search index in KV storage
	 */
	async setSearchIndex(index: Map<string, string[]>): Promise<Result<void>> {
		try {
			this.logger.debug('Storing search index in KV storage', { terms: index.size });
			
			// Convert Map to object for JSON serialization
			const indexObject = Object.fromEntries(index.entries());
			await this.kv.put(CloudflareKVStorage.SEARCH_INDEX_KEY, JSON.stringify(indexObject));
			
			this.logger.info('Search index stored successfully', { terms: index.size });
			return Result.success(undefined);
		} catch (error) {
			this.logger.error('Error storing search index in KV', { error });
			return Result.failure(error instanceof Error ? error : new Error(String(error)));
		}
	}
}
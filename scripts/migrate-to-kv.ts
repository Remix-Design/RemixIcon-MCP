/**
 * Migration script to move icon catalog from JSON file to Cloudflare KV storage
 * This script should be run during deployment to populate KV storage
 */

import { CloudflareKVStorage } from '../src/infrastructure/storage/kv-storage.service';
import { ConsoleLogger, LogLevel } from '../src/infrastructure/logging/logger';
import iconCatalog from '../src/data/icon-catalog.json';
import { InvertedIndexService } from '../src/domain/search/services/inverted-index.service';
import { DEFAULT_SEARCH_CONFIG } from '../src/domain/search/config';

/**
 * Migrate icon catalog and search index to KV storage
 */
export async function migrateToKV(kvNamespace: KVNamespace): Promise<void> {
	const logger = new ConsoleLogger(LogLevel.INFO);
	const kvStorage = new CloudflareKVStorage(kvNamespace, logger);
	
	try {
		logger.info('Starting migration to KV storage', { iconCount: iconCatalog.icons.length });
		
		// 1. Store icon catalog
		const catalogResult = await kvStorage.setIconCatalog(iconCatalog.icons);
		if (!catalogResult.success) {
			throw new Error(`Failed to store icon catalog: ${catalogResult.error?.message}`);
		}
		
		// 2. Build and store search index
		const indexService = new InvertedIndexService(DEFAULT_SEARCH_CONFIG, logger);
		indexService.buildIndex(iconCatalog.icons);
		
		// Get the built index (we need to expose this method)
		const searchIndex = indexService.getIndex();
		const indexResult = await kvStorage.setSearchIndex(searchIndex);
		if (!indexResult.success) {
			throw new Error(`Failed to store search index: ${indexResult.error?.message}`);
		}
		
		logger.info('Migration completed successfully', {
			iconCount: iconCatalog.icons.length,
			indexTerms: searchIndex.size
		});
		
	} catch (error) {
		logger.error('Migration failed', { error });
		throw error;
	}
}

/**
 * Verify KV storage contains expected data
 */
export async function verifyKVData(kvNamespace: KVNamespace): Promise<boolean> {
	const logger = new ConsoleLogger(LogLevel.INFO);
	const kvStorage = new CloudflareKVStorage(kvNamespace, logger);
	
	try {
		// Check catalog
		const catalogResult = await kvStorage.getIconCatalog();
		if (!catalogResult.success || !catalogResult.data) {
			logger.error('Icon catalog verification failed');
			return false;
		}
		
		// Check index
		const indexResult = await kvStorage.getSearchIndex();
		if (!indexResult.success || !indexResult.data) {
			logger.error('Search index verification failed');
			return false;
		}
		
		logger.info('KV data verification successful', {
			catalogSize: catalogResult.data.length,
			indexSize: indexResult.data.size
		});
		
		return true;
	} catch (error) {
		logger.error('KV verification failed', { error });
		return false;
	}
}
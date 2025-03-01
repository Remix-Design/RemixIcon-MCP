import { ILogger } from '../../../infrastructure/logging/logger';
import { TextProcessor } from '../../../utils/text/text-processor';
import { SearchConfig, SearchParams } from '../types/search.types';

/**
 * Query processor interface
 * Defines the contract for query processing implementations
 */
export interface IQueryProcessor {
	/**
	 * Processes a search query
	 * @param params - Search parameters to process
	 * @returns Processed search parameters
	 */
	process(params: SearchParams): SearchParams;

	/**
	 * Processes a query string
	 * @param query - Query string to process
	 * @returns Processed query string
	 */
	processQuery(query: string): string;
}

/**
 * Query processing service
 * Handles preprocessing and enhancement of search queries
 */
export class QueryService implements IQueryProcessor {
	/**
	 * Creates a new query processor
	 * @param config - Search configuration
	 * @param logger - Logger instance
	 */
	constructor(private readonly config: SearchConfig, private readonly logger: ILogger) {}

	/**
	 * Processes search parameters
	 * @param params - Search parameters to process
	 * @returns Processed search parameters
	 */
	process(params: SearchParams): SearchParams {
		try {
			if (!this.validateParams(params)) {
				return params;
			}

			const normalizedDescription = TextProcessor.normalizeInput(params.description);
			const normalizedUsage = TextProcessor.normalizeInput(params.usage);
			const normalizedCategory = TextProcessor.normalizeInput(params.category);
			const normalizedName = TextProcessor.normalizeInput(params.name);
			const normalizedTags = params.tags.map((tag) => TextProcessor.normalizeInput(tag));

			return {
				description: normalizedDescription,
				usage: normalizedUsage,
				category: normalizedCategory,
				name: normalizedName,
				tags: normalizedTags,
			};
		} catch (error) {
			this.logger.error('Error processing query', { error, params });
			return params;
		}
	}

	/**
	 * Processes a query string
	 * @param query - Query string to process
	 * @returns Processed query string
	 */
	processQuery(query: string): string {
		try {
			return TextProcessor.normalizeInput(query);
		} catch (error) {
			this.logger.error('Error processing query string', { error, query });
			return query;
		}
	}

	/**
	 * Validates search parameters
	 * @param params - Search parameters to validate
	 * @returns True if parameters are valid, false otherwise
	 * @private
	 */
	private validateParams(params: SearchParams): boolean {
		return !!(
			params &&
			typeof params.description === 'string' &&
			typeof params.usage === 'string' &&
			typeof params.category === 'string' &&
			typeof params.name === 'string' &&
			Array.isArray(params.tags)
		);
	}
}

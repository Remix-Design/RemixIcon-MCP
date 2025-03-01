/**
 * Icon type definitions
 * Defines types related to icons and icon metadata
 */

/**
 * Icon metadata
 * Contains information about an icon
 */
export interface IconMetadata {
	/**
	 * Icon name
	 */
	name: string;

	/**
	 * Icon category
	 */
	category: string;

	/**
	 * Icon usage description
	 */
	usage: string;

	/**
	 * Icon tags for search and categorization
	 */
	tags: string[];
}

/**
 * Icon catalog
 * Contains all available icons
 */
export interface IconCatalog {
	/**
	 * Array of icon metadata
	 */
	icons: IconMetadata[];
}

/**
 * Response content for icon search results
 */
export interface ResponseContent {
	/**
	 * Content type
	 */
	type: 'text';

	/**
	 * Text content
	 */
	text: string;
}

/**
 * Response types for the API
 */

/**
 * Available response type identifiers
 */
export type ResponseType = 'text' | 'error' | 'icon' | 'category';

/**
 * Base response structure
 */
export type BaseResponse = {
	type: ResponseType;
};

/**
 * Error response with optional status code
 */
export type ErrorResponse = BaseResponse & {
	type: 'error';
	error: string;
	code?: number;
};

/**
 * Icon search response with optional category
 */
export type IconResponse = BaseResponse & {
	type: 'icon';
	icons: string[];
	category?: string;
};

/**
 * Category listing response
 */
export type CategoryResponse = BaseResponse & {
	type: 'category';
	categories: string[];
};

/**
 * Text response content
 */
export interface TextResponse extends BaseResponse {
	type: 'text';
	text: string;
}

/**
 * Union type of all response content types
 */
export type ResponseContent = TextResponse | ErrorResponse | IconResponse | CategoryResponse;

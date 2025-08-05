/**
 * Cloudflare Workers environment bindings
 */
interface Env {
	/**
	 * KV namespace for storing icon catalog and search indexes
	 */
	ICON_CATALOG: KVNamespace;
}
/** Force the shared model catalog cache to reload after a Host-side catalog commit. */
/**
 * `ui-model-selection` keeps its shared catalog instance in a private field and
 * `ModelDirectory.load()` returns that cache as-is, so a Host catalog commit can
 * land after the cache's last fetch and stay invisible. Reach the instance
 * defensively and reload it; if a future version moves it, callers just keep the
 * previous cached behavior.
 */
export declare function forceCatalogReload(resolver: unknown): void;

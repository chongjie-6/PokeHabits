/**
 * Alone in a file with no imports, so `sync-store.ts` can name its argument
 * without pulling an auth stack into its graph — which is what lets its test
 * run the real store against PGlite with no auth configured.
 */
export type SyncUser = {
  /** Stable, opaque account id. Half of every primary key. */
  id: string;
  email: string;
};

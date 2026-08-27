/**
 * ARAY Schema — No-op for JSON storage mode
 *
 * Previously held SQLite migration SQL. Now unused since we use
 * JSON file storage. Kept for backward compat with any imports.
 */

export function runMigrations(_db: any): void {
  // No-op — JSON storage doesn't need migrations
  console.log('[ARAY] Schema migrations skipped (JSON storage mode)')
}

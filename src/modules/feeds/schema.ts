export const SQLITE_SCHEMA = {
  feeds: `
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      site_url TEXT,
      category_id TEXT NOT NULL,
      icon TEXT,
      icon_source TEXT NOT NULL DEFAULT 'auto',
      etag TEXT,
      last_modified TEXT,
      sync_error TEXT,
      next_poll_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  categories: `
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
} as const

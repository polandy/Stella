import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/*
 * Query-only definitions for the FTS5 virtual tables (docs/03 §3.5). These are NOT part of
 * the Drizzle-managed schema (drizzle.config points at schema.ts) — the virtual tables and
 * their sync triggers are created at startup by `ensureSearchIndex`. These defs exist only
 * so the search adapter can build joins/selects against them with the query builder.
 */

export const contactFts = sqliteTable('contact_fts', {
	contactId: text('contact_id'),
	content: text('content')
});

export const noteFts = sqliteTable('note_fts', {
	noteId: text('note_id'),
	contactId: text('contact_id'),
	content: text('content')
});

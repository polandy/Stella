import { sql } from 'drizzle-orm';

/*
 * What every table file shares — implementation of docs/03-data-model.md, split by bounded
 * context (docs/03 §3.0) and re-exported whole from ./index.ts.
 * IDs: ULID (sortable). Timestamps: integer Unix epoch (ms, UTC).
 * Enums: text columns typed via $type<>() (SQLite has no native enum).
 */

export const now = sql`(cast(strftime('%s','now') as integer) * 1000)`;

export type Visibility = 'shared' | 'private';

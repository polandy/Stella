import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/sqlite-core';

/*
 * What every table file shares — implementation of docs/03-data-model.md, split by bounded
 * context (docs/03 §3.0) and re-exported whole from ./index.ts.
 * IDs: ULID (sortable). Timestamps: integer Unix epoch (ms, UTC).
 * Enums: text columns typed via $type<>() (SQLite has no native enum).
 */

export const now = sql`(cast(strftime('%s','now') as integer) * 1000)`;

export type Visibility = 'shared' | 'private';

/**
 * The `MM-DD` of an ISO day or timestamp column, kept by SQLite itself as a virtual column, so
 * *On this day* (docs/02 §2.12.1) finds a day and month in every year through a plain index.
 */
export function monthDayOf(name: string, source: string) {
	return text(name).generatedAlwaysAs(sql.raw(`substr(${source}, 6, 5)`), { mode: 'virtual' });
}

import { sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * What a photo is ordered by, in SQL: when it was taken when its EXIF said so, else when it was
 * added (epoch ms) — the same rule as `datedAt` in `src/lib/media/taken-at.ts`. `strftime` reads
 * the stored `YYYY-MM-DDTHH:MM:SS` with its `±HH:MM`/`Z` offset, and one without an offset as
 * UTC, exactly as `takenAtMs` does. `photo-dated-at.test.ts` holds the two to the same answers.
 */
export function photoDatedAt(columns: {
	takenAt: SQLiteColumn;
	createdAt: SQLiteColumn;
}): SQL<number> {
	return sql<number>`coalesce(CAST(strftime('%s', ${columns.takenAt}) AS INTEGER) * 1000, ${columns.createdAt})`;
}

import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { PrivateEntryReads } from '../domain/household/private-entries';
import type * as schema from './schema';
import { interaction, journalEntry, note } from './schema';

/*
 * Drizzle adapter for the PrivateEntryReads port: the author's own rows only, so nothing of
 * anyone else's is touched and no viewer scoping is needed. Three `LIMIT 1` probes, each on
 * the author's rows.
 */
export function createDrizzlePrivateEntryReads(
	db: BunSQLiteDatabase<typeof schema>
): PrivateEntryReads {
	return {
		async hasPrivateEntry(memberId) {
			const tables = [note, journalEntry, interaction] as const;
			return tables.some(
				(table) =>
					db
						.select({ id: table.id })
						.from(table)
						.where(and(eq(table.createdBy, memberId), eq(table.visibility, 'private')))
						.limit(1)
						.get() !== undefined
			);
		}
	};
}

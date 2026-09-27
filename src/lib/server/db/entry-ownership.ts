import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { EntryOwnership } from '../domain/commands/moment-photo';
import type * as schema from './schema';
import { journalEntry } from './schema';

/*
 * Drizzle adapter for the EntryOwnership port: whether a journal entry is still there and was
 * written by the member asking. Ownership rather than visibility, because only its author may
 * add photos to an entry (docs/02 §2.20).
 */
export function createDrizzleEntryOwnership(db: BunSQLiteDatabase<typeof schema>): EntryOwnership {
	return {
		async ownsEntry(authorId, entryId) {
			const row = db
				.select({ id: journalEntry.id })
				.from(journalEntry)
				.where(and(eq(journalEntry.id, entryId), eq(journalEntry.createdBy, authorId)))
				.get();
			return row !== undefined;
		}
	};
}

import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { OwnEntries } from '../domain/media/entry-photos';
import type * as schema from './schema';
import { journalEntry, photo } from './schema';

/*
 * Drizzle adapter for the OwnEntries port: an entry's photos as its author edits them
 * (docs/02 §2.20). Ownership rather than visibility, because only its author edits an entry.
 */
export function createDrizzleOwnEntries(db: BunSQLiteDatabase<typeof schema>): OwnEntries {
	const ownedBy = (authorId: string, entryId: string) =>
		and(eq(journalEntry.id, entryId), eq(journalEntry.createdBy, authorId));

	return {
		async findOwnEntry(authorId, entryId) {
			return (
				db
					.select({ contactId: journalEntry.contactId, visibility: journalEntry.visibility })
					.from(journalEntry)
					.where(ownedBy(authorId, entryId))
					.get() ?? null
			);
		},

		async deleteOwnEntryPhoto(authorId, entryId, photoId) {
			return db.transaction((tx) => {
				const entry = tx
					.select({ id: journalEntry.id })
					.from(journalEntry)
					.where(ownedBy(authorId, entryId))
					.get();
				if (!entry) return null;
				return (
					tx
						.delete(photo)
						.where(and(eq(photo.id, photoId), eq(photo.journalEntryId, entryId)))
						.returning({ filePath: photo.filePath, thumbPath: photo.thumbPath })
						.get() ?? null
				);
			});
		}
	};
}

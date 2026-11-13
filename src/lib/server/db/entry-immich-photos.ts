import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	EntryImmichPhotoReads,
	EntryImmichPhotoRef,
	OwnEntryImmichPhotos
} from '../domain/immich/entry-immich-photos';
import type * as schema from './schema';
import { journalAbout } from './journal-subjects';
import { contact, journalEntry, journalImmichPhoto } from './schema';

/*
 * Drizzle adapters for an entry's Immich references (docs/02 §2.20, docs/04 ADR-132): the
 * author edits their own; a reader sees those of the entries visible to them, scoped through the
 * central `childRecordVisibleTo` on the entry (docs/03 §3.7).
 */
type Db = BunSQLiteDatabase<typeof schema>;

export function createDrizzleOwnEntryImmichPhotos(db: Db): OwnEntryImmichPhotos {
	const isOwn = (tx: Db, authorId: string, entryId: string) =>
		tx
			.select({ id: journalEntry.id })
			.from(journalEntry)
			.where(and(eq(journalEntry.id, entryId), eq(journalEntry.createdBy, authorId)))
			.get() !== undefined;

	return {
		async linkOwn(authorId, entryId, assetIds) {
			return db.transaction((tx) => {
				if (!isOwn(tx, authorId, entryId)) return false;
				if (assetIds.length > 0) {
					tx.insert(journalImmichPhoto)
						.values(assetIds.map((assetId) => ({ journalEntryId: entryId, assetId })))
						.onConflictDoNothing()
						.run();
				}
				return true;
			});
		},

		async unlinkOwn(authorId, entryId, assetId) {
			return db.transaction((tx) => {
				if (!isOwn(tx, authorId, entryId)) return false;
				const gone = tx
					.delete(journalImmichPhoto)
					.where(
						and(
							eq(journalImmichPhoto.journalEntryId, entryId),
							eq(journalImmichPhoto.assetId, assetId)
						)
					)
					.returning({ assetId: journalImmichPhoto.assetId })
					.get();
				return gone !== undefined;
			});
		}
	};
}

export function createDrizzleEntryImmichPhotoReads(db: Db): EntryImmichPhotoReads {
	return {
		async listOfEntries(
			viewer: Viewer,
			contactId: string,
			entryIds: readonly string[]
		): Promise<EntryImmichPhotoRef[]> {
			if (entryIds.length === 0) return [];
			return db
				.select({
					journalEntryId: journalImmichPhoto.journalEntryId,
					assetId: journalImmichPhoto.assetId
				})
				.from(journalImmichPhoto)
				.innerJoin(journalEntry, eq(journalImmichPhoto.journalEntryId, journalEntry.id))
				.innerJoin(contact, eq(journalEntry.contactId, contact.id))
				.where(
					and(
						journalAbout(contactId),
						inArray(journalImmichPhoto.journalEntryId, [...entryIds]),
						childRecordVisibleTo(viewer, {
							visibility: journalEntry.visibility,
							createdBy: journalEntry.createdBy
						})
					)
				)
				.orderBy(asc(journalImmichPhoto.addedAt), asc(sql`${journalImmichPhoto}.rowid`))
				.all();
		}
	};
}

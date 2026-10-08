import { and, asc, eq, inArray, isNotNull, type SQL } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { JournalPhotoReads, JournalPhotoRef } from '../domain/media/journal-photos';
import type * as schema from './schema';
import { contact, photo } from './schema';

/*
 * Drizzle adapter for the journal photos a story reads (docs/08 §8.3), scoped through the
 * central `childRecordVisibleTo`: the person must be visible and a private photo only to its
 * author (docs/03 §3.7).
 */
export function createDrizzleJournalPhotoReads(
	db: BunSQLiteDatabase<typeof schema>
): JournalPhotoReads {
	/** A person's journal photos the viewer may see, oldest first, among the entries `entries` picks. */
	function journalPhotosWhere(viewer: Viewer, contactId: string, entries: SQL): JournalPhotoRef[] {
		const rows = db
			.select({ id: photo.id, journalEntryId: photo.journalEntryId })
			.from(photo)
			.innerJoin(contact, eq(photo.contactId, contact.id))
			.where(
				and(
					eq(photo.contactId, contactId),
					entries,
					childRecordVisibleTo(viewer, { visibility: photo.visibility, createdBy: photo.createdBy })
				)
			)
			.orderBy(asc(photo.createdAt))
			.all();
		// journalEntryId is non-null here: both filters only pick photos of an entry.
		return rows.map((r) => ({ id: r.id, journalEntryId: r.journalEntryId as string }));
	}

	return {
		async listJournalPhotos(viewer: Viewer, contactId: string): Promise<JournalPhotoRef[]> {
			return journalPhotosWhere(viewer, contactId, isNotNull(photo.journalEntryId));
		},

		async listJournalPhotosOfEntries(
			viewer: Viewer,
			contactId: string,
			entryIds: readonly string[]
		): Promise<JournalPhotoRef[]> {
			if (entryIds.length === 0) return [];
			return journalPhotosWhere(viewer, contactId, inArray(photo.journalEntryId, [...entryIds]));
		}
	};
}

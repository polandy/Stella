import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { takenAtMs } from '../../media/taken-at';
import { childRecordVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { MemoryPhoto, MemoryQuery, MemoryRepository } from '../domain/memories/memories';
import { isGalleryPhoto } from './gallery-photo-scope';
import type * as schema from './schema';
import { contact, interaction, journalEntry, photo, user } from './schema';
import { momentColumns, momentRowsOf, touchpointColumns, touchpointRowsOf } from './story-rows';

/*
 * Drizzle adapter for the MemoryRepository port (docs/02 §2.12.1). Each kind is one read on its
 * `MM-DD` column, answered from that column's index (docs/03 §3.4), and scoped like the stream:
 * `childRecordVisibleTo` on the person the row hangs off. The day's rows are walked first — a
 * `CROSS JOIN` keeps SQLite from starting at the household's people instead, which would read
 * every entry they have. A person the household archived is out
 * of it, as out of every Home band (docs/04 §4.9); one who died stays, and so do their days.
 */

/** Scoped to the viewer, and to a person the household still browses. */
function rememberedBy(viewer: Viewer, record: Parameters<typeof childRecordVisibleTo>[1]) {
	return and(childRecordVisibleTo(viewer, record), isNull(contact.archivedAt));
}

export function createDrizzleMemoryRepository(
	db: BunSQLiteDatabase<typeof schema>
): MemoryRepository {
	return {
		async momentsOn(viewer: Viewer, { days, before, limit }: MemoryQuery) {
			const rows = db
				.select(momentColumns)
				.from(journalEntry)
				.crossJoin(contact)
				.crossJoin(user)
				.where(
					and(
						eq(journalEntry.contactId, contact.id),
						eq(journalEntry.createdBy, user.id),
						inArray(journalEntry.entryMonthDay, [...days]),
						lt(journalEntry.entryDate, before),
						rememberedBy(viewer, {
							visibility: journalEntry.visibility,
							createdBy: journalEntry.createdBy
						})
					)
				)
				.orderBy(desc(journalEntry.entryDate), desc(journalEntry.updatedAt))
				.limit(limit)
				.all();
			return momentRowsOf(db, viewer, rows);
		},

		async touchpointsOn(viewer: Viewer, { days, before, limit }: MemoryQuery) {
			const rows = db
				.select(touchpointColumns)
				.from(interaction)
				.crossJoin(contact)
				.crossJoin(user)
				.where(
					and(
						eq(interaction.contactId, contact.id),
						eq(interaction.createdBy, user.id),
						inArray(interaction.happenedMonthDay, [...days]),
						lt(interaction.happenedAt, before),
						rememberedBy(viewer, {
							visibility: interaction.visibility,
							createdBy: interaction.createdBy
						})
					)
				)
				.orderBy(desc(interaction.happenedAt), desc(interaction.createdAt))
				.limit(limit)
				.all();
			return touchpointRowsOf(db, viewer, rows);
		},

		async photosOn(viewer: Viewer, { days, before, limit }: MemoryQuery): Promise<MemoryPhoto[]> {
			const rows = db
				.select({
					id: photo.id,
					takenAt: photo.takenAt,
					visibility: photo.visibility,
					personId: contact.id,
					personName: contact.displayName,
					personAvatar: contact.avatarPhotoId
				})
				.from(photo)
				.crossJoin(contact)
				.where(
					and(
						eq(photo.contactId, contact.id),
						inArray(photo.takenMonthDay, [...days]),
						lt(photo.takenAt, before),
						isGalleryPhoto(),
						// A face cut from a group photo is a profile picture, not a memory of the day.
						isNull(photo.cutFrom),
						rememberedBy(viewer, { visibility: photo.visibility, createdBy: photo.createdBy })
					)
				)
				.orderBy(desc(photo.takenAt))
				.limit(limit)
				.all();
			return rows.flatMap((r) =>
				r.takenAt === null
					? []
					: [
							{
								id: r.id,
								date: r.takenAt.slice(0, 10),
								at: takenAtMs(r.takenAt),
								person: { id: r.personId, name: r.personName, avatarPhotoId: r.personAvatar },
								visibility: r.visibility
							}
						]
			);
		}
	};
}

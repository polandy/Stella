import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo, contactBrowsableBy } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { SearchRepository } from '../domain/search/search';
import { contact, entryTag, gift, journalEntry, journalEntryTag, note, todo } from './schema';
import type * as schema from './schema';
import { contactFts, giftFts, journalFts, noteFts, todoFts } from './search-schema';

/*
 * Drizzle adapter for the SearchRepository port (docs/08 §8.3). Matches via the FTS5 tables,
 * joins the base rows, and applies the central visibility scoping so private records never
 * appear in another member's results. Ranked by bm25 (best first).
 */

export function createDrizzleSearchRepository(
	db: BunSQLiteDatabase<typeof schema>
): SearchRepository {
	/** The moments matching `ftsQuery`, narrowed by `where`, best first. */
	const moments = (viewer: Viewer, ftsQuery: string, where: SQL | undefined, limit: number) =>
		db
			.select({
				entryId: journalEntry.id,
				title: journalEntry.title,
				snippet: sql<string>`snippet(journal_fts, 2, '', '', '…', 12)`,
				visibility: journalEntry.visibility,
				entryDate: journalEntry.entryDate,
				contactId: contact.id,
				contactName: contact.displayName
			})
			.from(journalFts)
			.innerJoin(journalEntry, eq(journalFts.entryId, journalEntry.id))
			.innerJoin(contact, eq(journalEntry.contactId, contact.id))
			.where(
				and(
					sql`journal_fts MATCH ${ftsQuery}`,
					where,
					childRecordVisibleTo(viewer, {
						visibility: journalEntry.visibility,
						createdBy: journalEntry.createdBy
					})
				)
			)
			.orderBy(sql`bm25(journal_fts)`)
			.limit(limit)
			.all();

	return {
		async searchContacts(viewer: Viewer, ftsQuery: string, limit: number) {
			return db
				.select({
					id: contact.id,
					displayName: contact.displayName,
					description: contact.description,
					avatarPhotoId: contact.avatarPhotoId,
					formerName: contact.formerName,
					jobTitle: contact.jobTitle,
					company: contact.company
				})
				.from(contactFts)
				.innerJoin(contact, eq(contactFts.contactId, contact.id))
				.where(and(sql`contact_fts MATCH ${ftsQuery}`, contactBrowsableBy(viewer)))
				.orderBy(sql`bm25(contact_fts)`)
				.limit(limit)
				.all();
		},

		async searchNotes(viewer: Viewer, ftsQuery: string, limit: number) {
			return db
				.select({
					noteId: note.id,
					title: note.title,
					snippet: sql<string>`snippet(note_fts, 2, '', '', '…', 12)`,
					visibility: note.visibility,
					contactId: contact.id,
					contactName: contact.displayName
				})
				.from(noteFts)
				.innerJoin(note, eq(noteFts.noteId, note.id))
				.innerJoin(contact, eq(note.contactId, contact.id))
				.where(
					and(
						sql`note_fts MATCH ${ftsQuery}`,
						childRecordVisibleTo(viewer, { visibility: note.visibility, createdBy: note.createdBy })
					)
				)
				.orderBy(sql`bm25(note_fts)`)
				.limit(limit)
				.all();
		},

		async searchGifts(viewer: Viewer, ftsQuery: string, limit: number) {
			return db
				.select({
					giftId: gift.id,
					title: gift.title,
					state: gift.state,
					givenOn: gift.givenOn,
					contactId: contact.id,
					contactName: contact.displayName
				})
				.from(giftFts)
				.innerJoin(gift, eq(giftFts.giftId, gift.id))
				.innerJoin(contact, eq(gift.contactId, contact.id))
				.where(
					and(
						sql`gift_fts MATCH ${ftsQuery}`,
						childRecordVisibleTo(viewer, { visibility: gift.visibility, createdBy: gift.createdBy })
					)
				)
				.orderBy(sql`bm25(gift_fts)`)
				.limit(limit)
				.all();
		},

		async searchTodos(viewer: Viewer, ftsQuery: string, limit: number) {
			return db
				.select({
					todoId: todo.id,
					title: todo.title,
					doneAt: todo.doneAt,
					doneOn: todo.doneOn,
					contactId: contact.id,
					contactName: contact.displayName
				})
				.from(todoFts)
				.innerJoin(todo, eq(todoFts.todoId, todo.id))
				.innerJoin(contact, eq(todo.contactId, contact.id))
				.where(
					and(
						sql`todo_fts MATCH ${ftsQuery}`,
						childRecordVisibleTo(viewer, { visibility: todo.visibility, createdBy: todo.createdBy })
					)
				)
				.orderBy(sql`${todo.doneAt} IS NOT NULL`, sql`bm25(todo_fts)`)
				.limit(limit)
				.all()
				.map(({ doneAt, ...hit }) => ({ ...hit, done: doneAt !== null }));
		},

		async searchMoments(viewer: Viewer, ftsQuery: string, limit: number) {
			return moments(viewer, ftsQuery, undefined, limit);
		},

		// Matched by the tag itself; the tag's word as a phrase is matched too only so the snippet
		// is cut around it — every entry carrying the tag has that word in its body.
		async searchMomentsByTag(viewer: Viewer, tagKey: string, limit: number) {
			const carriesTag = inArray(
				journalEntry.id,
				db
					.select({ id: journalEntryTag.journalEntryId })
					.from(journalEntryTag)
					.innerJoin(entryTag, eq(entryTag.id, journalEntryTag.entryTagId))
					.where(and(eq(entryTag.householdId, viewer.householdId), eq(entryTag.key, tagKey)))
			);
			return moments(viewer, `"${tagKey.replaceAll('"', '')}"`, carriesTag, limit);
		}
	};
}

import { and, eq, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo, contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { SearchRepository } from '../domain/search/search';
import { contact, note } from './schema';
import type * as schema from './schema';
import { contactFts, noteFts } from './search-schema';

/*
 * Drizzle adapter for the SearchRepository port (docs/08 §8.3). Matches via the FTS5 tables,
 * joins the base rows, and applies the central visibility scoping so private records never
 * appear in another member's results. Ranked by bm25 (best first).
 */

export function createDrizzleSearchRepository(db: BunSQLiteDatabase<typeof schema>): SearchRepository {
	return {
		async searchContacts(viewer: Viewer, ftsQuery: string, limit: number) {
			return db
				.select({
					id: contact.id,
					displayName: contact.displayName,
					description: contact.description
				})
				.from(contactFts)
				.innerJoin(contact, eq(contactFts.contactId, contact.id))
				.where(and(sql`contact_fts MATCH ${ftsQuery}`, contactVisibleTo(viewer)))
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
		}
	};
}

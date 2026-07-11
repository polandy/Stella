import { and, desc, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { NewNote, NoteRepository } from '../domain/notes/notes';
import type * as schema from './schema';
import { contact, note } from './schema';

/*
 * Drizzle adapter for the NoteRepository port (docs/08 §8.3). Reads join the parent contact
 * and are scoped through the central `childRecordVisibleTo` so a private note — or any note
 * on a private contact — is only returned to those allowed to see it.
 */

export function createDrizzleNoteRepository(db: BunSQLiteDatabase<typeof schema>): NoteRepository {
	return {
		async insert(n: NewNote) {
			db.insert(note)
				.values({
					id: n.id,
					contactId: n.contactId,
					createdBy: n.createdBy,
					visibility: n.visibility,
					title: n.title,
					body: n.body,
					isPinned: n.isPinned ? 1 : 0,
					createdAt: n.createdAt,
					updatedAt: n.updatedAt
				})
				.run();
		},

		async listForContactVisibleTo(viewer: Viewer, contactId: string) {
			const rows = db
				.select({
					id: note.id,
					contactId: note.contactId,
					createdBy: note.createdBy,
					visibility: note.visibility,
					title: note.title,
					body: note.body,
					isPinned: note.isPinned,
					createdAt: note.createdAt,
					updatedAt: note.updatedAt
				})
				.from(note)
				.innerJoin(contact, eq(note.contactId, contact.id))
				.where(
					and(
						eq(note.contactId, contactId),
						childRecordVisibleTo(viewer, { visibility: note.visibility, createdBy: note.createdBy })
					)
				)
				.orderBy(desc(note.isPinned), desc(note.createdAt))
				.all();

			return rows.map((row) => ({ ...row, isPinned: row.isPinned === 1 }));
		}
	};
}

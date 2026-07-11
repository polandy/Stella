import { and, desc, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo } from '../access/query-scoping';
import type { Visibility, Viewer } from '../access/visibility';
import type { JournalEntry, JournalRepository, NewJournalEntry } from '../domain/journal/journal';
import type * as schema from './schema';
import { contact, journalEntry } from './schema';

/*
 * Drizzle adapter for the JournalRepository port (docs/08 §8.3). Reads join the parent contact
 * and are scoped through the central `childRecordVisibleTo`, so a private entry — or any entry
 * on a private contact — is only returned to those allowed to see it. The `journal_day_slot`
 * unique index backs the per-day/visibility upsert done in the domain use-case.
 */

const columns = {
	id: journalEntry.id,
	contactId: journalEntry.contactId,
	createdBy: journalEntry.createdBy,
	visibility: journalEntry.visibility,
	entryDate: journalEntry.entryDate,
	title: journalEntry.title,
	body: journalEntry.body,
	createdAt: journalEntry.createdAt,
	updatedAt: journalEntry.updatedAt
};

export function createDrizzleJournalRepository(
	db: BunSQLiteDatabase<typeof schema>
): JournalRepository {
	return {
		async findDay(p: {
			authorId: string;
			contactId: string;
			entryDate: string;
			visibility: Visibility;
		}): Promise<JournalEntry | null> {
			const row = db
				.select(columns)
				.from(journalEntry)
				.where(
					and(
						eq(journalEntry.contactId, p.contactId),
						eq(journalEntry.createdBy, p.authorId),
						eq(journalEntry.entryDate, p.entryDate),
						eq(journalEntry.visibility, p.visibility)
					)
				)
				.get();
			return row ?? null;
		},

		async insert(e: NewJournalEntry) {
			db.insert(journalEntry)
				.values({
					id: e.id,
					contactId: e.contactId,
					createdBy: e.createdBy,
					visibility: e.visibility,
					entryDate: e.entryDate,
					title: e.title,
					body: e.body,
					createdAt: e.createdAt,
					updatedAt: e.updatedAt
				})
				.run();
		},

		async updateBody(p: { id: string; title: string | null; body: string; updatedAt: number }) {
			db.update(journalEntry)
				.set({ title: p.title, body: p.body, updatedAt: p.updatedAt })
				.where(eq(journalEntry.id, p.id))
				.run();
		},

		async listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<JournalEntry[]> {
			return db
				.select(columns)
				.from(journalEntry)
				.innerJoin(contact, eq(journalEntry.contactId, contact.id))
				.where(
					and(
						eq(journalEntry.contactId, contactId),
						childRecordVisibleTo(viewer, {
							visibility: journalEntry.visibility,
							createdBy: journalEntry.createdBy
						})
					)
				)
				.orderBy(desc(journalEntry.entryDate), desc(journalEntry.createdAt))
				.all();
		},

		async deleteOwn(p: { authorId: string; id: string }): Promise<boolean> {
			const removed = db
				.delete(journalEntry)
				.where(and(eq(journalEntry.id, p.id), eq(journalEntry.createdBy, p.authorId)))
				.returning({ id: journalEntry.id })
				.all();
			return removed.length > 0;
		}
	};
}

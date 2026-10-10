import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { authoredRemovableBy, childRecordVisibleTo } from '../access/query-scoping';
import type { DeletedPhotoFiles } from '../domain/media/avatars';
import type { Remover, Visibility, Viewer } from '../access/visibility';
import { activityEntry, type ActivityOf } from '../domain/activity/activity';
import type {
	JournalCursor,
	JournalEntry,
	JournalRepository,
	NewJournalEntry
} from '../domain/journal/journal';
import type * as schema from './schema';
import { activityLog, contact, journalEntry, journalMention, photo, user } from './schema';

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
	const removableBy = (remover: Remover) =>
		authoredRemovableBy(remover, {
			visibility: journalEntry.visibility,
			createdBy: journalEntry.createdBy
		});

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

		async updateOwn(p: {
			authorId: string;
			id: string;
			title: string | null;
			body: string;
			updatedAt: number;
		}): Promise<boolean> {
			const own = db
				.select({ id: journalEntry.id })
				.from(journalEntry)
				.where(and(eq(journalEntry.id, p.id), eq(journalEntry.createdBy, p.authorId)))
				.get();
			if (!own) return false;
			db.update(journalEntry)
				.set({ title: p.title, body: p.body, updatedAt: p.updatedAt })
				.where(eq(journalEntry.id, p.id))
				.run();
			return true;
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

		async listPageForContactVisibleTo(
			viewer: Viewer,
			contactId: string,
			opts: { limit: number; before?: JournalCursor }
		): Promise<JournalEntry[]> {
			const conditions = [
				eq(journalEntry.contactId, contactId),
				childRecordVisibleTo(viewer, {
					visibility: journalEntry.visibility,
					createdBy: journalEntry.createdBy
				})
			];
			if (opts.before) {
				const { entryDate, createdAt } = opts.before;
				// Keyset: strictly older than the cursor in (entryDate, createdAt) order.
				conditions.push(
					or(
						lt(journalEntry.entryDate, entryDate),
						and(eq(journalEntry.entryDate, entryDate), lt(journalEntry.createdAt, createdAt))
					)!
				);
			}
			return db
				.select(columns)
				.from(journalEntry)
				.innerJoin(contact, eq(journalEntry.contactId, contact.id))
				.where(and(...conditions))
				.orderBy(desc(journalEntry.entryDate), desc(journalEntry.createdAt))
				.limit(opts.limit)
				.all();
		},

		async findRemovableBy(remover: Remover, id: string) {
			const row = db
				.select({
					id: journalEntry.id,
					contactId: journalEntry.contactId,
					person: contact.displayName,
					personVisibility: contact.visibility,
					authorId: journalEntry.createdBy,
					authorName: user.name
				})
				.from(journalEntry)
				.innerJoin(contact, eq(journalEntry.contactId, contact.id))
				.innerJoin(user, eq(journalEntry.createdBy, user.id))
				.where(and(eq(journalEntry.id, id), removableBy(remover)))
				.get();
			return row ?? null;
		},

		async deleteRemovableBy(
			remover: Remover,
			id: string,
			audit: ActivityOf<'record.removed'> | null
		): Promise<DeletedPhotoFiles[] | null> {
			return db.transaction((tx) => {
				// SQLite's DELETE takes no join, so the rule — which needs the contact — picks the id.
				const removable = tx
					.select({ id: journalEntry.id })
					.from(journalEntry)
					.innerJoin(contact, eq(journalEntry.contactId, contact.id))
					.where(and(eq(journalEntry.id, id), removableBy(remover)))
					.get();
				if (!removable) return null;

				// The photos go first and explicitly: the migration that added
				// `photo.journal_entry_id` never carried a cascade (schema/media.ts), so
				// the database refuses to delete an entry that still has them (docs/03 §photo).
				// Their bytes go back to the caller to unlink.
				const files = tx
					.delete(photo)
					.where(eq(photo.journalEntryId, id))
					.returning({ filePath: photo.filePath, thumbPath: photo.thumbPath })
					.all();
				tx.delete(journalEntry).where(eq(journalEntry.id, id)).run();
				if (audit) tx.insert(activityLog).values(activityEntry(audit)).run();
				return files;
			});
		},

		async replaceMentions(journalEntryId: string, contactIds: string[]): Promise<void> {
			db.transaction((tx) => {
				tx.delete(journalMention).where(eq(journalMention.journalEntryId, journalEntryId)).run();
				if (contactIds.length > 0) {
					tx.insert(journalMention)
						.values(contactIds.map((contactId) => ({ journalEntryId, contactId })))
						.run();
				}
			});
		},

		async listMentionedContactIds(journalEntryId: string): Promise<string[]> {
			return db
				.select({ contactId: journalMention.contactId })
				.from(journalMention)
				.where(eq(journalMention.journalEntryId, journalEntryId))
				.all()
				.map((r) => r.contactId);
		}
	};
}

import { and, eq, sql, type AnyColumn } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { MentionedIn, MentionedInRepository } from '../domain/mentions/mentioned-in';
import type * as schema from './schema';
import { contact, journalEntry, journalMention, note, noteMention } from './schema';

/*
 * Drizzle adapter for the MentionedInRepository port (docs/08 §8.3) — the reverse lookup from
 * a person to what names them (docs/02 §2.20.1).
 *
 * Each read starts at the mention table, joins the entry and then the person it is about, and
 * is scoped through the central `childRecordVisibleTo`: the source contact must be visible and
 * a private entry stays with its author. That is the whole rule — a passive item may never show
 * a viewer something the entry itself would have hidden, so nothing is filtered here by hand.
 */

/**
 * A note is about no day but the one it was written on, so that is the day the list shows.
 * Read in UTC, which is also how the day bands elsewhere read a stored instant.
 */
const dayOf = (column: AnyColumn) => sql<string>`date(${column} / 1000, 'unixepoch')`;

export function createDrizzleMentionedInRepository(
	db: BunSQLiteDatabase<typeof schema>
): MentionedInRepository {
	return {
		async listNoteMentionsOfVisibleTo(viewer: Viewer, contactId: string): Promise<MentionedIn[]> {
			const rows = db
				.select({
					entryId: note.id,
					sourceContactId: note.contactId,
					sourceName: contact.displayName,
					authorId: note.createdBy,
					visibility: note.visibility,
					day: dayOf(note.createdAt),
					recordedAt: note.createdAt,
					title: note.title,
					body: note.body
				})
				.from(noteMention)
				.innerJoin(note, eq(note.id, noteMention.noteId))
				.innerJoin(contact, eq(contact.id, note.contactId))
				.where(
					and(
						eq(noteMention.contactId, contactId),
						childRecordVisibleTo(viewer, {
							visibility: note.visibility,
							createdBy: note.createdBy
						})
					)
				)
				.all();

			return rows.map((row) => ({ kind: 'note', ...row }));
		},

		async listJournalMentionsOfVisibleTo(viewer: Viewer, contactId: string): Promise<MentionedIn[]> {
			const rows = db
				.select({
					entryId: journalEntry.id,
					sourceContactId: journalEntry.contactId,
					sourceName: contact.displayName,
					authorId: journalEntry.createdBy,
					visibility: journalEntry.visibility,
					day: journalEntry.entryDate,
					recordedAt: journalEntry.createdAt,
					title: journalEntry.title,
					body: journalEntry.body
				})
				.from(journalMention)
				.innerJoin(journalEntry, eq(journalEntry.id, journalMention.journalEntryId))
				.innerJoin(contact, eq(contact.id, journalEntry.contactId))
				.where(
					and(
						eq(journalMention.contactId, contactId),
						childRecordVisibleTo(viewer, {
							visibility: journalEntry.visibility,
							createdBy: journalEntry.createdBy
						})
					)
				)
				.all();

			return rows.map((row) => ({ kind: 'journal', ...row }));
		}
	};
}

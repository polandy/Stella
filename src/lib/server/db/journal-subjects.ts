import { and, asc, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { distinctSubjects, subjectKeyOf } from '../domain/journal/subjects';
import type * as schema from './schema';
import { journalEntry, journalMention, journalSubject, photo } from './schema';

/*
 * Writing the people a journal entry is about (docs/02 §2.20.3, docs/03 §journal_subject): the
 * anchor in `contact_id`, the rest in `journal_subject`, the slot in `subject_key`. One place,
 * so an edit, a merge and a deleted person keep the three in step and join entries alike.
 */

type Db = BunSQLiteDatabase<typeof schema>;

/** Entries about the person: anchored on them, or with them among the further subjects. */
export function journalAbout(contactId: string | SQL): SQL {
	return or(
		eq(journalEntry.contactId, contactId),
		sql`exists (select 1 from ${journalSubject} where ${journalSubject.journalEntryId} = ${journalEntry.id} and ${journalSubject.contactId} = ${contactId})`
	)!;
}

/** The entry's subjects, the anchor first. */
export function subjectsOf(tx: Db, entryId: string): string[] {
	const anchor = tx
		.select({ contactId: journalEntry.contactId })
		.from(journalEntry)
		.where(eq(journalEntry.id, entryId))
		.get();
	if (!anchor) return [];
	const others = tx
		.select({ contactId: journalSubject.contactId })
		.from(journalSubject)
		.where(eq(journalSubject.journalEntryId, entryId))
		.orderBy(asc(sql`rowid`))
		.all()
		.map((row) => row.contactId);
	return [anchor.contactId, ...others];
}

/** Store the further subjects of a new entry, beside its anchor. */
export function insertFurtherSubjects(tx: Db, entryId: string, subjectIds: readonly string[]) {
	const [anchor, ...others] = distinctSubjects(subjectIds);
	const rows = others.filter((id) => id !== anchor);
	if (rows.length > 0) {
		tx.insert(journalSubject)
			.values(rows.map((contactId) => ({ journalEntryId: entryId, contactId })))
			.run();
	}
}

/**
 * Append `from` to `into` — the same people, author, day and visibility — with its photos, Immich
 * references, mentions and tags, then delete it. Nothing anybody wrote is dropped (ADR-086).
 */
function joinInto(tx: Db, fromId: string, into: { id: string; anchor: string }, updatedAt: number) {
	const from = tx
		.select({ body: journalEntry.body })
		.from(journalEntry)
		.where(eq(journalEntry.id, fromId))
		.get();
	const target = tx
		.select({ body: journalEntry.body, title: journalEntry.title })
		.from(journalEntry)
		.where(eq(journalEntry.id, into.id))
		.get();
	if (!from || !target) return;
	tx.update(journalEntry)
		.set({ body: `${target.body}\n\n${from.body}`, updatedAt })
		.where(eq(journalEntry.id, into.id))
		.run();
	tx.update(photo)
		.set({ journalEntryId: into.id, contactId: into.anchor })
		.where(eq(photo.journalEntryId, fromId))
		.run();
	// Rows keyed on (entry, …): the ones the survivor already has lose and go with `from`.
	tx.run(
		sql`update or ignore journal_mention set journal_entry_id = ${into.id} where journal_entry_id = ${fromId}`
	);
	tx.run(
		sql`update or ignore journal_entry_tag set journal_entry_id = ${into.id} where journal_entry_id = ${fromId}`
	);
	tx.run(
		sql`update or ignore journal_immich_photo set journal_entry_id = ${into.id} where journal_entry_id = ${fromId}`
	);
	tx.delete(journalEntry).where(eq(journalEntry.id, fromId)).run();
}

/**
 * Give an entry exactly these subjects, the first its anchor (its photos follow). When the
 * author already has an entry about the same people that day and visibility, the two are joined
 * into that one (docs/02 §2.20.3). Returns the id that holds the entry afterwards.
 */
export function setEntrySubjects(
	tx: Db,
	entryId: string,
	subjectIds: readonly string[],
	updatedAt: number
): string {
	const subjects = distinctSubjects(subjectIds);
	const entry = tx
		.select({
			createdBy: journalEntry.createdBy,
			entryDate: journalEntry.entryDate,
			visibility: journalEntry.visibility
		})
		.from(journalEntry)
		.where(eq(journalEntry.id, entryId))
		.get();
	if (!entry || subjects.length === 0) return entryId;
	const subjectKey = subjectKeyOf(subjects);

	const sameSlot = tx
		.select({ id: journalEntry.id, anchor: journalEntry.contactId })
		.from(journalEntry)
		.where(
			and(
				eq(journalEntry.subjectKey, subjectKey),
				eq(journalEntry.createdBy, entry.createdBy),
				eq(journalEntry.entryDate, entry.entryDate),
				eq(journalEntry.visibility, entry.visibility),
				ne(journalEntry.id, entryId)
			)
		)
		.get();
	if (sameSlot) {
		joinInto(tx, entryId, sameSlot, updatedAt);
		dropSubjectMentions(tx, sameSlot.id, subjects);
		return sameSlot.id;
	}

	const [anchor] = subjects;
	tx.update(journalEntry)
		.set({ contactId: anchor, subjectKey })
		.where(eq(journalEntry.id, entryId))
		.run();
	tx.update(photo).set({ contactId: anchor }).where(eq(photo.journalEntryId, entryId)).run();
	tx.delete(journalSubject).where(eq(journalSubject.journalEntryId, entryId)).run();
	insertFurtherSubjects(tx, entryId, subjects);
	dropSubjectMentions(tx, entryId, subjects);
	return entryId;
}

/** A subject is never also a mention of the same entry (docs/03 §journal_mention). */
function dropSubjectMentions(tx: Db, entryId: string, subjects: readonly string[]) {
	tx.delete(journalMention)
		.where(
			and(eq(journalMention.journalEntryId, entryId), inArray(journalMention.contactId, subjects))
		)
		.run();
}

/**
 * Take `gone` out of every entry about them: `by` stands in for them (a merge's survivor), or
 * nobody (a deleted person) and the next subject becomes the anchor. An entry about `gone` alone
 * is left to go with them.
 */
export function replaceSubjectEverywhere(
	tx: Db,
	gone: string,
	by: string | null,
	updatedAt: number
): void {
	const anchored = tx
		.select({ id: journalEntry.id })
		.from(journalEntry)
		.where(eq(journalEntry.contactId, gone))
		.all();
	const further = tx
		.select({ id: journalSubject.journalEntryId })
		.from(journalSubject)
		.where(eq(journalSubject.contactId, gone))
		.all();
	for (const id of new Set([...anchored, ...further].map((row) => row.id))) {
		const next = subjectsOf(tx, id).flatMap((subject) =>
			subject === gone ? (by ? [by] : []) : [subject]
		);
		if (next.length > 0) setEntrySubjects(tx, id, next, updatedAt);
	}
}

import { and, eq, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { NewActivityEntry } from '../domain/activity/activity';
import type { MergeableProfile } from '../domain/contacts/merge-profile';
import type { Viewer } from '../access/visibility';
import { contactVisibleTo } from '../access/query-scoping';
import type * as schema from './schema';
import {
	activityLog,
	circleMembership,
	contact,
	journalEntry,
	journalMention,
	photo,
	relationship
} from './schema';

/*
 * Merging one contact into another (docs/02 §2.2), kept out of the repository file because
 * it is the one operation that has to know every table pointing at `contact`.
 *
 * Everything hanging off the record being merged away is repointed at the survivor inside a
 * single transaction. Most of it is a plain UPDATE; the interesting part is what happens
 * where a constraint says the survivor already has that row. `UPDATE OR IGNORE` settles those:
 * the colliding row is simply left pointing at the record being merged away, and goes with it
 * when that row is deleted at the end. So the survivor keeps the one it already had, and no
 * duplicate survives.
 */

type Db = BunSQLiteDatabase<typeof schema>;

/** Tables where the pair (survivor, thing) is a key, so a duplicate cannot be repointed. */
const DEDUPED_BY_KEY: readonly { table: string; column: string }[] = [
	{ table: 'note_mention', column: 'contact_id' },
	{ table: 'journal_mention', column: 'contact_id' },
	{ table: 'interaction_participant', column: 'contact_id' },
	{ table: 'contact_tag', column: 'contact_id' }
];

/** Tables that simply follow the contact, with nothing that could collide. */
const REPOINTED: readonly { table: string; column: string }[] = [
	{ table: 'contact_field', column: 'contact_id' },
	{ table: 'note', column: 'contact_id' },
	{ table: 'interaction', column: 'contact_id' },
	{ table: 'important_date', column: 'contact_id' },
	{ table: 'photo', column: 'contact_id' },
	{ table: 'activity_log', column: 'contact_id' }
];

/**
 * Move the journal across. An entry is unique per (contact, author, day, visibility), so two
 * entries written about the same day by the same member cannot both survive as rows: the one
 * being merged away is appended to the one that stays, with its photos and mentions, and only
 * then removed. Nothing anybody wrote is dropped.
 */
function mergeJournal(tx: Db, keepId: string, mergedId: string, updatedAt: number): void {
	const colliding = tx
		.select({
			id: journalEntry.id,
			body: journalEntry.body,
			createdBy: journalEntry.createdBy,
			entryDate: journalEntry.entryDate,
			visibility: journalEntry.visibility
		})
		.from(journalEntry)
		.where(eq(journalEntry.contactId, mergedId))
		.all();

	for (const entry of colliding) {
		const survivor = tx
			.select({ id: journalEntry.id, body: journalEntry.body })
			.from(journalEntry)
			.where(
				and(
					eq(journalEntry.contactId, keepId),
					eq(journalEntry.createdBy, entry.createdBy),
					eq(journalEntry.entryDate, entry.entryDate),
					eq(journalEntry.visibility, entry.visibility)
				)
			)
			.get();
		if (!survivor) continue; // the slot is free; the blanket UPDATE below moves it

		tx.update(journalEntry)
			.set({ body: `${survivor.body}\n\n${entry.body}`, updatedAt })
			.where(eq(journalEntry.id, survivor.id))
			.run();
		tx.update(photo)
			.set({ journalEntryId: survivor.id })
			.where(eq(photo.journalEntryId, entry.id))
			.run();
		// The mention rows key on (entry, contact), so the ones the survivor already has lose.
		tx.run(
			sql`update or ignore journal_mention set journal_entry_id = ${survivor.id} where journal_entry_id = ${entry.id}`
		);
		tx.delete(journalMention).where(eq(journalMention.journalEntryId, entry.id)).run();
		tx.delete(journalEntry).where(eq(journalEntry.id, entry.id)).run();
	}

	tx.update(journalEntry)
		.set({ contactId: keepId })
		.where(eq(journalEntry.contactId, mergedId))
		.run();
}

/**
 * Move the relationships across. Both endpoints are repointed; a link that ran *between* the
 * two records becomes a link from someone to themselves and is dropped, and a link the
 * survivor already had of the same type is dropped as the duplicate it now is.
 */
function mergeRelationships(tx: Db, keepId: string, mergedId: string): void {
	tx.run(
		sql`update or ignore relationship set from_contact_id = ${keepId} where from_contact_id = ${mergedId}`
	);
	tx.run(
		sql`update or ignore relationship set to_contact_id = ${keepId} where to_contact_id = ${mergedId}`
	);
	// The two were linked to each other: that link now points at one person, twice.
	tx.delete(relationship)
		.where(eq(relationship.fromContactId, relationship.toContactId))
		.run();
}

/** Drop the merged record's membership of a circle the survivor is already in. */
function mergeCircleMemberships(tx: Db, keepId: string, mergedId: string): void {
	const keepCircles = tx
		.select({ circleId: circleMembership.circleId })
		.from(circleMembership)
		.where(eq(circleMembership.contactId, keepId))
		.all()
		.map((row) => row.circleId);

	for (const circleId of keepCircles) {
		tx.delete(circleMembership)
			.where(
				and(eq(circleMembership.contactId, mergedId), eq(circleMembership.circleId, circleId))
			)
			.run();
	}
	tx.update(circleMembership)
		.set({ contactId: keepId })
		.where(eq(circleMembership.contactId, mergedId))
		.run();
}

/**
 * Merge `mergedId` into `keepId`, writing `audit` in the same transaction. Returns false when
 * either contact is out of the viewer's reach, or when the two are the same record.
 */
export function mergeContacts(
	db: Db,
	viewer: Viewer,
	input: {
		keepId: string;
		mergedId: string;
		profile: MergeableProfile;
		audit: NewActivityEntry;
		updatedAt: number;
	}
): boolean {
	if (input.keepId === input.mergedId) return false;

	return db.transaction((tx) => {
		const both = tx
			.select({ id: contact.id })
			.from(contact)
			.where(
				and(
					sql`${contact.id} in (${input.keepId}, ${input.mergedId})`,
					contactVisibleTo(viewer)
				)
			)
			.all();
		if (both.length !== 2) return false;

		mergeJournal(tx, input.keepId, input.mergedId, input.updatedAt);
		mergeRelationships(tx, input.keepId, input.mergedId);
		mergeCircleMemberships(tx, input.keepId, input.mergedId);

		for (const { table, column } of DEDUPED_BY_KEY) {
			tx.run(
				sql`update or ignore ${sql.identifier(table)} set ${sql.identifier(column)} = ${input.keepId} where ${sql.identifier(column)} = ${input.mergedId}`
			);
		}
		for (const { table, column } of REPOINTED) {
			tx.run(
				sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${input.keepId} where ${sql.identifier(column)} = ${input.mergedId}`
			);
		}

		tx.update(contact)
			.set({
				...input.profile,
				isDeceased: input.profile.isDeceased ? 1 : 0,
				updatedAt: input.updatedAt
			})
			.where(eq(contact.id, input.keepId))
			.run();

		// The merged record is empty by now; deleting it can take nothing with it.
		tx.delete(contact).where(eq(contact.id, input.mergedId)).run();
		tx.insert(activityLog).values(input.audit).run();
		return true;
	});
}

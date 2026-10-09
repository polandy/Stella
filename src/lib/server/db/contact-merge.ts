import { and, eq, or, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { activityEntry, type ActivityOf } from '../domain/activity/activity';
import { foldedLinkDetails } from '../../relationships/fold';
import { linkAfterMerge } from '../domain/contacts/merge-links';
import { MERGE_PLAN, type MergeSettlement, type MergeStep } from '../domain/contacts/merge-plan';
import type { MergeableProfile } from '../domain/contacts/merge-profile';
import type { Viewer } from '../access/visibility';
import { contactVisibleTo } from '../access/query-scoping';
import { keepUnwornCuts } from './cut-turning';
import type * as schema from './schema';
import {
	activityLog,
	circleMembership,
	contact,
	journalEntry,
	journalMention,
	photo,
	relationship,
	relationshipType
} from './schema';

/*
 * Merging one contact into another (docs/02 §2.2), kept out of the repository file because
 * it is the one operation that has to touch every table pointing at `contact`.
 *
 * Which tables, in which order, and what happens where the survivor already has the row are
 * the domain's decisions (`domain/contacts/merge-plan.ts`); this runs that plan inside a single
 * transaction and owns the SQL. `survivor-keeps` is `UPDATE OR IGNORE`: the colliding row is
 * simply left pointing at the record being merged away, and goes with it when that row is
 * deleted at the end. So the survivor keeps the one it already had, and no duplicate survives.
 */

type Db = BunSQLiteDatabase<typeof schema>;

/** What a settlement needs to know about the merge it runs in. */
interface Merging {
	keepId: string;
	mergedId: string;
	updatedAt: number;
}

/**
 * An entry is unique per (contact, author, day, visibility), so two entries written about the
 * same day by the same member cannot both survive as rows: the one being merged away is
 * appended to the one that stays, with its photos and mentions, and only then removed. Nothing
 * anybody wrote is dropped; every entry left can move without colliding.
 */
function joinJournalDays(tx: Db, { keepId, mergedId, updatedAt }: Merging): void {
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
		if (!survivor) continue; // the slot is free; the plan's repoint moves it

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
}

/**
 * Every link the merged record has with a third person gets its new ends from
 * `linkAfterMerge`, so a symmetric one lands sorted rather than wherever a column-by-column
 * repoint would leave it. Where the survivor already has that link, it stays theirs and only
 * its blanks are filled from the merged copy, which then goes. The links between the two are
 * left for the repoints and `dropSelfLinks`.
 */
function moveLinksInStoredOrder(tx: Db, { keepId, mergedId, updatedAt }: Merging): void {
	const links = tx
		.select({
			id: relationship.id,
			fromContactId: relationship.fromContactId,
			toContactId: relationship.toContactId,
			typeId: relationship.typeId,
			description: relationship.note,
			sinceDate: relationship.sinceDate,
			symmetric: relationshipType.symmetric
		})
		.from(relationship)
		.innerJoin(relationshipType, eq(relationshipType.id, relationship.typeId))
		.where(or(eq(relationship.fromContactId, mergedId), eq(relationship.toContactId, mergedId)))
		.all();

	for (const link of links) {
		const pair = linkAfterMerge(link, { keepId, mergedId }, link.symmetric === 1);
		if (!pair) continue;

		const theirs = tx
			.select({
				id: relationship.id,
				description: relationship.note,
				sinceDate: relationship.sinceDate
			})
			.from(relationship)
			.where(
				and(
					eq(relationship.fromContactId, pair.fromContactId),
					eq(relationship.toContactId, pair.toContactId),
					eq(relationship.typeId, link.typeId)
				)
			)
			.get();
		if (!theirs) {
			tx.update(relationship)
				.set({ fromContactId: pair.fromContactId, toContactId: pair.toContactId })
				.where(eq(relationship.id, link.id))
				.run();
			continue;
		}

		const { description, sinceDate } = foldedLinkDetails(theirs, link);
		if (description !== undefined || sinceDate !== undefined) {
			tx.update(relationship)
				.set({ note: description, sinceDate, updatedAt })
				.where(eq(relationship.id, theirs.id))
				.run();
		}
		tx.delete(relationship).where(eq(relationship.id, link.id)).run();
	}
}

/**
 * Once both endpoints have moved, a link that ran *between* the two records is a link from
 * someone to themselves; drop it. (Two directed ones, one each way, collide on the way there:
 * `survivor-keeps` leaves the second behind and it goes with the merged record.)
 */
function dropSelfLinks(tx: Db): void {
	tx.delete(relationship).where(eq(relationship.fromContactId, relationship.toContactId)).run();
}

/** Drop the merged record's membership of a circle the survivor is already in. */
function dropMembershipsSurvivorHas(tx: Db, { keepId, mergedId }: Merging): void {
	const keepCircles = tx
		.select({ circleId: circleMembership.circleId })
		.from(circleMembership)
		.where(eq(circleMembership.contactId, keepId))
		.all()
		.map((row) => row.circleId);

	for (const circleId of keepCircles) {
		tx.delete(circleMembership)
			.where(and(eq(circleMembership.contactId, mergedId), eq(circleMembership.circleId, circleId)))
			.run();
	}
}

/** The steps the plan names rather than describes, each implemented here. */
const SETTLEMENTS: Record<MergeSettlement, (tx: Db, merging: Merging) => void> = {
	'join-journal-days': joinJournalDays,
	'move-links-in-stored-order': moveLinksInStoredOrder,
	'drop-self-links': dropSelfLinks,
	'drop-memberships-survivor-has': dropMembershipsSurvivorHas,
	'turn-merged-cuts': (tx, { mergedId }) => keepUnwornCuts(tx, mergedId, { evenWorn: true })
};

/** Run one step of the plan. */
function runStep(tx: Db, step: MergeStep, merging: Merging): void {
	if (step.kind === 'settle') return SETTLEMENTS[step.settle](tx, merging);
	const table = sql.identifier(step.table);
	const column = sql.identifier(step.column);
	const verb = step.onConflict === 'survivor-keeps' ? sql`update or ignore` : sql`update`;
	tx.run(
		sql`${verb} ${table} set ${column} = ${merging.keepId} where ${column} = ${merging.mergedId}`
	);
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
		audit: ActivityOf<'contact.merged'>;
		updatedAt: number;
	}
): boolean {
	if (input.keepId === input.mergedId) return false;

	return db.transaction((tx) => {
		const both = tx
			.select({ id: contact.id })
			.from(contact)
			.where(
				and(sql`${contact.id} in (${input.keepId}, ${input.mergedId})`, contactVisibleTo(viewer))
			)
			.all();
		if (both.length !== 2) return false;

		for (const step of MERGE_PLAN) runStep(tx, step, input);

		tx.update(contact)
			.set({
				...input.profile,
				isDeceased: input.profile.isDeceased ? 1 : 0,
				updatedAt: input.updatedAt
			})
			.where(eq(contact.id, input.keepId))
			.run();
		// A cut the survivor no longer wears after the merge stays theirs as a photo (concept §5.2).
		keepUnwornCuts(tx, input.keepId);

		// The merged record is empty by now; deleting it can take nothing with it.
		tx.delete(contact).where(eq(contact.id, input.mergedId)).run();
		tx.insert(activityLog).values(activityEntry(input.audit)).run();
		return true;
	});
}

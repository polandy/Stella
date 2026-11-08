import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { activityEntry, type ActivityOf } from '../domain/activity/activity';
import { foldedLinkDetails } from '../../relationships/fold';
import { linkAfterMerge } from '../domain/contacts/merge-links';
import {
	MERGE_PLAN,
	MergeWouldHideRecordsError,
	mergeKeepsRecordsInView,
	type MergeSettlement,
	type MergeStep
} from '../domain/contacts/merge-plan';
import type { MergeableProfile } from '../domain/contacts/merge-profile';
import type { Remover } from '../access/visibility';
import { contactMergeableBy } from '../access/query-scoping';
import { keepUnwornCuts } from './cut-turning';
import { replaceSubjectEverywhere } from './journal-subjects';
import type * as schema from './schema';
import {
	activityLog,
	circleMembership,
	contact,
	interaction,
	interactionParticipant,
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
 * Every link the merged record has with a third person gets its new ends from
 * `linkAfterMerge`, so a symmetric one lands sorted rather than wherever a column-by-column
 * repoint would leave it. Where the survivor already has that link, it stays theirs and only
 * its blanks are filled from the merged copy, which then goes. The links between the two are
 * gone by then (`dropLinksBetweenTheTwo`).
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
 * A link that runs between the two records would point at one person once either end moved, and
 * the table refuses a link from someone to themselves; so it goes before anything is repointed.
 */
function dropLinksBetweenTheTwo(tx: Db, { keepId, mergedId }: Merging): void {
	tx.delete(relationship)
		.where(
			or(
				and(eq(relationship.fromContactId, keepId), eq(relationship.toContactId, mergedId)),
				and(eq(relationship.fromContactId, mergedId), eq(relationship.toContactId, keepId))
			)
		)
		.run();
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

/** Nobody is a participant of an interaction about themselves (SV-12). */
function dropSurvivorFromOwnInteractions(tx: Db, { keepId }: Merging): void {
	tx.delete(interactionParticipant)
		.where(
			and(
				eq(interactionParticipant.contactId, keepId),
				inArray(
					interactionParticipant.interactionId,
					tx
						.select({ id: interaction.id })
						.from(interaction)
						.where(eq(interaction.contactId, keepId))
				)
			)
		)
		.run();
}

/** The steps the plan names rather than describes, each implemented here. */
const SETTLEMENTS: Record<MergeSettlement, (tx: Db, merging: Merging) => void> = {
	'move-journal-subjects': (tx, { keepId, mergedId, updatedAt }) =>
		replaceSubjectEverywhere(tx, mergedId, keepId, updatedAt),
	'move-links-in-stored-order': moveLinksInStoredOrder,
	'drop-links-between-the-two': dropLinksBetweenTheTwo,
	'drop-memberships-survivor-has': dropMembershipsSurvivorHas,
	'drop-survivor-from-own-interactions': dropSurvivorFromOwnInteractions,
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
 * the remover may not merge them (`contactMergeableBy` on both rows: an admin who sees both),
 * or when the two are the same record; throws
 * `MergeWouldHideRecordsError` for a shared record merged into a private survivor — asked
 * again here, inside the write, since either may have changed visibility since the read.
 */
export function mergeContacts(
	db: Db,
	remover: Remover,
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
			.select({ id: contact.id, displayName: contact.displayName, visibility: contact.visibility })
			.from(contact)
			.where(
				and(sql`${contact.id} in (${input.keepId}, ${input.mergedId})`, contactMergeableBy(remover))
			)
			.all();
		const keep = both.find((row) => row.id === input.keepId);
		const mergedAway = both.find((row) => row.id === input.mergedId);
		if (!keep || !mergedAway) return false;
		if (!mergeKeepsRecordsInView(keep.visibility, mergedAway.visibility)) {
			throw new MergeWouldHideRecordsError(keep.displayName, mergedAway.displayName);
		}

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

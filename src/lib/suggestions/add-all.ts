import { MAX_PARENTS } from '$lib/relationships/exclusions';
import type { RelationshipSide } from '$lib/relationships/type-options';
import type { Relation } from './types';

/*
 * *Add all* on the *Also true?* block (docs/concepts/multi-pick-relationships.html D7).
 *
 * Every claim is still shown and answerable on its own row; this only finds the claims that can
 * also be stored together, as one `relationship.addMany` — one person, one type, several people
 * at the other end — so a household that has read them all takes them in one step, with one
 * toast and one *Undo*. The one *Undo* is what answers the old worry about bulk accept: a sweep
 * of *yes* that turns out wrong is taken back in the same single step.
 *
 * Only parent claims: they are what a write implies (L1–L3). A worked-out relative is answered
 * on the review, one at a time.
 */

/** A claim as far as batching cares. */
export interface BatchableClaim {
	relation: Relation;
	fromId: string;
	toId: string;
}

/**
 * Claims stored as one batch from `subjectId`'s page: `reverse` reads "child of" (the subject is
 * the child, the targets their parents), `forward` reads "parent of".
 */
export interface AddAllBatch {
	subjectId: string;
	side: RelationshipSide;
	targetIds: string[];
}

/** The claims grouped by one end, keeping first-seen order between and within groups. */
function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const key = keyOf(item);
		groups.set(key, [...(groups.get(key) ?? []), item]);
	}
	return groups;
}

/**
 * The batches among `claims` — the standing ones, in the engine's order. A child's offered
 * parents come first, as the mockup's per-person rows read ("Mia ← Anna and Bert"); what is left
 * is gathered by parent ("Bert → Lio, Mia, Tom"). Every claim goes to one batch at most, a claim
 * on its own makes none (its row's *Accept* is already one step), and a batch the parent cap
 * would refuse is not offered — the save is all or nothing, so offering it would only fail.
 */
export function addAllBatches(
	claims: readonly BatchableClaim[],
	parentsOnRecord: (childId: string) => number
): AddAllBatch[] {
	const parentClaims = claims.filter((claim) => claim.relation === 'parent');
	const batches: AddAllBatch[] = [];
	const taken = new Set<BatchableClaim>();

	for (const [childId, group] of groupBy(parentClaims, (claim) => claim.toId)) {
		if (group.length < 2 || parentsOnRecord(childId) + group.length > MAX_PARENTS) continue;
		batches.push({ subjectId: childId, side: 'reverse', targetIds: group.map((claim) => claim.fromId) });
		for (const claim of group) taken.add(claim);
	}

	const left = parentClaims.filter((claim) => !taken.has(claim));
	for (const [parentId, group] of groupBy(left, (claim) => claim.fromId)) {
		if (group.length < 2) continue;
		batches.push({ subjectId: parentId, side: 'forward', targetIds: group.map((claim) => claim.toId) });
	}
	return batches;
}

import { PARENT_CHILD_TYPE_KEY, SIBLING_TYPE_KEY } from '$lib/relationships/type-keys';
import type { KinTerm } from './kinship';

/*
 * Correcting a worked-out step relative (docs/02 §2.4.1).
 *
 * A step term is what the engine falls back to when the link runs through a partner and no
 * direct link is on record: a partner's child is a step-child, because as far as Stella has
 * been told, that is all it is. Often the household means more than that — the partner's
 * child is also their own — and only they can say which reading is true. So the step terms,
 * and only those, offer the direct link as a one-tap correction.
 *
 * Pure and language-free, like the rest of `kinship/`: this decides which row would be
 * written and which way round, never the wording and never the writing itself.
 */

/** Which end of a directed link the subject of the page is. */
export type ClaimParent = 'subject' | 'relative' | null;

/** The direct link a step term becomes once the household confirms it. */
export interface DirectClaim {
	/** The relationship type to store. */
	typeKey: typeof PARENT_CHILD_TYPE_KEY | typeof SIBLING_TYPE_KEY;
	/** Who the parent is, or `null` where the type is symmetric and has no direction. */
	parent: ClaimParent;
}

const DIRECT_CLAIMS: Partial<Record<KinTerm, DirectClaim>> = {
	'step-child': { typeKey: PARENT_CHILD_TYPE_KEY, parent: 'subject' },
	'step-parent': { typeKey: PARENT_CHILD_TYPE_KEY, parent: 'relative' },
	'step-sibling': { typeKey: SIBLING_TYPE_KEY, parent: null }
};

/**
 * The direct link this worked-out term could really be, or `null` where the term is not
 * ambiguous — a grandparent is a grandparent, and there is nothing for the household to
 * decide.
 */
export function directClaimFor(term: KinTerm): DirectClaim | null {
	return DIRECT_CLAIMS[term] ?? null;
}

/** The two ends of the row a confirmed claim writes, in the order it is stored. */
export interface ClaimEndpoints {
	/** The `from` end — the parent, where the type is directed. */
	fromId: string;
	/** The `to` end — the child, where the type is directed. */
	toId: string;
}

/**
 * Which way round the confirmed row goes: the parent is the `from` end, and a symmetric type
 * is stored subject-first, since either order says the same thing.
 */
export function claimEndpoints(
	claim: DirectClaim,
	subjectId: string,
	relativeId: string
): ClaimEndpoints {
	return claim.parent === 'relative'
		? { fromId: relativeId, toId: subjectId }
		: { fromId: subjectId, toId: relativeId };
}

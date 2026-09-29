import {
	AUNT_UNCLE_TYPE_KEY,
	COUSIN_TYPE_KEY,
	GRANDPARENT_GRANDCHILD_TYPE_KEY,
	GREAT_GRANDPARENT_TYPE_KEY,
	HALF_SIBLING_TYPE_KEY,
	PARENT_CHILD_TYPE_KEY,
	PARENT_IN_LAW_TYPE_KEY,
	SIBLING_IN_LAW_TYPE_KEY,
	SIBLING_TYPE_KEY
} from '$lib/relationships/type-keys';
import type { KinTerm } from './kinship';

/*
 * Turning a worked-out relative into an entered one (docs/02 §2.4.1).
 *
 * Every row of the derived block can be stored, in one of two ways:
 *
 * - A **step** term is what the engine falls back to when the link runs through a partner and
 *   no direct link is on record: a partner's child is a step-child, because as far as Stella
 *   has been told, that is all it is. Often the household means more than that — the
 *   partner's child is also their own — so a step term offers the *direct* link as a
 *   correction. Stella has no step type, so the step reading itself is not stored.
 * - Every other term is **confirmed** as it stands: a grandmother is stored as a grandparent
 *   link, a cousin as a cousin. The stored row then keeps the pair's name even if the links it
 *   was worked out from change later.
 *
 * Pure and language-free, like the rest of `kinship/`: this decides which row would be
 * written and which way round, never the wording and never the writing itself.
 */

/** Which end of a directed link the subject of the page is. */
export type ClaimElder = 'subject' | 'relative' | null;

/** A link a worked-out term can be stored as. */
export interface DirectClaim {
	/** The relationship type to store. */
	typeKey: string;
	/**
	 * Who stands at the `from` end — the parent, the grandparent, the aunt — or `null` where
	 * the type is symmetric and has no direction.
	 */
	elder: ClaimElder;
}

const DIRECT_CLAIMS: Partial<Record<KinTerm, DirectClaim>> = {
	'step-child': { typeKey: PARENT_CHILD_TYPE_KEY, elder: 'subject' },
	'step-parent': { typeKey: PARENT_CHILD_TYPE_KEY, elder: 'relative' },
	'step-sibling': { typeKey: SIBLING_TYPE_KEY, elder: null }
};

const CONFIRMED_CLAIMS: Partial<Record<KinTerm, DirectClaim>> = {
	sibling: { typeKey: SIBLING_TYPE_KEY, elder: null },
	'half-sibling': { typeKey: HALF_SIBLING_TYPE_KEY, elder: null },
	grandparent: { typeKey: GRANDPARENT_GRANDCHILD_TYPE_KEY, elder: 'relative' },
	grandchild: { typeKey: GRANDPARENT_GRANDCHILD_TYPE_KEY, elder: 'subject' },
	'aunt-uncle': { typeKey: AUNT_UNCLE_TYPE_KEY, elder: 'relative' },
	'niece-nephew': { typeKey: AUNT_UNCLE_TYPE_KEY, elder: 'subject' },
	'great-grandparent': { typeKey: GREAT_GRANDPARENT_TYPE_KEY, elder: 'relative' },
	'great-grandchild': { typeKey: GREAT_GRANDPARENT_TYPE_KEY, elder: 'subject' },
	cousin: { typeKey: COUSIN_TYPE_KEY, elder: null },
	'parent-in-law': { typeKey: PARENT_IN_LAW_TYPE_KEY, elder: 'relative' },
	'child-in-law': { typeKey: PARENT_IN_LAW_TYPE_KEY, elder: 'subject' },
	'sibling-in-law': { typeKey: SIBLING_IN_LAW_TYPE_KEY, elder: null }
};

/**
 * The direct link a step term could really be, or `null` for every other term, which is
 * confirmed as it stands (`confirmedClaimFor`).
 */
export function directClaimFor(term: KinTerm): DirectClaim | null {
	return DIRECT_CLAIMS[term] ?? null;
}

/**
 * The link a worked-out term is stored as when the household confirms it, or `null` for a
 * step term — that one is corrected to a direct link instead (`directClaimFor`).
 */
export function confirmedClaimFor(term: KinTerm): DirectClaim | null {
	return CONFIRMED_CLAIMS[term] ?? null;
}

/** The two ends of the row a confirmed claim writes, in the order it is stored. */
export interface ClaimEndpoints {
	/** The `from` end — the elder generation, where the type is directed. */
	fromId: string;
	/** The `to` end — the younger generation, where the type is directed. */
	toId: string;
}

/**
 * Which way round the confirmed row goes: the elder is the `from` end, and a symmetric type
 * is stored subject-first, since either order says the same thing.
 */
export function claimEndpoints(
	claim: DirectClaim,
	subjectId: string,
	relativeId: string
): ClaimEndpoints {
	return claim.elder === 'relative'
		? { fromId: relativeId, toId: subjectId }
		: { fromId: subjectId, toId: relativeId };
}

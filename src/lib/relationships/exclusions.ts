import type { RelationshipCategory } from './categories';
import { PARENT_CHILD_TYPE_KEY, PARTNER_TYPE_KEYS, SIBLING_TYPE_KEY } from './type-keys';
import type { RelationshipSide } from './type-options';

/*
 * Which ties cannot be claimed beside the ties already on record (docs/02 §2.4).
 *
 * Stella's older guards ask whether *this exact row* is already there — same pair, same
 * type, same direction. That lets a household state two things that cannot both be true:
 * married to two people at once, a mother who is also a sister. These rules answer the
 * wider question, and they answer it once: the person page greys the entry out with the
 * reason, and the use-case refuses the write, both reading the function below, so the
 * picker and the domain can never disagree about what is allowed.
 *
 * Pure: the caller supplies what is on record, already scoped to what the viewer may see,
 * so a refusal can never be worded around somebody they are not allowed to know about.
 *
 * A tie that no longer holds is not on record for these purposes. The facts are built with
 * the `former` links left out (`romanticPairs`), which is the escape a household needs: a
 * marriage that has ended stops standing in the way of the next one.
 */

/** Why a type may not be claimed between two people. */
export const EXCLUSION_REASONS = [
	'alreadyRomantic',
	'siblingDerived',
	'romanticTaken',
	'parentsComplete'
] as const;

/** One of `EXCLUSION_REASONS`. */
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

/**
 * The most parents a child is given. Stella has no step- or adoptive parent type, so a
 * third parent is more often a mistyped link than a real third parent — the household can
 * still record one by correcting an existing link rather than adding to it.
 */
export const MAX_PARENTS = 2;

/**
 * The one category a pair holds only once. Everything else stacks: a colleague is often a
 * friend, and — the case that decided this — a godparent is very often the grandfather or
 * the uncle as well, so kinship a household enters twice about the same two people is
 * information, not a contradiction. Romance is different: *partner* and *spouse* are the same
 * claim in two words, and a pair carrying both says the household could not choose.
 */
const EXCLUSIVE_CATEGORIES: readonly RelationshipCategory[] = ['romantic'];

/**
 * How a link that is in the way reads, so a refusal can name it rather than say only that
 * something is there. All three fields together: a household's own type is shown as it was
 * typed, a built-in one is translated by its key, and the side decides which of the two
 * labels applies — *Godchild of*, not *Godparent of*.
 */
export interface TieReference {
	typeKey: string;
	side: RelationshipSide;
	/** The stored label, and the fallback for a type Stella does not own. */
	label: string;
}

/** One link the subject already carries, in the fields the rules read. */
export interface SubjectTie extends TieReference {
	/** The row, so a link being retyped can be left out of the answer. */
	relationshipId: string;
	otherContactId: string;
	category: RelationshipCategory;
}

/** An undirected pair of ids. */
export interface ExclusionPair {
	a: string;
	b: string;
}

/** A parent → child link as the kinship graph holds it. */
export interface ExclusionParentEdge {
	parentId: string;
	childId: string;
}

/** What is on record, as the rules need it. Everything is scoped to one viewer already. */
export interface ExclusionFacts {
	/** Every link the subject carries, from their perspective. */
	subjectTies: readonly SubjectTie[];
	/** Partner and spouse links across the household — **only those that still hold**. */
	romanticPairs: readonly ExclusionPair[];
	/** Parent → child links across the household. */
	parentEdges: readonly ExclusionParentEdge[];
	/** Who the kinship engine already names as the subject's sibling. */
	derivedSiblingIds: readonly string[];
}

/** The claim being weighed: this type, read this way round, between these two. */
export interface ExclusionQuery {
	/** Whose profile the claim is made from; `side` is read from their perspective. */
	subjectId: string;
	targetId: string;
	type: { key: string; category: RelationshipCategory };
	side: RelationshipSide;
	/** A link being retyped is not measured against itself. */
	exceptId?: string | null;
}

/** Why the claim is refused, and what makes that reason concrete. */
export interface Exclusion {
	reason: ExclusionReason;
	/** Whoever the reason is about — the existing partner, the child who has two parents. */
	personId: string;
	/**
	 * The link standing in the way, where there is one: `alreadyRomantic` refuses *because of*
	 * a particular row, and saying which one is the difference between "these two are already
	 * connected" and a sentence that reads as a claim about the entry being greyed out.
	 */
	tie?: TieReference;
}

const joins = (pair: ExclusionPair, x: string, y: string) =>
	(pair.a === x && pair.b === y) || (pair.a === y && pair.b === x);

/** Whoever this person's romantic tie is with, ignoring the one being asked about. */
function romanticPartnerOf(
	facts: ExclusionFacts,
	personId: string,
	besides: string
): string | null {
	for (const pair of facts.romanticPairs) {
		if (pair.a === personId && pair.b !== besides) return pair.b;
		if (pair.b === personId && pair.a !== besides) return pair.a;
	}
	return null;
}

/** The pair's own child end, for a parent link read from `side`. */
const childOf = (query: ExclusionQuery) =>
	query.side === 'reverse' ? query.subjectId : query.targetId;

/**
 * Why this type may not be stored between these two, or null when it may. The reasons are
 * weighed in the order a household can act on them: what is wrong with *this pair* first,
 * because correcting the link that is already there is the way out, and only then what the
 * two people are committed to elsewhere.
 */
export function exclusionFor(facts: ExclusionFacts, query: ExclusionQuery): Exclusion | null {
	const { subjectId, targetId, type, exceptId } = query;

	if (EXCLUSIVE_CATEGORIES.includes(type.category)) {
		const band = facts.subjectTies.find(
			(tie) =>
				tie.otherContactId === targetId &&
				tie.relationshipId !== exceptId &&
				EXCLUSIVE_CATEGORIES.includes(tie.category)
		);
		if (band) {
			return {
				reason: 'alreadyRomantic',
				personId: targetId,
				tie: { typeKey: band.typeKey, side: band.side, label: band.label }
			};
		}
	}

	if (type.key === SIBLING_TYPE_KEY && facts.derivedSiblingIds.includes(targetId)) {
		return { reason: 'siblingDerived', personId: targetId };
	}

	if (PARTNER_TYPE_KEYS.includes(type.key)) {
		const taken =
			romanticPartnerOf(facts, subjectId, targetId) ??
			romanticPartnerOf(facts, targetId, subjectId);
		if (taken) return { reason: 'romanticTaken', personId: taken };
	}

	if (type.key === PARENT_CHILD_TYPE_KEY) {
		const child = childOf(query);
		// The pair being asked about is left out: flipping or re-stating this very link must
		// not read as one more parent arriving.
		const parents = facts.parentEdges.filter(
			(edge) => edge.childId === child && !joins({ a: edge.parentId, b: edge.childId }, subjectId, targetId)
		);
		if (parents.length >= MAX_PARENTS) return { reason: 'parentsComplete', personId: child };
	}

	return null;
}

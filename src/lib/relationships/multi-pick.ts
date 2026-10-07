import { likelyCoParent } from '../suggestions/rules/links';
import { MAX_PARENTS, type ExclusionFacts } from './exclusions';
import { sinceDateFromBirth, type BirthDated, type KinChoice } from './since';
import { PARENT_CHILD_TYPE_KEY, PARTNER_TYPE_KEYS } from './type-keys';
import type { RelationshipSide } from './type-options';

/*
 * The relationship form with several people picked (docs/02 §2.4, *Several people in one
 * go*). The type decides how many people
 * the field takes; a person the household's records rule out is marked on their own chip
 * rather than skipped; and the since day is worked out for each pair.
 *
 * Pure: the form hands in what it holds and gets back what to show. The guardrails themselves
 * stay in `exclusions.ts` and in the use-case — this only spreads their answers over the chips.
 */

/** The picker entry as far as the cap cares: which type, read from which side. */
export interface CapChoice {
	type: { key: string };
	side: RelationshipSide;
}

/** A partnership is between two: one person, whichever of the words is chosen. */
const PARTNERS_AT_ONCE = 1;

/**
 * How many people the field takes for `choice`, or null for no limit. "Child of" makes
 * the picked people the viewed person's parents, so only the free parent slots are on offer;
 * "Parent of" caps each child on their own, which the per-person exclusion already says.
 */
export function pickCap(choice: CapChoice | null, parentsAlreadyOnRecord: number): number | null {
	if (!choice) return null;
	if (PARTNER_TYPE_KEYS.includes(choice.type.key)) return PARTNERS_AT_ONCE;
	if (choice.type.key === PARENT_CHILD_TYPE_KEY && choice.side === 'reverse') {
		return Math.max(0, MAX_PARENTS - parentsAlreadyOnRecord);
	}
	return null;
}

/** How many parents the household recorded for `childId`, as far as the viewer can see. */
export function parentsOnRecord(
	facts: Pick<ExclusionFacts, 'parentEdges'>,
	childId: string
): number {
	return facts.parentEdges.filter((edge) => edge.childId === childId).length;
}

/**
 * Where the picked count stands against the cap: `full` closes the field to more picks,
 * `excess` counts the people a narrower type no longer takes — they stay on screen and keep
 * Add off until someone removes them, because nothing is dropped silently.
 */
export function capState(
	cap: number | null,
	pickedCount: number
): { full: boolean; excess: number } {
	if (cap === null) return { full: false, excess: 0 };
	return { full: pickedCount >= cap, excess: Math.max(0, pickedCount - cap) };
}

/** A refused save's answer for one person, as the action and the outbox both carry it. */
export interface ServerRefusal {
	targetId: string;
	reason: string;
}

/** Why one picked person cannot be linked this way: a rule the form knows, or the save's word. */
export type ChipRefusal<E> =
	{ targetId: string; exclusion: E } | { targetId: string; reason: string };

/**
 * Every picked person who cannot be linked with the chosen type, in the order they were
 * picked. What the household's records rule out *now* comes first; a refusal an earlier
 * save brought back counts only while its person is still picked and nothing newer explains
 * it — the household's records may have moved on since.
 */
export function chipRefusals<E>(
	pickedIds: readonly string[],
	exclusionOf: (targetId: string) => E | null,
	serverRefusals: readonly ServerRefusal[]
): ChipRefusal<E>[] {
	return pickedIds.flatMap((targetId): ChipRefusal<E>[] => {
		const exclusion = exclusionOf(targetId);
		if (exclusion) return [{ targetId, exclusion }];
		const told = serverRefusals.find((refusal) => refusal.targetId === targetId);
		return told ? [{ targetId, reason: told.reason }] : [];
	});
}

/**
 * Whether a type entry is greyed out: only when it is refused for **everyone** picked, and
 * then with the first person's reason. While anyone could take it, it stays pickable and the
 * refused people are marked on their chips instead. With one person this is the single
 * form's behaviour exactly.
 */
export function exclusionForEveryone<E>(
	pickedIds: readonly string[],
	exclusionOf: (targetId: string) => E | null
): E | null {
	let first: E | null = null;
	for (const targetId of pickedIds) {
		const exclusion = exclusionOf(targetId);
		if (!exclusion) return null;
		first ??= exclusion;
	}
	return first;
}

/** The since day suggested for one pair; `''` when there is nothing to suggest. */
export interface PairSince {
	targetId: string;
	sinceDate: string;
}

/** The since day for each picked person, from the birthday rule. */
export function sincePerPair(
	choice: KinChoice | null,
	self: BirthDated,
	targets: readonly (BirthDated & { id: string })[]
): PairSince[] {
	return targets.map((target) => ({
		targetId: target.id,
		sinceDate: choice ? sinceDateFromBirth(choice, self, target) : ''
	}));
}

/**
 * The one day every pair gets — both parents of one child begin on the child's birthday — so
 * the form shows a single field as it always has; null when the days differ and each pair
 * keeps its own.
 */
export function sharedSince(pairs: readonly PairSince[]): string | null {
	const days = new Set(pairs.map((pair) => pair.sinceDate));
	if (days.size > 1) return null;
	return pairs[0]?.sinceDate ?? '';
}

/** Where *Use one date for all* starts: the first day any pair was given, or blank. */
export function oneDateForAll(pairs: readonly PairSince[]): string {
	return pairs.find((pair) => pair.sinceDate !== '')?.sinceDate ?? '';
}

/** The second parent the form offers: who was picked, and whose partner is offered. */
export interface SecondParentOffer {
	parentId: string;
	partnerId: string;
}

/**
 * The likely second parent to offer under the field, or null. Only for "Child of" with
 * exactly one parent picked and not refused; who that is, and whether a slot is free, is rule
 * L3's to say (`likelyCoParent`). `canOffer` is the field's own word: someone the picker could
 * take — visible, and not ruled out by the exclusion rules. Offered, never picked: the
 * household taps it or not (owner's decision, 2 October 2026).
 */
export function secondParentOffer(input: {
	choice: CapChoice | null;
	pickedIds: readonly string[];
	child: BirthDated & { id: string };
	facts: Pick<ExclusionFacts, 'parentEdges' | 'romanticPairs'>;
	isRefused: (targetId: string) => boolean;
	canOffer: (personId: string) => boolean;
}): SecondParentOffer | null {
	const { choice, pickedIds, child, facts } = input;
	if (choice?.type.key !== PARENT_CHILD_TYPE_KEY || choice.side !== 'reverse') return null;
	if (pickedIds.length !== 1) return null;
	const [parentId] = pickedIds as [string];
	if (input.isRefused(parentId)) return null;
	const partnerId = likelyCoParent(
		{ people: [child], parentEdges: facts.parentEdges, partnerEdges: facts.romanticPairs },
		parentId,
		child.id
	);
	return partnerId && input.canOffer(partnerId) ? { parentId, partnerId } : null;
}

/*
 * The arrange screen's decisions, pure (docs/02 §2.4.2, ADR-127): what a drop on a card would do,
 * what a drag carries, and what to say afterwards. The server decides again from its own
 * reading; this only keeps the screen from offering what would be refused.
 */

/** What the screen can do with the people it drags or picks. */
export const ARRANGE_MODES = ['move', 'copy'] as const;

/** Move takes the people out of where they were; copy leaves them there too. */
export type ArrangeMode = (typeof ARRANGE_MODES)[number];

/** One person in one card. */
export interface ArrangePickRef {
	circleId: string;
	contactId: string;
}

/** A card as the screen knows it: a circle and the people directly in it. */
export interface ArrangeCardRef {
	circleId: string;
	name: string;
	contactIds: readonly string[];
}

/** What a drop (or *Move here*) on a card would do. */
export type ArrangeVerdict =
	{ ok: true; count: number } | { ok: false; reason: 'alreadyHere' | 'alreadyAllHere' };

/** Separates the circle from the person in a pick's key; ids never contain it. */
const KEY_SEPARATOR = '\u0000';

/** A stable key of a pick, for sets and element ids. */
export function pickKey(pick: ArrangePickRef): string {
	return `${pick.circleId}${KEY_SEPARATOR}${pick.contactId}`;
}

/** The pick with `pick` added, or taken out when it was in. */
export function togglePick(
	picks: readonly ArrangePickRef[],
	pick: ArrangePickRef
): ArrangePickRef[] {
	const key = pickKey(pick);
	return picks.some((p) => pickKey(p) === key)
		? picks.filter((p) => pickKey(p) !== key)
		: [...picks, pick];
}

/** What a drag of `dragged` carries: the whole selection when it is part of it, else the one. */
export function dragCarries(
	selection: readonly ArrangePickRef[],
	dragged: ArrangePickRef
): ArrangePickRef[] {
	const key = pickKey(dragged);
	return selection.some((p) => pickKey(p) === key) ? [...selection] : [dragged];
}

/** The mode of one drop: Alt flips whatever the toggle says. */
export function effectiveMode(mode: ArrangeMode, altKey: boolean): ArrangeMode {
	if (!altKey) return mode;
	return mode === 'move' ? 'copy' : 'move';
}

/**
 * Whether `picks` can go to `targetId`, and how many people it would be. A person picked from
 * the target itself is no change; a copy needs someone not in the target yet; a move of someone
 * already there still takes them out of the old place.
 */
export function verdictFor(
	cards: readonly ArrangeCardRef[],
	picks: readonly ArrangePickRef[],
	targetId: string,
	mode: ArrangeMode
): ArrangeVerdict {
	const inTarget = new Set(cards.find((c) => c.circleId === targetId)?.contactIds ?? []);
	const everyone = new Set(picks.map((p) => p.contactId));
	const people = new Set(picks.filter((p) => p.circleId !== targetId).map((p) => p.contactId));
	const fresh = [...people].filter((id) => !inTarget.has(id));
	const none = mode === 'copy' ? fresh.length === 0 : people.size === 0;
	if (none) return { ok: false, reason: everyone.size > 1 ? 'alreadyAllHere' : 'alreadyHere' };
	return { ok: true, count: people.size };
}

/** The names of the other cards that hold `contactId`, in the cards' order. */
export function alsoIn(
	cards: readonly ArrangeCardRef[],
	contactId: string,
	circleId: string
): string[] {
	return cards
		.filter((c) => c.circleId !== circleId && c.contactIds.includes(contactId))
		.map((c) => c.name);
}

/** What the toast after an arrangement says; the screen fills in the words. */
export type ArrangeToast =
	| { kind: 'done'; mode: ArrangeMode; count: number; alreadyThere: number }
	| { kind: 'onlyRemoved'; count: number };

/** Chooses the toast: a move that added nobody only took people out of their old place. */
export function toastFor(result: {
	mode: ArrangeMode;
	addedCount: number;
	alreadyThereCount: number;
}): ArrangeToast {
	if (result.mode === 'move' && result.addedCount === 0) {
		return { kind: 'onlyRemoved', count: result.alreadyThereCount };
	}
	return {
		kind: 'done',
		mode: result.mode,
		count: result.addedCount,
		alreadyThere: result.alreadyThereCount
	};
}

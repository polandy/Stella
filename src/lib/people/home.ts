import type { LinkedSentence, PersonRef } from '$lib/i18n/linked';
import type { RelationshipCategory } from '$lib/relationships/categories';
import type { RelationshipStatus } from '$lib/relationships/status';
import { removalKey } from '$lib/undo/keys';

/*
 * A shared home as the person page shows and edits it (docs/02 §2.2, *A shared home*): whom
 * someone lives with, which of their addresses can be shared, and whom sharing offers first.
 */

/** One of the people someone lives with, as the page reads them. */
export interface Housemate {
	id: string;
	displayName: string;
}

/**
 * *lives with Anna and Peter Brunner*, every name a way to that person. However many there
 * are, the language joins them (`list`) and places the joined names in its sentence (`say`).
 */
export function livesWithSentence(
	housemates: readonly Housemate[],
	list: (names: string[]) => string,
	say: (names: string) => string
): LinkedSentence {
	const people: Record<string, PersonRef> = {};
	housemates.forEach((mate, index) => {
		people[`p${index}`] = { id: mate.id, name: mate.displayName };
	});
	return {
		people,
		say: (names) => say(list(Object.keys(people).map((slot) => names[slot]!)))
	};
}

/** The key of someone moving out of a home, held while its undo window is open. */
export const movingOutKey = (homeId: string, contactId: string): string =>
	removalKey('home-member', `${homeId}/${contactId}`);

/**
 * The homes as they read right now: one this person is moving out of is gone, and so is a
 * housemate moving out, while the undo window is open (docs/02 §2.23).
 */
export function homesShown<H extends { id: string; livesWith: readonly Housemate[] }>(
	homes: readonly H[],
	contactId: string,
	isPending: (key: string) => boolean
): H[] {
	return homes
		.filter((home) => !isPending(movingOutKey(home.id, contactId)))
		.map((home) => ({
			...home,
			livesWith: home.livesWith.filter((mate) => !isPending(movingOutKey(home.id, mate.id)))
		}));
}

/** An address of several lines as one, the way the card reads it. */
export function oneLine(value: string): string {
	return value
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.join(', ');
}

/** The categories of tie whose people most often live together: family and partners. */
const LIVES_TOGETHER: readonly RelationshipCategory[] = ['family', 'romantic'];

/**
 * Whom *Share with …* offers, the person's current family and partners first and everyone
 * else after, never the person themselves or anyone who already lives there.
 */
export function sharingCandidates<P extends { id: string }>(
	people: readonly P[],
	ties: readonly {
		otherContactId: string;
		category: RelationshipCategory;
		status: RelationshipStatus;
	}[],
	exclude: readonly string[]
): P[] {
	const left = new Set(exclude);
	const close = new Set(
		ties
			.filter((tie) => tie.status === 'current' && LIVES_TOGETHER.includes(tie.category))
			.map((tie) => tie.otherContactId)
	);
	const offered = people.filter((person) => !left.has(person.id));
	return [
		...offered.filter((person) => close.has(person.id)),
		...offered.filter((person) => !close.has(person.id))
	];
}

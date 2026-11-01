/*
 * Who a share is offered to before anything is typed (docs/02 §2.18.3): the people last opened
 * on this device, then whoever the household last touched. Pure; the device's list is kept by
 * `recent.svelte.ts`, the last touches come from the server.
 */

/** How many people the share sheet shows before a search. */
export const RECENT_OFFERED = 8;

/** When a person was last written about, as `listLastTouchedVisibleTo` answers. */
export interface LastTouch {
	contactId: string;
	/** Null when nothing was ever written about them. */
	lastTouchedOn: string | null;
}

/** The people to offer, from those the viewer may see. */
export function peopleToOffer<T extends { id: string }>(
	people: readonly T[],
	openedHere: readonly string[],
	lastTouched: readonly LastTouch[]
): T[] {
	const byId = new Map(people.map((p) => [p.id, p]));
	const touchedNewestFirst = lastTouched
		.filter(
			(touch): touch is { contactId: string; lastTouchedOn: string } => touch.lastTouchedOn !== null
		)
		.sort((a, b) => b.lastTouchedOn.localeCompare(a.lastTouchedOn))
		.map((touch) => touch.contactId);
	const order = [...openedHere, ...touchedNewestFirst, ...people.map((p) => p.id)];
	const offered = new Map<string, T>();
	for (const id of order) {
		if (offered.size === RECENT_OFFERED) break;
		const person = byId.get(id);
		if (person && !offered.has(id)) offered.set(id, person);
	}
	return [...offered.values()];
}

/** The device's list after `id` was opened: it at the front, once, the oldest let go. */
export function noteViewed(openedHere: readonly string[], id: string): string[] {
	return [id, ...openedHere.filter((other) => other !== id)].slice(0, RECENT_OFFERED);
}

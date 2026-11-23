/*
 * Who gives a gift, as a row shows it (docs/dev/02 §2.25.12). Pure, so the person page and the
 * household's list of ideas say it the same way; an unseen giver's id never leaves the server.
 */

/** One giver of several, as a viewer may know them. */
export type SingleGiverView =
	| { kind: 'person'; contactId: string; name: string }
	/** Someone the viewer may not see: the gift is *vergeben*, nameless. */
	| { kind: 'unseen' }
	| { kind: 'household' }
	/** A giver whose record was deleted, by the name they left. */
	| { kind: 'left'; name: string };

/** The giver a viewer may know of. */
export type GiverView =
	| SingleGiverView
	/** Several giving together, the household among them or not (§2.25.12). */
	| { kind: 'several'; givers: SingleGiverView[] }
	/** Nobody named: *us*, as before givers. */
	| { kind: 'none' };

/** A giver beside the first: the record's id and name where it lives, the name it left where gone. */
export interface StoredCoGiver {
	contactId: string | null;
	name: string | null;
	leftName: string | null;
}

/** What a gift stores of its giver, with the name the viewer may read. */
export interface StoredGiverFields {
	giverContactId: string | null;
	giverIsHousehold: boolean;
	giverLeftName: string | null;
	giverName: string | null;
	/** The givers beside the first, in the order they were named. */
	coGivers: StoredCoGiver[];
}

function firstGiverOf(gift: StoredGiverFields): SingleGiverView | null {
	if (gift.giverContactId !== null) {
		return gift.giverName === null
			? { kind: 'unseen' }
			: { kind: 'person', contactId: gift.giverContactId, name: gift.giverName };
	}
	if (gift.giverIsHousehold) return { kind: 'household' };
	if (gift.giverLeftName !== null) return { kind: 'left', name: gift.giverLeftName };
	return null;
}

function coGiverOf(co: StoredCoGiver): SingleGiverView {
	if (co.contactId === null) return { kind: 'left', name: co.leftName ?? '' };
	return co.name === null
		? { kind: 'unseen' }
		: { kind: 'person', contactId: co.contactId, name: co.name };
}

/** The giver as `gift`'s viewer may know them. */
export function giverViewOf(gift: StoredGiverFields): GiverView {
	const first = firstGiverOf(gift);
	if (gift.coGivers.length === 0) return first ?? { kind: 'none' };
	const rest = gift.coGivers.map(coGiverOf);
	return { kind: 'several', givers: first === null ? rest : [first, ...rest] };
}

/** Whether somebody — not just *us* by default — has taken it on. */
export const isAssigned = (giver: GiverView): boolean => giver.kind !== 'none';

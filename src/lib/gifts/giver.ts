/*
 * Who gives a gift, as a row shows it (docs/dev/02 §2.25.12). Pure, so the person page and the
 * household's list of ideas say it the same way; an unseen giver's id never leaves the server.
 */

/** The giver a viewer may know of. */
export type GiverView =
	| { kind: 'person'; contactId: string; name: string }
	/** Someone the viewer may not see: the gift is *vergeben*, nameless. */
	| { kind: 'unseen' }
	| { kind: 'household' }
	/** A giver whose record was deleted, by the name they left. */
	| { kind: 'left'; name: string }
	/** Nobody named: *us*, as before givers. */
	| { kind: 'none' };

/** What a gift stores of its giver, with the name the viewer may read. */
export interface StoredGiverFields {
	giverContactId: string | null;
	giverIsHousehold: boolean;
	giverLeftName: string | null;
	giverName: string | null;
}

/** The giver as `gift`'s viewer may know them. */
export function giverViewOf(gift: StoredGiverFields): GiverView {
	if (gift.giverContactId !== null) {
		return gift.giverName === null
			? { kind: 'unseen' }
			: { kind: 'person', contactId: gift.giverContactId, name: gift.giverName };
	}
	if (gift.giverIsHousehold) return { kind: 'household' };
	if (gift.giverLeftName !== null) return { kind: 'left', name: gift.giverLeftName };
	return { kind: 'none' };
}

/** Whether somebody — not just *us* by default — has taken it on. */
export const isAssigned = (giver: GiverView): boolean => giver.kind !== 'none';

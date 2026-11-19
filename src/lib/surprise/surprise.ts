/*
 * A shared record kept from the member whose own person it is about — a surprise (docs/dev/02
 * §2.25.10, §2.27). Gifts and outings offer the same three-way choice; each stores it under its own
 * column name.
 */

/** The form's third choice beside *shared* and *private*: *Everyone but them*. */
export const SURPRISE = 'surprise';

/** The form's choice read: only a shared record can be kept from its person. */
export function surpriseFromForm(chosen: string | null): {
	visibility: 'shared' | 'private';
	keptFromPerson: boolean;
} {
	if (chosen === 'private') return { visibility: 'private', keptFromPerson: false };
	return { visibility: 'shared', keptFromPerson: chosen === SURPRISE };
}

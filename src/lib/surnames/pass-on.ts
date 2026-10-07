import { foldSurname } from '$lib/suggestions/rules/surnames';

/*
 * Passing a last name on (docs/02 §2.2.4.5), on the screen's side: the page is
 * handed, for each person, their children and siblings who have no last name, and this decides
 * whom the toast offers the name to after a save. One generation at a time — the offer's own
 * *Yes* is a save, whose toast offers the next — and only ever a blank: whoever had a name
 * before the save is never in `freshIds`.
 */

/** A relative with no last name yet, and the names the household declined for them, folded. */
export interface NamelessKin {
	id: string;
	name: string;
	declined: readonly string[];
}

/** For each person the viewer may see: their children and siblings without a last name. */
export type PassOnMap = Readonly<Record<string, readonly NamelessKin[]>>;

export function passOnOffer(
	map: PassOnMap,
	freshIds: readonly string[],
	lastName: string,
	namedThisVisit: ReadonlySet<string>
): { id: string; name: string }[] {
	const batch = new Set(freshIds);
	const folded = foldSurname(lastName);
	const offered = new Map<string, string>();
	for (const id of freshIds) {
		for (const kin of map[id] ?? []) {
			if (batch.has(kin.id) || namedThisVisit.has(kin.id) || kin.declined.includes(folded))
				continue;
			offered.set(kin.id, kin.name);
		}
	}
	return [...offered].map(([id, name]) => ({ id, name }));
}

import type { Locale } from '../i18n/locales';
import { withNameParts, type StoredName } from '../people/display-name';

/*
 * Last names given but not written yet (docs/02 §2.2.4.4). A batch waits out its undo window
 * before it is sent, and the page reloads only after that; until then every list and search
 * would still read the old name, so *Brunner* typed into a search right after giving it found
 * nobody. The shell keeps one `Given` for the whole app, and a list reads its people through
 * `withGivenNames` — by the same rule the server applies on save, so the name does not change
 * a second time when the reload lands.
 */

interface GivenBatch {
	ids: readonly string[];
	lastName: string;
}

/** The batches given and not yet reloaded, by the key they are held under. */
export type Given = Readonly<Record<string, GivenBatch>>;

/** A batch was handed to the undo window: its people carry `lastName` from now on. */
export function give(given: Given, key: string, ids: readonly string[], lastName: string): Given {
	return { ...given, [key]: { ids, lastName } };
}

/** The batch was taken back, failed, or is in the reloaded data: the lists read the data again. */
export function release(given: Given, key: string): Given {
	if (!(key in given)) return given;
	const rest = { ...given };
	delete rest[key];
	return rest;
}

/** The last name each person was given, a later batch winning over an earlier one. */
export function namesGiven(given: Given): ReadonlyMap<string, string> {
	return new Map(
		Object.values(given).flatMap((batch) => batch.ids.map((id) => [id, batch.lastName] as const))
	);
}

/**
 * `people` as they read with the names given: the last name, and the shown name made again
 * where the parts made it. The very list comes back when nothing is given, since the shell
 * tells a reloaded list from a kept one by identity (`$lib/sync/people-freshness`).
 */
export function withGivenNames<T extends StoredName & { id: string }>(
	people: T[],
	names: ReadonlyMap<string, string>,
	locale: Locale
): T[] {
	if (names.size === 0) return people;
	return people.map((person) => {
		const lastName = names.get(person.id);
		return lastName === undefined
			? person
			: { ...person, ...withNameParts(person, { lastName }, locale) };
	});
}

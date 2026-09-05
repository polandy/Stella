/*
 * The People directory (docs/02 §2.2): who goes under which letter, and who a typed query
 * finds. Pure and client-safe — the page filters as you type without a round trip, so the
 * rule has to live where both the server render and the browser can run it.
 */

/** What the directory files and finds a person by. */
export interface DirectoryPerson {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	description: string | null;
}

/** The people under one letter heading. */
export interface LetterGroup<T extends DirectoryPerson> {
	/** `A`–`Z`, or `#` for names that start with anything else. */
	letter: string;
	people: T[];
}

/** The group for names that start with a digit or a symbol. Sorted last. */
export const OTHER_LETTER = '#';

/** Lower-case with accents stripped, so `Émile` files under E and `emile` finds it. */
function fold(value: string): string {
	return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** What a person sorts and files by: the surname, then the rest of the name. */
function sortKey(person: DirectoryPerson): string {
	const surname = person.lastName?.trim();
	const rest = person.firstName?.trim() || person.displayName;
	return fold(surname ? `${surname} ${rest}` : person.displayName);
}

function letterOf(key: string): string {
	const first = key[0] ?? '';
	return /[a-z]/.test(first) ? first.toUpperCase() : OTHER_LETTER;
}

/** People under their letter, surname first, with `#` at the end. */
export function groupByLetter<T extends DirectoryPerson>(people: T[]): LetterGroup<T>[] {
	const keyed = people
		.map((person) => ({ person, key: sortKey(person) }))
		.sort((a, b) => a.key.localeCompare(b.key));

	const groups: LetterGroup<T>[] = [];
	for (const { person, key } of keyed) {
		const letter = letterOf(key);
		const last = groups.at(-1);
		if (last && last.letter === letter) last.people.push(person);
		else groups.push({ letter, people: [person] });
	}
	return groups.sort((a, b) =>
		a.letter === OTHER_LETTER ? 1 : b.letter === OTHER_LETTER ? -1 : a.letter.localeCompare(b.letter)
	);
}

/** Whether a typed query finds this person, by any name they go by or how they are described. */
export function matchesQuery(person: DirectoryPerson, query: string): boolean {
	const needle = fold(query.trim());
	if (needle === '') return true;
	const haystack = fold(
		[person.displayName, person.firstName, person.lastName, person.nickname, person.description]
			.filter((part): part is string => typeof part === 'string')
			.join(' ')
	);
	return haystack.includes(needle);
}

/** Whether one of the names the person goes by starts with the query — the stronger match. */
export function startsWithQuery(person: DirectoryPerson, query: string): boolean {
	const needle = fold(query.trim());
	if (needle === '') return false;
	return [person.displayName, person.firstName, person.lastName, person.nickname]
		.filter((part): part is string => typeof part === 'string')
		.some((part) => fold(part).startsWith(needle));
}

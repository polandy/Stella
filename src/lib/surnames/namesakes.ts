/*
 * After last names are given (docs/concepts/surnames.md §5): who now shares first and last name
 * with someone else the viewer can see, so the confirmation can ask *the same person?* and lead
 * to the merge. Pure, over the people the shell already holds; nothing merges on its own.
 */

interface Named {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
}

/** One new name that someone else already carries. */
export interface NamesakeAfterNaming {
	id: string;
	/** The name the person will have. */
	name: string;
	otherId: string;
	otherName: string;
}

const fold = (value: string) =>
	value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The first name, or — as the write itself does (`withNameParts`) — the shown name when it is
 * a single word. A multi-word shown name with no parts is left blank here too: the write never
 * guesses a first name out of it, so neither does the namesake check.
 */
const firstOf = (person: Named) => {
	const first = (person.firstName ?? '').trim();
	if (first) return first;
	const words = person.displayName.trim().split(/\s+/).filter(Boolean);
	return words.length === 1 ? words[0]! : '';
};

export function namesakesAfterNaming(
	people: readonly Named[],
	namedIds: readonly string[],
	lastName: string
): NamesakeAfterNaming[] {
	const named = new Set(namedIds);
	const last = fold(lastName);
	const others = people.filter((p) => !named.has(p.id) && fold(p.lastName ?? '') === last);
	return people
		.filter((p) => named.has(p.id))
		.flatMap((p) => {
			const first = firstOf(p);
			// No first name is not a shared first name: without one, there is nothing to match on.
			if (!first) return [];
			const other = others.find((o) => fold(firstOf(o)) === fold(first));
			return other ? [{ id: p.id, name: `${first} ${lastName.trim()}`, otherId: other.id, otherName: other.displayName }] : [];
		});
}

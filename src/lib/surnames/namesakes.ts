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

/** The first name, or — as the write itself does — the first word of the shown name. */
const firstOf = (person: Named) => (person.firstName ?? '').trim() || person.displayName.trim().split(/\s+/)[0] || '';

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
			const other = others.find((o) => fold(firstOf(o)) === fold(first));
			return other ? [{ id: p.id, name: `${first} ${lastName.trim()}`, otherId: other.id, otherName: other.displayName }] : [];
		});
}

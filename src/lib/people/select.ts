/*
 * Filtering a person list by a typed query, for any picker where someone chooses a person by
 * name rather than scrolling a full list (docs/02 — search wherever a person is selected).
 */
import { matchesQuery, startsWithQuery, type DirectoryPerson } from './directory';

/** The person fields a search picker needs — the same shape the directory already filters on. */
export interface SelectablePerson extends DirectoryPerson {
	/**
	 * The stored birth date (docs/03 §3.4). Carried only by the pickers whose form reads
	 * something off it — the relationship form dates a family link from it (docs/02 §2.4).
	 */
	birthDate?: string | null;
}

/** People matching `query`, best name-match first. Empty query returns everyone, unsorted. */
export function filterPeople<T extends SelectablePerson>(query: string, people: T[]): T[] {
	const q = query.trim();
	if (q === '') return people;
	return people
		.filter((p) => matchesQuery(p, q))
		.sort((a, b) => Number(startsWithQuery(b, q)) - Number(startsWithQuery(a, q)));
}

/**
 * Whether a picker's text box should still carry `required`. The box is empty once a person is
 * held as a chip rather than typed, so leaving the constraint on it would refuse to submit a
 * form that is filled in — the pick itself is what the field is asking for.
 */
export function stillNeedsAPick(required: boolean, selectedCount: number): boolean {
	return required && selectedCount === 0;
}

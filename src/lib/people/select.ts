/*
 * Filtering a person list by a typed query, for any picker where someone chooses a person by
 * name rather than scrolling a full list (docs/02 — search wherever a person is selected).
 */
import { matchesQuery, startsWithQuery, type DirectoryPerson } from './directory';

/** The person fields a search picker needs — the same shape the directory already filters on. */
export type SelectablePerson = DirectoryPerson;

/** People matching `query`, best name-match first. Empty query returns everyone, unsorted. */
export function filterPeople<T extends SelectablePerson>(query: string, people: T[]): T[] {
	const q = query.trim();
	if (q === '') return people;
	return people
		.filter((p) => matchesQuery(p, q))
		.sort((a, b) => Number(startsWithQuery(b, q)) - Number(startsWithQuery(a, q)));
}

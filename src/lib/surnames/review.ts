import {
	buildSurnameView,
	proposeSurname,
	type SurnameFacts,
	type SurnamePerson
} from '$lib/suggestions/rules/surnames';
import {
	groupBySurname,
	householdSpellings,
	type SurnameList
} from '$lib/suggestions/surname-groups';

/*
 * Who the *Last names* list asks about (docs/02 §2.2.4.2). A declined name drops only that
 * proposal — the person stays, under their next name or with a field — and a person the
 * household settled as having **no last name** leaves the list for its drawer, where *Ask
 * again* puts them back. Pure: the facts are what one viewer may see.
 */

/** A person as the review reads them. */
export interface ReviewPerson extends SurnamePerson {
	/** Archived people are sources (a grandmother's name) but are not asked about. */
	archived: boolean;
	/** When the household said they have no last name; null while nobody has. */
	withoutLastNameAt: number | null;
}

export interface LastNamesReviewList {
	list: SurnameList;
	/** The settled people's ids, the most recently settled first. */
	settled: string[];
}

const hasNoLastName = (p: Pick<ReviewPerson, 'lastName'>) => !(p.lastName ?? '').trim();

/** Asked about: no last name, not archived, and not settled as having none. */
export function awaitsLastName(
	p: Pick<ReviewPerson, 'lastName' | 'archived' | 'withoutLastNameAt'>
): boolean {
	return hasNoLastName(p) && !p.archived && p.withoutLastNameAt === null;
}

/** A mark only counts while there is still no last name, so a stale one is never shown. */
function isSettled(p: ReviewPerson): boolean {
	return hasNoLastName(p) && !p.archived && p.withoutLastNameAt !== null;
}

/** A write that gives a person a last name ends *no last name*; an empty one keeps it. */
export function clearsNoLastName(lastName: string | null): boolean {
	return (lastName ?? '').trim() !== '';
}

/** The list, grouped by what Stella proposes, and the drawer of settled people. */
export function reviewList(
	facts: SurnameFacts & { people: readonly ReviewPerson[] }
): LastNamesReviewList {
	const view = buildSurnameView(facts);
	const listed = facts.people
		.filter(awaitsLastName)
		.sort((a, b) => a.displayName.localeCompare(b.displayName));
	return {
		list: groupBySurname(
			listed.map((p) => ({ personId: p.id, proposal: proposeSurname(view, p.id) })),
			householdSpellings(facts.people.map((p) => p.lastName))
		),
		settled: facts.people
			.filter(isSettled)
			.sort(
				(a, b) =>
					b.withoutLastNameAt! - a.withoutLastNameAt! || a.displayName.localeCompare(b.displayName)
			)
			.map((p) => p.id)
	};
}

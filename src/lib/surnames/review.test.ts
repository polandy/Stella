import { describe, expect, it } from 'bun:test';
import type { KinshipGraph } from '$lib/kinship/kinship';
import type { SurnameDismissal } from '$lib/suggestions/rules/surnames';
import { awaitsLastName, clearsNoLastName, reviewList, type ReviewPerson } from './review';

/*
 * Who the *Last names* list asks about (docs/02 §2.2.4.2): a declined name drops only that
 * proposal, and a person the household settled as having no last name leaves the list for its
 * drawer. Pure: the facts are what one viewer may see.
 */

const person = (
	id: string,
	first: string,
	last: string | null,
	extra: Partial<ReviewPerson> = {}
): ReviewPerson => ({
	id,
	displayName: last ? `${first} ${last}` : first,
	firstName: first,
	lastName: last,
	nickname: null,
	formerName: null,
	archived: false,
	withoutLastNameAt: null,
	...extra
});

const markus = person('markus', 'Markus', 'Brunner');
const thomas = person('thomas', 'Thomas', 'Widmer');

/** Sara: Brunner from her father (likely), Widmer from her partner (possible). Ben: Brunner only. */
function household(people: ReviewPerson[], dismissed: SurnameDismissal[] = []) {
	const graph: KinshipGraph = {
		people: people.map((p) => ({ id: p.id, displayName: p.displayName })),
		parentEdges: [
			{ parentId: 'markus', childId: 'sara' },
			{ parentId: 'markus', childId: 'ben' }
		],
		siblingEdges: [],
		partnerEdges: [{ a: 'thomas', b: 'sara' }],
		storedPairs: []
	};
	return reviewList({ people, graph, familyCircles: [], dismissed });
}

const listed = (review: ReturnType<typeof reviewList>) => ({
	groups: review.list.groups.map((g) => [g.name, g.rows.map((r) => r.personId)]),
	chooseOne: review.list.chooseOne.map((r) => r.personId),
	none: review.list.none
});

describe('reviewList — Not this name drops one proposal, never the person', () => {
	it('lists each person under the name proposed for them (control)', () => {
		const review = household([
			markus,
			thomas,
			person('sara', 'Sara', null),
			person('ben', 'Ben', null)
		]);
		expect(listed(review)).toEqual({
			groups: [['Brunner', ['ben', 'sara']]],
			chooseOne: [],
			none: []
		});
	});

	it('keeps a person whose one name was declined under their next one', () => {
		const review = household(
			[markus, thomas, person('sara', 'Sara', null), person('ben', 'Ben', null)],
			[{ contactId: 'sara', folded: 'brunner' }]
		);
		expect(listed(review)).toEqual({
			groups: [
				['Brunner', ['ben']],
				['Widmer', ['sara']]
			],
			chooseOne: [],
			none: []
		});
	});

	it('keeps a person whose only name was declined, under No suggestion', () => {
		const review = household(
			[markus, thomas, person('sara', 'Sara', null), person('ben', 'Ben', null)],
			[{ contactId: 'ben', folded: 'brunner' }]
		);
		expect(listed(review)).toEqual({
			groups: [['Brunner', ['sara']]],
			chooseOne: [],
			none: ['ben']
		});
	});
});

describe('reviewList — No last name settles a person', () => {
	it('lists someone without a last name and without a proposal, unmarked (control)', () => {
		const review = household([markus, person('jonas', 'Jonas', null)]);
		expect(review.list.none).toEqual(['jonas']);
		expect(review.settled).toEqual([]);
	});

	it('takes a settled person off the list and into the drawer', () => {
		const review = household([
			markus,
			person('jonas', 'Jonas', null, { withoutLastNameAt: 5 }),
			person('ben', 'Ben', null)
		]);
		expect(listed(review)).toEqual({ groups: [['Brunner', ['ben']]], chooseOne: [], none: [] });
		expect(review.settled).toEqual(['jonas']);
	});

	it('keeps a settled person off the list when a relative with a last name comes later', () => {
		const review = household([markus, person('ben', 'Ben', null, { withoutLastNameAt: 5 })]);
		expect(listed(review)).toEqual({ groups: [], chooseOne: [], none: [] });
		expect(review.settled).toEqual(['ben']);
	});

	it('orders the drawer newest first, then by name', () => {
		const review = household([
			person('jonas', 'Jonas', null, { withoutLastNameAt: 5 }),
			person('anna', 'Anna', null, { withoutLastNameAt: 9 }),
			person('rosli', 'Rösli', null, { withoutLastNameAt: 5 })
		]);
		expect(review.settled).toEqual(['anna', 'jonas', 'rosli']);
	});

	it('leaves an archived settled person out of the drawer, as out of the list', () => {
		const review = household([
			person('jonas', 'Jonas', null, { withoutLastNameAt: 5, archived: true })
		]);
		expect(review.settled).toEqual([]);
		expect(review.list.none).toEqual([]);
	});

	it('ignores a stale mark on someone who has a last name now', () => {
		const review = household([person('lea', 'Lea', 'Brunner', { withoutLastNameAt: 5 })]);
		expect(review.settled).toEqual([]);
		expect(review.list.none).toEqual([]);
	});
});

describe('awaitsLastName', () => {
	it('asks about a browsable person with no last name and no mark', () => {
		expect(awaitsLastName(person('jonas', 'Jonas', null))).toBe(true);
		expect(awaitsLastName(person('jonas', 'Jonas', '  '))).toBe(true);
	});

	it('does not ask about someone named, archived or settled', () => {
		expect(awaitsLastName(person('lea', 'Lea', 'Brunner'))).toBe(false);
		expect(awaitsLastName(person('jonas', 'Jonas', null, { archived: true }))).toBe(false);
		expect(awaitsLastName(person('jonas', 'Jonas', null, { withoutLastNameAt: 1 }))).toBe(false);
	});
});

describe('clearsNoLastName', () => {
	it('is cleared by a write that gives a last name', () => {
		expect(clearsNoLastName('Brunner')).toBe(true);
	});

	it('is kept by a write that leaves the last name empty', () => {
		expect(clearsNoLastName(null)).toBe(false);
		expect(clearsNoLastName('  ')).toBe(false);
	});
});

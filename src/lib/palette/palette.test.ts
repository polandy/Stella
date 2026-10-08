import { describe, expect, it } from 'bun:test';
import {
	paletteRows,
	personSearchRows,
	PALETTE_PEOPLE_LIMIT,
	type PaletteLabels,
	type PalettePerson
} from './palette';

/*
 * The command palette (docs/05 §5.4, docs/02 §2.22.1): what ⌘K offers for a given query.
 * Pure, so the order of rows — and the promise that an empty palette still leads to the
 * capture field — is stated here rather than in a component.
 */

function person(
	id: string,
	displayName: string,
	extra: Partial<PalettePerson> = {}
): PalettePerson {
	return {
		id,
		displayName,
		firstName: null,
		lastName: null,
		nickname: null,
		avatarPhotoId: null,
		...extra
	};
}

/** English wording, as a component in an English session would pass it. */
const labels: PaletteLabels = {
	write: 'Write a moment',
	giftIdea: 'Gift idea for …',
	addPerson: 'Add person',
	searchEverything: (query) => `Search everything for “${query}”`
};

const people = [
	person('lena', 'Lena Brunner', { lastName: 'Brunner' }),
	person('oma', 'Oma'),
	person('markus', 'Markus Lang')
];

describe('a person found by their former name', () => {
	it('says so on the row, and not when the shown name matched', () => {
		const franziska = person('franziska', 'Franziska Abab', {
			lastName: 'Abab',
			formerName: 'Widmer'
		});
		const rows = (q: string) =>
			personSearchRows(q, [franziska], labels.searchEverything).filter((r) => r.kind === 'person');

		expect(rows('widmer')).toMatchObject([{ id: 'franziska', formerly: 'Widmer' }]);
		expect(rows('abab')).toMatchObject([{ id: 'franziska', formerly: null }]);
	});
});

describe('a person found by their job (docs/02 §2.9)', () => {
	const anna = person('anna', 'Anna Meier', {
		lastName: 'Meier',
		jobTitle: 'Lab technician',
		company: 'Roche'
	});
	const rows = (q: string) =>
		personSearchRows(q, [anna], labels.searchEverything).filter((r) => r.kind === 'person');

	it('is found by the company, and the row says it was the job', () => {
		expect(rows('roche')).toMatchObject([{ id: 'anna', foundByJob: true }]);
	});

	it('does not say so when the name matched', () => {
		expect(rows('anna')).toMatchObject([{ id: 'anna', foundByJob: false }]);
	});

	it('carries the job for the row to show, or null when there is none', () => {
		expect(rows('anna')).toMatchObject([{ job: { jobTitle: 'Lab technician', company: 'Roche' } }]);
		const lena = person('lena', 'Lena Brunner');
		expect(personSearchRows('lena', [lena], labels.searchEverything)[0]).toMatchObject({
			job: null
		});
	});
});

describe('paletteRows', () => {
	it('leads with writing a moment on an empty query, so ⌘K then Enter is still the way to capture', () => {
		const rows = paletteRows('', people, labels);

		expect(rows[0]).toMatchObject({ kind: 'action', id: 'write', href: '/?compose' });
		expect(rows.filter((r) => r.kind === 'action').map((r) => r.id)).toEqual([
			'write',
			'add-person'
		]);
	});

	it('lists people on an empty query, so the palette doubles as a jump list', () => {
		const rows = paletteRows('', people, labels);

		expect(rows.filter((r) => r.kind === 'person')).toHaveLength(3);
	});

	it('narrows people to the query and keeps only the actions the query names', () => {
		const rows = paletteRows('len', people, labels);

		expect(rows.filter((r) => r.kind === 'person').map((r) => r.id)).toEqual(['lena']);
		expect(rows.filter((r) => r.kind === 'action')).toEqual([]);
	});

	it('ranks a name that starts with the query above one that merely contains it', () => {
		const rows = paletteRows(
			'le',
			[person('corinne', 'Corinne Keller', { lastName: 'Keller' }), ...people],
			labels
		);

		expect(rows.filter((r) => r.kind === 'person').map((r) => r.id)).toEqual(['lena', 'corinne']);
	});

	it('finds an action by what it does', () => {
		expect(
			paletteRows('add', people, labels)
				.filter((r) => r.kind === 'action')
				.map((r) => r.id)
		).toEqual(['add-person']);
		expect(
			paletteRows('moment', people, labels)
				.filter((r) => r.kind === 'action')
				.map((r) => r.id)
		).toEqual(['write']);
	});

	it('always ends a typed query with a way into full search, for notes the palette cannot see', () => {
		const rows = paletteRows('lake', people, labels);

		expect(rows.at(-1)).toMatchObject({ kind: 'search', href: '/search?q=lake' });
		expect(paletteRows('', people, labels).find((r) => r.kind === 'search')).toBeUndefined();
	});

	it('shows at most a handful of people, whatever the household size', () => {
		const many = Array.from({ length: 30 }, (_, i) => person(`p${i}`, `Person ${i}`));

		expect(paletteRows('', many, labels).filter((r) => r.kind === 'person')).toHaveLength(
			PALETTE_PEOPLE_LIMIT
		);
	});

	it('encodes the query into the search link rather than trusting it', () => {
		expect(paletteRows('a&b', people, labels).at(-1)).toMatchObject({ href: '/search?q=a%26b' });
	});

	it('offers the actions in the wording it was given, so a German session searches German', () => {
		const german: PaletteLabels = {
			write: 'Moment festhalten',
			giftIdea: 'Geschenkidee für …',
			addPerson: 'Person hinzufügen',
			searchEverything: (query) => `Überall nach „${query}“ suchen`
		};

		const rows = paletteRows('moment', people, german);

		expect(rows.filter((r) => r.kind === 'action').map((r) => r.label)).toEqual([
			'Moment festhalten'
		]);
		expect(paletteRows('lake', people, german).at(-1)?.label).toBe('Überall nach „lake“ suchen');
	});

	it('says which Thomas is which when the household has more than one', () => {
		const household = [
			person('hut', 'Thomas', { description: 'SAC hut, Aug 2026' }),
			person('gym', 'Thomas', { metPlace: 'Gym club', metDate: '2021-03-01' }),
			person('meier', 'Thomas Meier', { lastName: 'Meier', description: 'Neighbour' })
		];
		const rows = paletteRows('thom', household, labels).filter((r) => r.kind === 'person');

		expect(rows.find((r) => r.id === 'hut')).toMatchObject({
			distinction: { kind: 'description', text: 'SAC hut, Aug 2026' }
		});
		expect(rows.find((r) => r.id === 'gym')).toMatchObject({
			distinction: { kind: 'met', place: 'Gym club', year: '2021' }
		});
		expect(rows.find((r) => r.id === 'meier')).toMatchObject({ distinction: null });
	});
});

describe('a gift idea from the palette (docs/02 §2.25.2)', () => {
	it('sits next to writing a moment, and leads to a second step rather than a page', () => {
		const rows = paletteRows('', people, labels);

		expect(rows.slice(0, 3).map((r) => r.id)).toEqual(['write', 'gift-idea', 'add-person']);
		expect(rows[1]).toMatchObject({ kind: 'step', step: 'giftIdea', label: 'Gift idea for …' });
	});

	it('is found by what it does', () => {
		expect(paletteRows('gift', people, labels).map((r) => r.id)).toContain('gift-idea');
	});

	it('then asks only whom it is for: people, each landing on their idea form', () => {
		const rows = paletteRows('', people, labels, new Map(), 'giftIdea');

		expect(rows.every((r) => r.kind === 'person')).toBe(true);
		expect(rows.map((r) => r.id)).toEqual(['lena', 'oma', 'markus']);
		expect(rows[0]).toMatchObject({ href: '/contacts/lena?gift=idea' });
	});

	it('narrows that list as a name is typed, and offers no full search there', () => {
		const rows = paletteRows('oma', people, labels, new Map(), 'giftIdea');

		expect(rows.map((r) => r.id)).toEqual(['oma']);
	});
});

describe('personSearchRows', () => {
	const searchEverything = labels.searchEverything;

	it('offers nothing until something is typed, so the home field stays a plain field', () => {
		expect(personSearchRows('', people, searchEverything)).toEqual([]);
		expect(personSearchRows('   ', people, searchEverything)).toEqual([]);
	});

	it('finds people by name, the best-starting name first, and never offers an action', () => {
		const rows = personSearchRows(
			'le',
			[person('corinne', 'Corinne Keller', { lastName: 'Keller' }), ...people],
			searchEverything
		);

		expect(rows.filter((r) => r.kind === 'person').map((r) => r.id)).toEqual(['lena', 'corinne']);
		expect(rows.map((r) => r.kind)).toEqual(['person', 'person', 'search']);
	});

	it('ends with full search, so a query nobody matches still leads somewhere', () => {
		const rows = personSearchRows('garden', people, searchEverything);

		expect(rows).toEqual([
			{
				kind: 'search',
				id: 'search',
				label: 'Search everything for “garden”',
				icon: 'search',
				href: '/search?q=garden'
			}
		]);
	});

	it('shows no more people than the palette does', () => {
		const many = Array.from({ length: PALETTE_PEOPLE_LIMIT + 3 }, (_, i) =>
			person(`p${i}`, `Anna ${i}`)
		);

		expect(
			personSearchRows('anna', many, searchEverything).filter((r) => r.kind === 'person')
		).toHaveLength(PALETTE_PEOPLE_LIMIT);
	});
});

import { describe, expect, it } from 'bun:test';
import { paletteRows, PALETTE_PEOPLE_LIMIT, type PalettePerson } from './palette';

/*
 * The command palette (docs/05 §5.4, docs/02 §2.22.1): what ⌘K offers for a given query.
 * Pure, so the order of rows — and the promise that an empty palette still leads to the
 * capture field — is stated here rather than in a component.
 */

function person(id: string, displayName: string, extra: Partial<PalettePerson> = {}): PalettePerson {
	return { id, displayName, firstName: null, lastName: null, nickname: null, avatarPhotoId: null, ...extra };
}

const people = [person('lena', 'Lena Brunner', { lastName: 'Brunner' }), person('oma', 'Oma'), person('markus', 'Markus Lang')];

describe('paletteRows', () => {
	it('leads with writing a moment on an empty query, so ⌘K then Enter is still the way to capture', () => {
		const rows = paletteRows('', people);

		expect(rows[0]).toMatchObject({ kind: 'action', id: 'write', href: '/?compose' });
		expect(rows.filter((r) => r.kind === 'action').map((r) => r.id)).toEqual(['write', 'add-person']);
	});

	it('lists people on an empty query, so the palette doubles as a jump list', () => {
		const rows = paletteRows('', people);

		expect(rows.filter((r) => r.kind === 'person')).toHaveLength(3);
	});

	it('narrows people to the query and keeps only the actions the query names', () => {
		const rows = paletteRows('len', people);

		expect(rows.filter((r) => r.kind === 'person').map((r) => r.id)).toEqual(['lena']);
		expect(rows.filter((r) => r.kind === 'action')).toEqual([]);
	});

	it('ranks a name that starts with the query above one that merely contains it', () => {
		const rows = paletteRows('le', [person('corinne', 'Corinne Keller', { lastName: 'Keller' }), ...people]);

		expect(rows.filter((r) => r.kind === 'person').map((r) => r.id)).toEqual(['lena', 'corinne']);
	});

	it('finds an action by what it does', () => {
		expect(paletteRows('add', people).filter((r) => r.kind === 'action').map((r) => r.id)).toEqual(['add-person']);
		expect(paletteRows('moment', people).filter((r) => r.kind === 'action').map((r) => r.id)).toEqual(['write']);
	});

	it('always ends a typed query with a way into full search, for notes the palette cannot see', () => {
		const rows = paletteRows('lake', people);

		expect(rows.at(-1)).toMatchObject({ kind: 'search', href: '/search?q=lake' });
		expect(paletteRows('', people).find((r) => r.kind === 'search')).toBeUndefined();
	});

	it('shows at most a handful of people, whatever the household size', () => {
		const many = Array.from({ length: 30 }, (_, i) => person(`p${i}`, `Person ${i}`));

		expect(paletteRows('', many).filter((r) => r.kind === 'person')).toHaveLength(PALETTE_PEOPLE_LIMIT);
	});

	it('encodes the query into the search link rather than trusting it', () => {
		expect(paletteRows('a&b', people).at(-1)).toMatchObject({ href: '/search?q=a%26b' });
	});
});

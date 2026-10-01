import { describe, expect, it } from 'bun:test';
import { createTranslator } from '../i18n/translate';
import type { ContextTie, PersonContext } from './context';
import {
	namesakesOn,
	contextLineOf,
	describeDistinction,
	isKnownByAFirstNameOnly,
	suggestedDescription,
	tellApart,
	type Distinguishable
} from './namesakes';

const person = (id: string, displayName: string, extra: Partial<Distinguishable> = {}): Distinguishable => ({
	id,
	displayName,
	...extra
});

describe('tellApart', () => {
	it('leaves a name nobody else has alone', () => {
		const lines = tellApart([person('a', 'Thomas Meier'), person('b', 'Thomas')]);
		expect(lines.size).toBe(0);
	});

	it('gives every namesake a line, whatever the case or stray spaces', () => {
		const lines = tellApart([
			person('a', 'Thomas', { description: 'SAC hut, Aug 2026' }),
			person('b', ' thomas ', { description: 'Gym club' }),
			person('c', 'Thomas Meier')
		]);
		expect([...lines.keys()].sort()).toEqual(['a', 'b']);
	});

	it('prefers the description', () => {
		const lines = tellApart([
			person('a', 'Thomas', { description: 'SAC hut', metPlace: 'Blüemlisalp', metDate: '2026-08-12' }),
			person('b', 'Thomas')
		]);
		expect(lines.get('a')).toEqual({ kind: 'description', text: 'SAC hut' });
	});

	it('falls back to where and when they were met, the year alone of the date', () => {
		const lines = tellApart([
			person('a', 'Thomas', { description: '  ', metPlace: 'Tierberglihütte', metDate: '2024-07-03' }),
			person('b', 'Thomas', { metPlace: 'Lake Thun' }),
			person('c', 'Thomas', { metDate: '2019' })
		]);
		expect(lines.get('a')).toEqual({ kind: 'met', place: 'Tierberglihütte', year: '2024' });
		expect(lines.get('b')).toEqual({ kind: 'met', place: 'Lake Thun', year: null });
		expect(lines.get('c')).toEqual({ kind: 'met', place: null, year: '2019' });
	});

	it('says so when nothing tells a namesake apart', () => {
		const lines = tellApart([person('a', 'Thomas', { metDate: 'someday' }), person('b', 'Thomas')]);
		expect(lines.get('a')).toEqual({ kind: 'nothing' });
		expect(lines.get('b')).toEqual({ kind: 'nothing' });
	});
});

/* The clean-up list's rule (docs/02 §2.2.3): the namesake line's "nothing yet" case, for anyone. */
describe('namesakesOn', () => {
	it('keeps exactly the people who share their name with another on the list', () => {
		const people = [
			person('a', 'Thomas'),
			person('b', ' thomas '),
			person('c', 'Thomas Meier'),
			person('d', 'Sabine')
		];
		expect(namesakesOn(people).map((p) => p.id)).toEqual(['a', 'b']);
	});

	it('finds none on a list where every name is told apart by itself', () => {
		expect(namesakesOn([person('a', 'Thomas'), person('b', 'Thomas Meier')])).toEqual([]);
	});
});

describe('isKnownByAFirstNameOnly', () => {
	it('finds a first name with nothing else to tell them apart', () => {
		expect(isKnownByAFirstNameOnly(person('a', 'Thomas'))).toBe(true);
		expect(isKnownByAFirstNameOnly(person('a', ' Thomas ', { lastName: '  ', description: ' ' }))).toBe(true);
	});

	it('leaves out anyone with a last name, in its field or in the name they are shown by', () => {
		expect(isKnownByAFirstNameOnly(person('a', 'Thomas', { lastName: 'Meier' }))).toBe(false);
		expect(isKnownByAFirstNameOnly(person('a', 'Tante Vreni'))).toBe(false);
	});

	it('leaves out anyone with a description, or a place or year they were met', () => {
		expect(isKnownByAFirstNameOnly(person('a', 'Thomas', { description: 'SAC hut' }))).toBe(false);
		expect(isKnownByAFirstNameOnly(person('a', 'Thomas', { metPlace: 'Tierberglihütte' }))).toBe(false);
		expect(isKnownByAFirstNameOnly(person('a', 'Thomas', { metDate: '2024-07-03' }))).toBe(false);
	});
});

/* The further fallbacks (docs/02 §2.2.3): a relationship, then a circle, as the server ranked them. */
const tie = (otherName: string, extra: Partial<ContextTie> = {}): ContextTie => ({
	typeKey: 'sibling',
	side: 'forward',
	label: 'Sibling of',
	otherId: otherName.toLowerCase(),
	otherName,
	otherIsViewer: false,
	...extra
});
const contexts = (entries: Record<string, PersonContext>) => new Map(Object.entries(entries));

describe('tellApart, falling back on relationships and circles', () => {
	it('names the first link when nothing was typed to tell them apart', () => {
		const lines = tellApart(
			[person('a', 'Thomas'), person('b', 'Thomas')],
			contexts({ a: { ties: [tie('Sabine Keller'), tie('Reto Frei')], circle: { name: 'Turnverein', role: null } } })
		);
		expect(lines.get('a')).toEqual({ kind: 'tie', tie: tie('Sabine Keller') });
		expect(lines.get('b')).toEqual({ kind: 'nothing' });
	});

	it('keeps what was typed ahead of any link', () => {
		const lines = tellApart(
			[person('a', 'Thomas', { metPlace: 'Zermatt' }), person('b', 'Thomas')],
			contexts({ a: { ties: [tie('Sabine Keller')], circle: null } })
		);
		expect(lines.get('a')).toEqual({ kind: 'met', place: 'Zermatt', year: null });
	});

	it('skips a link to another namesake, and falls back on the circle', () => {
		const lines = tellApart(
			[person('a', 'Thomas'), person('b', 'Thomas'), person('c', 'Lea'), person('d', 'lea')],
			contexts({
				a: { ties: [tie('Thomas', { typeKey: 'parent_child' }), tie('Lea')], circle: { name: 'Class 9a', role: 'Parent' } },
				b: { ties: [tie('Thomas')], circle: null }
			})
		);
		expect(lines.get('a')).toEqual({ kind: 'circle', name: 'Class 9a', role: 'Parent' });
		expect(lines.get('b')).toEqual({ kind: 'nothing' });
	});
});

describe('contextLineOf', () => {
	it('is null when there is nothing to fall back on', () => {
		expect(contextLineOf(undefined, () => false)).toBeNull();
		expect(contextLineOf({ ties: [tie('Thomas')], circle: null }, (name) => name === 'Thomas')).toBeNull();
	});
});

describe('describeDistinction for a link or a circle', () => {
	const en = createTranslator('en');
	const de = createTranslator('de');

	it('reads a link from the namesake\'s end, translated when Stella owns the type', () => {
		const line = { kind: 'tie', tie: tie('Sabine Keller', { typeKey: 'parent_child', side: 'reverse', label: 'Child of' }) } as const;
		expect(describeDistinction(en, line)).toBe('Child of Sabine Keller');
		expect(describeDistinction(de, line)).toBe('Kind von Sabine Keller');
	});

	it('shows a household\'s own type as it was typed', () => {
		const line = { kind: 'tie', tie: tie('Sabine Keller', { typeKey: 'godparent', label: 'Götti von' }) } as const;
		expect(describeDistinction(de, line)).toBe('Götti von Sabine Keller');
	});

	it('says *your* for a link to the viewer, but the name when it is to be stored', () => {
		const line = { kind: 'tie', tie: tie('Andy Brunner', { otherIsViewer: true }) } as const;
		expect(describeDistinction(en, line)).toBe('Your sibling');
		expect(describeDistinction(de, line)).toBe('Dein Geschwister');
		expect(describeDistinction(en, line, { byName: true })).toBe('Sibling of Andy Brunner');
	});

	it('falls back on the name for a link to the viewer of a household\'s own type', () => {
		const line = { kind: 'tie', tie: tie('Andy Brunner', { typeKey: 'godparent', label: 'Götti von', otherIsViewer: true }) } as const;
		expect(describeDistinction(de, line)).toBe('Götti von Andy Brunner');
	});

	it('names the circle, with the role when there is one', () => {
		expect(describeDistinction(en, { kind: 'circle', name: 'Turnverein', role: 'Coach' })).toBe('Turnverein · Coach');
		expect(describeDistinction(de, { kind: 'circle', name: 'Turnverein', role: null })).toBe('Turnverein');
	});
});

/* The clean-up list fills the field in from the same line, in words fit to store for everyone. */
describe('suggestedDescription', () => {
	const en = createTranslator('en');

	it('names the viewer rather than saying *your*, and skips a link to a namesake', () => {
		const people = [person('a', 'Thomas'), person('b', 'Thomas'), person('me', 'Andy Brunner')];
		const context = { ties: [tie('Thomas'), tie('Andy Brunner', { otherIsViewer: true })], circle: null };
		expect(suggestedDescription(en, people, context)).toBe('Sibling of Andy Brunner');
	});

	it('suggests nothing without a link or a circle', () => {
		expect(suggestedDescription(en, [person('a', 'Thomas')], undefined)).toBeNull();
	});
});

import { describe, expect, it } from 'bun:test';
import { isKnownByAFirstNameOnly, tellApart, type Distinguishable } from './namesakes';

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

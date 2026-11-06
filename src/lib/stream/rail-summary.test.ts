import { describe, expect, it } from 'bun:test';
import { memoryRail, railSummary, todoRailFirst } from './rail-summary';

/*
 * The phone's one line per rail section (docs/05 §5.5.1): how many, and the first of them —
 * never words a veil would hide.
 */

describe('railSummary', () => {
	it('reads the count and the first item', () => {
		expect(railSummary(2, 'Call Rosa about the move')).toBe('2 · Call Rosa about the move');
	});

	it('reads the count alone when there is no first item to name', () => {
		expect(railSummary(3, null)).toBe('3');
	});
});

describe('todoRailFirst', () => {
	const todo = (title: string, visibility: 'shared' | 'private' = 'shared', done = false) => ({
		todo: { title, visibility },
		done
	});

	it('names the first open shared to-do', () => {
		expect(todoRailFirst([todo('Ticked', 'shared', true), todo('Call Rosa')])).toBe('Call Rosa');
	});

	it('skips a private one, which is veiled in the list', () => {
		expect(todoRailFirst([todo('Secret', 'private'), todo('Book the venue')])).toBe(
			'Book the venue'
		);
	});

	it('names none when every open one is private', () => {
		expect(todoRailFirst([todo('Secret', 'private')])).toBeNull();
	});
});

describe('memoryRail', () => {
	const row = (line: string | null, isPrivate = false) => ({
		line,
		isPrivate,
		people: [{ name: 'Rosa Brunner' }]
	});

	it('counts the entries and names the first with its year', () => {
		const years = [
			{ year: 2023, rows: [row('Lake trip')] },
			{ year: 2021, rows: [row('Picnic'), row(null)] }
		];
		expect(memoryRail(years, 0)).toEqual({ count: 3, first: 'Lake trip, 2023' });
	});

	it('names a row without a line by its person', () => {
		expect(memoryRail([{ year: 2020, rows: [row(null)] }], 0).first).toBe('Rosa Brunner, 2020');
	});

	it('skips a private entry', () => {
		const years = [{ year: 2024, rows: [row('Secret', true), row('Hike')] }];
		expect(memoryRail(years, 0)).toEqual({ count: 2, first: 'Hike, 2024' });
	});

	it('counts the photos when the day holds nothing else', () => {
		expect(memoryRail([], 4)).toEqual({ count: 4, first: null });
	});
});

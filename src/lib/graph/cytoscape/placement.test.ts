import { describe, expect, it } from 'bun:test';
import { placeNewcomers, type Point } from './placement';

/*
 * Where an expand puts the people it brings in. The canvas the reader has been looking at is
 * their map of it: the newcomers have to arrive next to the person they were opened from and
 * leave everyone else exactly where they stood (docs/05 §5.8).
 */

const SPACING = 90;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Two people side by side, the centre of the canvas between them. */
const placed = new Map<string, Point>([
	['anna', { x: -100, y: 0 }],
	['bert', { x: 100, y: 0 }]
]);

describe('placeNewcomers', () => {
	it('answers for the newcomers only, never moving anyone already placed', () => {
		const result = placeNewcomers(placed, ['carl'], [{ source: 'bert', target: 'carl' }], SPACING);

		expect([...result.keys()]).toEqual(['carl']);
	});

	it('puts a newcomer one edge length from the person it was opened from', () => {
		const result = placeNewcomers(placed, ['carl'], [{ source: 'bert', target: 'carl' }], SPACING);

		expect(distance(result.get('carl')!.at, placed.get('bert')!)).toBeCloseTo(SPACING);
	});

	it('fans newcomers outward, away from the rest of the map', () => {
		const result = placeNewcomers(placed, ['carl'], [{ source: 'bert', target: 'carl' }], SPACING);

		// bert stands right of centre, so his people open further to the right.
		expect(result.get('carl')!.at.x).toBeGreaterThan(placed.get('bert')!.x);
	});

	it('spreads several newcomers so no two of them land on top of each other', () => {
		const ids = ['carl', 'dora', 'emil', 'finn', 'gina', 'hugo', 'ida', 'jan'];
		const result = placeNewcomers(
			placed,
			ids,
			ids.map((id) => ({ source: 'bert', target: id })),
			SPACING
		);

		expect(result.size).toBe(ids.length);
		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				expect(distance(result.get(ids[i])!.at, result.get(ids[j])!.at)).toBeGreaterThan(
					SPACING * 0.8
				);
			}
		}
	});

	it('hangs a newcomer that only knows another newcomer off that one', () => {
		const result = placeNewcomers(
			placed,
			['dora', 'carl'],
			[
				{ source: 'bert', target: 'carl' },
				{ source: 'carl', target: 'dora' }
			],
			SPACING
		);

		expect(distance(result.get('dora')!.at, result.get('carl')!.at)).toBeCloseTo(SPACING);
	});

	it('sets a newcomer with no tie to the map beside it, not on top of it', () => {
		const result = placeNewcomers(placed, ['carl'], [], SPACING);

		expect(result.get('carl')!.at.x).toBeGreaterThan(placed.get('bert')!.x);
	});

	it('keeps newcomers clear of everyone already on the map, even from its crowded middle', () => {
		// A person in the thick of the map: whoever they bring in goes out past the crowd rather
		// than into it, so the map stays readable.
		const crowd = new Map<string, Point>([['anna', { x: 0, y: 0 }]]);
		for (let i = 0; i < 12; i++) {
			const angle = (i / 12) * 2 * Math.PI;
			crowd.set(`p${i}`, { x: 100 * Math.cos(angle), y: 100 * Math.sin(angle) });
			crowd.set(`q${i}`, { x: 200 * Math.cos(angle), y: 200 * Math.sin(angle) });
		}
		const ids = ['carl', 'dora', 'emil', 'finn'];
		const result = placeNewcomers(
			crowd,
			ids,
			ids.map((id) => ({ source: 'anna', target: id })),
			SPACING
		);

		for (const id of ids) {
			for (const [, other] of crowd) {
				expect(distance(result.get(id)!.at, other)).toBeGreaterThanOrEqual(SPACING - 1e-9);
			}
		}
	});

	it('keeps the newcomers of two different people clear of each other', () => {
		const result = placeNewcomers(
			placed,
			['carl', 'dora'],
			[
				{ source: 'anna', target: 'carl' },
				{ source: 'bert', target: 'dora' }
			],
			SPACING
		);

		expect(distance(result.get('carl')!.at, result.get('dora')!.at)).toBeGreaterThanOrEqual(
			SPACING - 1e-9
		);
	});

	it('starts each newcomer from the person it was opened from, so it can travel out', () => {
		const result = placeNewcomers(placed, ['carl'], [{ source: 'bert', target: 'carl' }], SPACING);

		expect(result.get('carl')!.from).toEqual(placed.get('bert')!);
	});

	it('still opens outward from a person standing at the very centre', () => {
		const centred = new Map<string, Point>([
			['anna', { x: 0, y: 0 }],
			['bert', { x: 100, y: 0 }],
			['dora', { x: -100, y: 0 }]
		]);
		const result = placeNewcomers(
			centred,
			['carl'],
			[
				{ source: 'anna', target: 'bert' },
				{ source: 'anna', target: 'dora' },
				{ source: 'anna', target: 'carl' }
			],
			SPACING
		);

		const carl = result.get('carl')!.at;
		expect(distance(carl, centred.get('anna')!)).toBeCloseTo(SPACING);
		expect(distance(carl, centred.get('bert')!)).toBeGreaterThan(SPACING * 0.8);
		expect(distance(carl, centred.get('dora')!)).toBeGreaterThan(SPACING * 0.8);
	});
});

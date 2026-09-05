import { describe, expect, it } from 'bun:test';
import { ALL_KINDS, activeKind, filterCircles, kindChips, type BrowsableCircle } from './browse';

/*
 * Finding a circle among many (docs/02 §2.4.2): what a typed query matches and what the kind
 * chips offer. Pure and client-safe, because the page filters as you type without a round
 * trip — the rule has to run in the browser as well as on the server render.
 */

const circles: BrowsableCircle[] = [
	{ id: 'c1', name: 'Kegelclub Bühl', kind: 'club', description: 'Thursdays, since 1998' },
	{ id: 'c2', name: 'Klasse 1B', kind: 'school', description: 'Spitalacker, 2024/25' },
	{ id: 'c3', name: 'FC Längmatt', kind: 'club', description: null },
	{ id: 'c4', name: 'Nachbarn', kind: 'neighbourhood', description: 'Bühlstrasse' }
];

describe('filterCircles', () => {
	it('returns everything when nothing is asked for', () => {
		expect(filterCircles(circles, { query: '  ', kind: ALL_KINDS })).toHaveLength(4);
	});

	it('matches part of the name, whatever the case or the accents', () => {
		expect(filterCircles(circles, { query: 'buhl', kind: ALL_KINDS }).map((c) => c.id)).toEqual(['c1', 'c4']);
	});

	it('matches the description too, so "Thursdays" finds the club that meets then', () => {
		expect(filterCircles(circles, { query: 'thursdays', kind: ALL_KINDS }).map((c) => c.id)).toEqual(['c1']);
	});

	it('narrows to one kind', () => {
		expect(filterCircles(circles, { query: '', kind: 'club' }).map((c) => c.id)).toEqual(['c1', 'c3']);
	});

	it('applies the kind and the query together', () => {
		expect(filterCircles(circles, { query: 'buhl', kind: 'club' }).map((c) => c.id)).toEqual(['c1']);
		expect(filterCircles(circles, { query: 'buhl', kind: 'neighbourhood' }).map((c) => c.id)).toEqual(['c4']);
	});

	it('finds nothing rather than everything when the query matches nobody', () => {
		expect(filterCircles(circles, { query: 'zzz', kind: ALL_KINDS })).toEqual([]);
	});
});

describe('kindChips', () => {
	it('offers All first, then only the kinds that exist, with their counts', () => {
		expect(kindChips(circles, '')).toEqual([
			{ kind: ALL_KINDS, label: 'All', count: 4 },
			{ kind: 'club', label: 'club', count: 2 },
			{ kind: 'neighbourhood', label: 'neighbourhood', count: 1 },
			{ kind: 'school', label: 'school', count: 1 }
		]);
	});

	it('counts what the query leaves, so a chip never leads to an empty page', () => {
		expect(kindChips(circles, 'buhl')).toEqual([
			{ kind: ALL_KINDS, label: 'All', count: 2 },
			{ kind: 'club', label: 'club', count: 1 },
			{ kind: 'neighbourhood', label: 'neighbourhood', count: 1 }
		]);
	});

	it('offers only All when the query matches nothing', () => {
		expect(kindChips(circles, 'zzz')).toEqual([{ kind: ALL_KINDS, label: 'All', count: 0 }]);
	});
});

describe('activeKind', () => {
	it('keeps the chosen kind while the query still offers it', () => {
		expect(activeKind(kindChips(circles, 'buhl'), 'club')).toBe('club');
	});

	it('falls back to All once the query has filtered that kind away', () => {
		expect(activeKind(kindChips(circles, 'thursdays'), 'school')).toBe(ALL_KINDS);
	});

	it('leaves All alone', () => {
		expect(activeKind(kindChips(circles, ''), ALL_KINDS)).toBe(ALL_KINDS);
	});
});

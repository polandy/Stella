import { describe, expect, test } from 'bun:test';
import { familyEdges, familyNodes } from './fixtures';
import { canExpand, ringsFrom } from './rings';
import type { GraphModel } from './types';

/*
 * How far a node is from the centre, and how far the map embedded in a person's page is
 * allowed to grow (docs/02 §2.7). The family fixture is the same one the ego-network and path
 * tests use, so a change to it is caught in one place.
 */

const family: GraphModel = { nodes: familyNodes, edges: familyEdges };

describe('ringsFrom', () => {
	test('puts the centre at nought', () => {
		expect(ringsFrom(family, 'mara').get('mara')).toBe(0);
	});

	test('counts a direct link as one hop, whichever way round the edge is stored', () => {
		const rings = ringsFrom(family, 'mara');
		// `r3` is stored mara → peter, `m1` is stored kegel → mara: both are one hop.
		expect(rings.get('peter')).toBe(1);
		expect(rings.get('kegel')).toBe(1);
	});

	test('counts a link reached through somebody else as two', () => {
		const rings = ringsFrom(family, 'mara');
		expect(rings.get('elena')).toBe(2); // mara → tobias → elena
		expect(rings.get('doris')).toBe(2); // mara → Kegelclub → doris
	});

	test('takes the shortest way when a node can be reached two ways', () => {
		// Walter is Peter's father (two hops) and Mara's derived grandfather (one).
		expect(ringsFrom(family, 'mara').get('walter')).toBe(1);
	});

	test('leaves out what the centre cannot reach, rather than calling it far away', () => {
		expect(ringsFrom(family, 'mara').has('ghost')).toBe(false);
	});

	test('answers nothing at all for a centre the model does not hold', () => {
		expect(ringsFrom(family, 'nobody').size).toBe(0);
	});

	test('answers only the centre when it stands alone', () => {
		const alone: GraphModel = { nodes: [{ id: 'x', kind: 'person', label: 'X' }], edges: [] };
		expect([...ringsFrom(alone, 'x')]).toEqual([['x', 0]]);
	});
});

describe('canExpand', () => {
	const rings = ringsFrom(family, 'mara');

	test('lets the centre and the ring around it grow the map', () => {
		expect(canExpand(rings, 'mara', 2)).toBe(true);
		expect(canExpand(rings, 'peter', 2)).toBe(true);
	});

	test('stops at the last ring, whose neighbours would sit outside the map', () => {
		expect(canExpand(rings, 'elena', 2)).toBe(false);
	});

	test('follows the limit it is given', () => {
		expect(canExpand(rings, 'peter', 1)).toBe(false);
		expect(canExpand(rings, 'elena', 3)).toBe(true);
	});

	test('refuses a node that is not on the map at all', () => {
		expect(canExpand(rings, 'ghost', 2)).toBe(false);
		expect(canExpand(rings, 'nobody', 2)).toBe(false);
	});
});

import { describe, expect, it } from 'bun:test';
import type { CyElement } from './elements';
import { spacingFor } from '../layout/density';
import { HAS_MORE_CLASS } from './stylesheet';
import {
	node,
	edge,
	group,
	inGroup,
	tucked,
	club,
	core,
	linkedPair,
	controller,
	positionsOf,
	layoutNames
} from './explorer-fixtures';

/*
 * Reconciling the canvas with a fresh element set (`graph-diff.ts`, docs/05 §5.8): who stays keeps
 * their place and takes on what the elements now say, and only the newcomers are placed.
 */

describe('a fresh element set', () => {
	it('leaves everyone already on the canvas where they stood when a node is expanded', () => {
		// The reader has learnt where people are; an expand that re-arranged the whole map made
		// them find their way again. Only the newcomers may move.
		const cy = linkedPair();
		const explorer = controller(cy);
		const before = positionsOf(cy, ['a', 'b']);

		explorer.setGraph([node('a'), node('b'), node('c'), edge('a', 'b'), edge('b', 'c')]);

		expect(positionsOf(cy, ['a', 'b'])).toEqual(before);
		const b = cy.$id('b').position();
		const c = cy.$id('c').position();
		expect(Math.hypot(c.x - b.x, c.y - b.y)).toBeLessThan(200);
	});

	it('sets newcomers down on the person they came from when an arrangement follows', () => {
		// The family tree lays the whole map out again after an expand; a newcomer then glides
		// out from whoever brought it in, together with everybody else, instead of first.
		const cy = linkedPair();
		const explorer = controller(cy);
		const b = { ...cy.$id('b').position() };

		explorer.setGraph([node('a'), node('b'), node('c'), edge('a', 'b'), edge('b', 'c')], {
			arrangedNext: true
		});

		expect(cy.$id('c').position()).toEqual(b);
		expect(cy.$id('c').animated()).toBe(false);
	});

	it('runs no layout for an expand, so nothing re-frames the view', () => {
		const cy = linkedPair();
		const names = layoutNames(cy);
		const explorer = controller(cy);
		const opening = names.length;

		explorer.setGraph([node('a'), node('b'), node('c'), edge('a', 'b'), edge('b', 'c')]);

		expect(names.length).toBe(opening);
		expect(cy.$id('c').nonempty()).toBe(true);
	});

	it('arranges nothing when people only leave the canvas', () => {
		const cy = linkedPair();
		const names = layoutNames(cy);
		const explorer = controller(cy);
		const opening = names.length;
		const before = positionsOf(cy, ['a']);

		explorer.setGraph([node('a')]);

		expect(cy.$id('b').empty()).toBe(true);
		expect(names.length).toBe(opening);
		expect(positionsOf(cy, ['a'])).toEqual(before);
	});

	it('sets newcomers the edge length of the density it was given away', () => {
		const cy = linkedPair();
		const explorer = controller(cy, { spacing: spacingFor('spacious') });

		explorer.setGraph([node('a'), node('b'), node('c'), edge('a', 'b'), edge('b', 'c')]);

		const b = cy.$id('b').position();
		const c = cy.$id('c').position();
		expect(Math.hypot(c.x - b.x, c.y - b.y)).toBeCloseTo(spacingFor('spacious').edgeLength);
	});

	it('takes a new density for the next expand, moving nobody already placed', () => {
		const cy = linkedPair();
		const explorer = controller(cy);
		const before = positionsOf(cy, ['a', 'b']);

		explorer.setSpacing(spacingFor('compact'));
		explorer.setGraph([node('a'), node('b'), node('c'), edge('a', 'b'), edge('b', 'c')]);

		expect(positionsOf(cy, ['a', 'b'])).toEqual(before);
		const b = cy.$id('b').position();
		const c = cy.$id('c').position();
		expect(Math.hypot(c.x - b.x, c.y - b.y)).toBeCloseTo(spacingFor('compact').edgeLength);
	});

	it('takes the "+N" badge off a node once there is nothing more behind it', () => {
		// Expanding a node brings its people in; the node itself stays, and its badge must go.
		const cy = core();
		const explorer = controller(cy);
		const growing: CyElement = {
			group: 'nodes',
			data: { id: 'a', more: 2 },
			classes: `person ${HAS_MORE_CLASS}`
		};
		explorer.setGraph([growing, node('b')]);
		expect(cy.$id('a').hasClass(HAS_MORE_CLASS)).toBe(true);

		explorer.setGraph([{ ...growing, data: { id: 'a', more: 0 }, classes: 'person' }, node('b')]);
		expect(cy.$id('a').hasClass(HAS_MORE_CLASS)).toBe(false);
		expect(cy.$id('a').data('more')).toBe(0);

		explorer.setGraph([growing, node('b')]);
		expect(cy.$id('a').hasClass(HAS_MORE_CLASS)).toBe(true);
	});

	it('moves people already on the canvas into a group, and out again, where they stood', () => {
		const cy = core();
		const explorer = controller(cy);
		explorer.setGraph([node('swim'), node('lena'), node('juri'), edge('swim', 'lena')]);
		const before = positionsOf(cy, ['lena', 'juri']);

		explorer.setGraph([group('kids'), ...club, edge('swim', 'lena')]);
		expect(cy.$id('lena').parent().first().id()).toBe('kids');
		expect(cy.$id('swim-lena').nonempty()).toBe(true);
		expect(positionsOf(cy, ['lena', 'juri'])).toEqual(before);

		explorer.setGraph([node('swim'), node('lena'), node('juri'), edge('swim', 'lena')]);
		expect(cy.$id('kids').empty()).toBe(true);
		expect(cy.$id('lena').parent().empty()).toBe(true);
		expect(positionsOf(cy, ['lena', 'juri'])).toEqual(before);
	});

	it('tucks a line already drawn away, and brings it back, when the grouping changes', () => {
		const cy = core();
		const explorer = controller(cy);
		explorer.setGraph([node('swim'), node('lena'), node('juri'), edge('swim', 'lena')]);

		explorer.setGraph([group('kids'), ...club, tucked('swim', 'lena')]);
		expect(cy.$id('swim-lena').hasClass('tucked')).toBe(true);

		explorer.setGraph([node('swim'), node('lena'), node('juri'), edge('swim', 'lena')]);
		expect(cy.$id('swim-lena').hasClass('tucked')).toBe(false);
	});

	it('renames a group already drawn when its count changes', () => {
		const cy = core();
		const explorer = controller(cy);
		const labelled = (label: string): CyElement => ({
			...group('kids'),
			data: { id: 'kids', kind: 'group', label }
		});
		explorer.setGraph([labelled('Kids · 2'), ...club]);

		explorer.setGraph([labelled('Kids · 3'), ...club, inGroup('leo', 'kids')]);

		expect(cy.$id('kids').data('label')).toBe('Kids · 3');
	});
});

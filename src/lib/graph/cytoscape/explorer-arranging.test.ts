import { describe, expect, it } from 'bun:test';
import type { Core } from 'cytoscape';
import { spacingFor } from '../layout/density';
import { CAPTION_CLASS, ROUTE_FIELDS, ROUTED_CLASS } from './stylesheet';
import {
	node,
	edge,
	group,
	inGroup,
	tucked,
	linkedPair,
	styledCore,
	controller,
	positionsOf,
	layoutNames
} from './explorer-fixtures';

/*
 * Moving people (`arranging.ts`, docs/05 §5.8): every arrangement is worked out, then glided
 * into; the lines it says to bend or route are drawn so, and the shelf outside the family named.
 */

describe('arranging the map', () => {
	it('tidies the whole map on request: worked out by the forces, then set in place', () => {
		const cy = linkedPair();
		const names = layoutNames(cy);
		const explorer = controller(cy);
		const opening = names.length;

		explorer.arrange();

		expect(names.slice(opening)).toEqual(['cose', 'preset']);
	});

	it('glides the map into its tidied arrangement instead of showing every step', () => {
		const cy = linkedPair();
		const asked: Record<string, unknown>[] = [];
		cy.layout = ((options: Record<string, unknown>) => {
			asked.push(options);
			return { run: () => {}, stop: () => {} };
		}) as unknown as Core['layout'];
		const explorer = controller(cy, { reducedMotion: false });

		explorer.arrange();

		const tidy = asked[asked.length - 1];
		expect(tidy.name).toBe('preset');
		expect(tidy.animate).toBe(true);
		expect(tidy.animationDuration).toBeGreaterThan(0);
	});

	it('under reduced motion, tidies without any glide', () => {
		const cy = linkedPair();
		const asked: Record<string, unknown>[] = [];
		cy.layout = ((options: Record<string, unknown>) => {
			asked.push(options);
			return { run: () => {}, stop: () => {} };
		}) as unknown as Core['layout'];
		const explorer = controller(cy);

		explorer.arrange();

		expect(asked[asked.length - 1].animate).toBe(false);
	});

	it('moves the map to an arrangement it is handed, framing it again', () => {
		const cy = linkedPair();
		const explorer = controller(cy);
		const [b] = positionsOf(cy, ['b']);

		explorer.arrangeAt({ positions: new Map([['a', { x: 500, y: 700 }]]), bows: new Map() });

		// Handed a place, a node goes there; a node it was not handed stays where it was.
		expect(cy.$id('a').position()).toEqual({ x: 500, y: 700 });
		expect(cy.$id('b').position()).toEqual(b);
	});

	it('glides into a handed arrangement, just as it does for a tidy-up', () => {
		const cy = linkedPair();
		const asked: Record<string, unknown>[] = [];
		cy.layout = ((options: Record<string, unknown>) => {
			asked.push(options);
			return { run: () => {}, stop: () => {} };
		}) as unknown as Core['layout'];
		const explorer = controller(cy, { reducedMotion: false });

		explorer.arrangeAt({ positions: new Map([['a', { x: 500, y: 700 }]]), bows: new Map() });

		const handed = asked[asked.length - 1];
		expect(handed.name).toBe('preset');
		expect(handed.animate).toBe(true);
	});

	it('bends the lines an arrangement says to, and straightens the rest', () => {
		const cy = linkedPair();
		cy.add({ group: 'nodes', data: { id: 'c' } });
		cy.add({ group: 'edges', data: { id: 'b-c', source: 'b', target: 'c' } });
		const explorer = controller(cy);

		explorer.arrangeAt({ positions: new Map(), bows: new Map([['a-b', 80]]) });
		expect(cy.$id('a-b').hasClass('bowed')).toBe(true);
		expect(cy.$id('a-b').data('bow')).toBe(80);
		expect(cy.$id('b-c').hasClass('bowed')).toBe(false);

		explorer.arrangeAt({ positions: new Map(), bows: new Map([['b-c', -40]]) });
		expect(cy.$id('a-b').hasClass('bowed')).toBe(false);
		expect(cy.$id('b-c').hasClass('bowed')).toBe(true);
	});

	it('straightens every line when the map is arranged freely', () => {
		const cy = linkedPair();
		const explorer = controller(cy);
		explorer.arrangeAt({ positions: new Map(), bows: new Map([['a-b', 80]]) });

		explorer.arrange();

		expect(cy.$id('a-b').hasClass('bowed')).toBe(false);
	});

	it('draws a routed line at right angles, measured from where its people are going', () => {
		const cy = linkedPair();
		const explorer = controller(cy);
		explorer.arrangeAt({ positions: new Map(), bows: new Map([['a-b', 80]]) });

		explorer.arrangeAt({
			positions: new Map([
				['a', { x: 0, y: 0 }],
				['b', { x: 200, y: 170 }]
			]),
			bows: new Map(),
			routes: new Map([
				[
					'a-b',
					{
						waypoints: [
							{ x: 0, y: 93.5 },
							{ x: 200, y: 93.5 }
						],
						sourceEnd: { x: -60, y: 0 },
						nameEnd: 'target' as const
					}
				]
			])
		});

		const line = cy.$id('a-b');
		expect(line.hasClass(ROUTED_CLASS)).toBe(true);
		expect(line.hasClass('bowed')).toBe(false);
		expect(line.data(ROUTE_FIELDS.weights)).toHaveLength(2);
		expect(line.data(ROUTE_FIELDS.sourceEndpoint)).toBe('-60px 0px');
		// Its name goes on the drop down to the child, the end the route says.
		expect(line.data(ROUTE_FIELDS.nameEnd)).toBe('target');

		explorer.arrange();
		expect(line.hasClass(ROUTED_CLASS)).toBe(false);
	});

	it('names the shelf beneath the family tree, as words nobody can tap or walk to', () => {
		const cy = linkedPair();
		const explorer = controller(cy);
		const shelf = { x: 0, y: 300 };

		explorer.arrangeAt(
			{ positions: new Map(), bows: new Map(), outsideFamily: shelf },
			{ outsideFamily: 'Outside the family' }
		);
		const caption = cy.nodes(`.${CAPTION_CLASS}`).first();

		expect(cy.nodes(`.${CAPTION_CLASS}`).length).toBe(1);
		expect(caption.data('label')).toBe('Outside the family');
		expect(caption.position().x).toBe(shelf.x);
		expect(caption.position().y).toBeLessThan(shelf.y);
		expect(caption.grabbable()).toBe(false);
		// The keyboard walks people only, and filtering or a fresh element set leaves it be.
		expect([...explorer.positions().keys()].sort()).toEqual(['a', 'b']);
		explorer.setVisible(new Set(['a', 'b']), new Set(['a-b']));
		explorer.setGraph([node('a'), node('b'), edge('a', 'b')]);
		expect(caption.removed()).toBe(false);
		expect(caption.hasClass('filtered-out')).toBe(false);

		explorer.arrange();
		expect(cy.nodes(`.${CAPTION_CLASS}`).length).toBe(0);
	});

	it('writes no caption for an arrangement without a shelf to name', () => {
		const cy = linkedPair();
		const explorer = controller(cy);

		explorer.arrangeAt(
			{ positions: new Map(), bows: new Map() },
			{ outsideFamily: 'Outside the family' }
		);

		expect(cy.nodes().length).toBe(2);
		expect(cy.nodes(`.${CAPTION_CLASS}`).length).toBe(0);
	});

	it('aims the free arrangement at the density’s edge length and push', () => {
		const cy = linkedPair();
		const asked: Record<string, unknown>[] = [];
		const real = cy.layout.bind(cy);
		cy.layout = ((options: Record<string, unknown>) => {
			asked.push(options);
			return real(options as unknown as Parameters<Core['layout']>[0]);
		}) as unknown as Core['layout'];
		const explorer = controller(cy);

		explorer.setSpacing(spacingFor('spacious'));
		explorer.arrange();

		const cose = asked.filter((o) => o.name === 'cose').at(-1)!;
		const plainLine = { hasClass: () => false };
		expect((cose.idealEdgeLength as (e: unknown) => number)(plainLine)).toBe(
			spacingFor('spacious').edgeLength
		);
		expect((cose.nodeRepulsion as () => number)()).toBe(spacingFor('spacious').repulsion);
	});

	it("stands a group's members together when the map is arranged freely", () => {
		// Frames are sized from their members, so this core needs the sizes a style gives.
		const cy = styledCore();
		const explorer = controller(cy);
		const far = ['m1', 'm2', 'm3', 'm4'];
		explorer.setGraph([
			group('kids'),
			node('swim'),
			...far.map((id) => inGroup(id, 'kids')),
			// Each member hangs off a different stranger, pulling the four apart.
			...far.flatMap((id) => [node(`${id}-friend`), edge(id, `${id}-friend`)]),
			...far.map((id) => tucked('swim', id))
		]);

		explorer.arrange();

		const at = positionsOf(cy, far);
		const spread = Math.max(...at.flatMap((a) => at.map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
		expect(spread).toBeLessThan(400);
	});
});

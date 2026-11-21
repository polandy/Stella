import { describe, expect, it } from 'bun:test';
import cytoscape from 'cytoscape';
import { frameAround } from '../layout/group-blocks';
import { READABLE_ZOOM } from '../layout/legibility';
import { group, inGroup, linkedPair, styledCore, controller } from './explorer-fixtures';

/*
 * Framing the map (`framing.ts`, docs/dev/05 §5.8): below the toolbar, clear of a panel, and never
 * so far out that the family tree's names stop being drawn.
 */

describe('framing the map', () => {
	it('frames the map in the part of the canvas the toolbar leaves free', () => {
		const middleAfterArranging = (inset: number) => {
			const cy = linkedPair();
			cy.width = () => 1000;
			cy.height = () => 800;
			const explorer = controller(cy);
			explorer.setTopInset(inset);
			explorer.arrangeAt({
				positions: new Map([
					['a', { x: 0, y: 0 }],
					['b', { x: 400, y: 0 }]
				]),
				bows: new Map()
			});
			return cy.$id('a').renderedPosition().y;
		};

		// Without a toolbar the map sits in the middle of the canvas; with one it sits in the
		// middle of what the toolbar leaves.
		expect(middleAfterArranging(0)).toBeCloseTo(400);
		expect(middleAfterArranging(100)).toBeCloseTo(100 + 700 / 2);
	});

	it('never frames the map so far out that its names stop being drawn', () => {
		// A family over two rows and a shelf far beneath it: all of it fits only far out.
		const cy = cytoscape({
			headless: true,
			elements: [
				{ data: { id: 'a' }, classes: 'person center' },
				{ data: { id: 'b' }, classes: 'person' },
				{ data: { id: 'shelf' }, classes: 'person' }
			]
		});
		cy.width = () => 1000;
		cy.height = () => 700;
		const explorer = controller(cy, { pixelRatio: 1 });

		explorer.arrangeAt(
			{
				positions: new Map([
					['a', { x: 0, y: 0 }],
					['b', { x: 300, y: 230 }],
					['shelf', { x: 0, y: 4000 }]
				]),
				bows: new Map(),
				outsideFamily: { x: 0, y: 3900, width: 600 }
			},
			{ outsideFamily: 'Outside the family', keepNamesDrawn: true }
		);

		// Half zoom is where a desktop stops drawing names; the family is shown from the top.
		expect(cy.zoom()).toBeGreaterThan(0.5);
		const a = cy.$id('a').renderedPosition();
		const b = cy.$id('b').renderedPosition();
		expect(a.y).toBeGreaterThan(0);
		expect(b.y).toBeLessThan(700);
		expect(cy.$id('shelf').renderedPosition().y).toBeGreaterThan(700);

		// Arranged otherwise, the whole map is framed, however far out that takes it.
		explorer.arrangeAt({
			positions: new Map([
				['a', { x: 0, y: 0 }],
				['b', { x: 300, y: 230 }],
				['shelf', { x: 0, y: 4000 }]
			]),
			bows: new Map()
		});
		expect(cy.$id('shelf').renderedPosition().y).toBeLessThan(700);
	});

	it('frames the core family at a readable size and tells who stands off screen', () => {
		// The centre, a sibling and a parent, and a cousin row far out to the right.
		const ids = ['sia', 'linda', 'mum', 'c1', 'c2', 'c3'];
		const cy = cytoscape({
			headless: true,
			elements: ids.map((id) => ({
				data: { id },
				classes: id === 'sia' ? 'person center' : 'person'
			}))
		});
		cy.width = () => 800;
		cy.height = () => 1000;
		const told: { left: number; right: number }[] = [];
		const explorer = controller(cy, { pixelRatio: 3, onOutside: (o) => told.push(o) });
		const positions = new Map([
			['mum', { x: 0, y: 0 }],
			['sia', { x: 0, y: 230 }],
			['linda', { x: 150, y: 230 }],
			['c1', { x: 1600, y: 230 }],
			['c2', { x: 1750, y: 230 }],
			['c3', { x: 1900, y: 230 }]
		]);

		explorer.arrangeAt(
			{ positions, bows: new Map() },
			{ keepNamesDrawn: true, coreFamily: new Set(['sia', 'linda', 'mum']) }
		);

		expect(cy.zoom()).toBeCloseTo(READABLE_ZOOM);
		expect(cy.$id('sia').renderedPosition().x).toBeGreaterThan(0);
		expect(cy.$id('linda').renderedPosition().x).toBeLessThan(800);
		expect(told.at(-1)).toEqual({ left: 0, right: 3 });

		// A filter that hides a cousin is told at once: the count is of those shown.
		explorer.setVisible(new Set(['sia', 'linda', 'mum', 'c1', 'c2']), new Set());
		expect(told.at(-1)).toEqual({ left: 0, right: 2 });

		// A step towards them brings the cousins in; the family now stands off to the left.
		explorer.stepToward('right');
		expect(told.at(-1)).toEqual({ left: 3, right: 0 });
	});

	it('frames the map clear of a panel over the right or the foot of the canvas', () => {
		const cy = linkedPair();
		cy.width = () => 1000;
		cy.height = () => 800;
		const explorer = controller(cy);
		explorer.setCovered({ right: 300, bottom: 200 });

		explorer.arrangeAt({
			positions: new Map([
				['a', { x: 0, y: 0 }],
				['b', { x: 400, y: 0 }]
			]),
			bows: new Map()
		});
		const a = cy.$id('a').renderedPosition();
		const b = cy.$id('b').renderedPosition();

		// Centred in the 700 × 600 the panels leave, not in the whole canvas.
		expect((a.x + b.x) / 2).toBeCloseTo(700 / 2);
		expect(a.y).toBeCloseTo(600 / 2);
	});

	it("frames the map with a group's name clear of the toolbar", () => {
		const cy = styledCore();
		// A canvas to frame on, which a headless core does not measure.
		cy.width = () => 800;
		cy.height = () => 600;
		const TOOLBAR = 60;
		const explorer = controller(cy, { topInset: TOOLBAR });
		explorer.setGraph([group('kids'), inGroup('lena', 'kids'), inGroup('juri', 'kids')]);

		explorer.arrangeAt({
			positions: new Map([
				['lena', { x: 0, y: 0 }],
				['juri', { x: 60, y: 0 }]
			]),
			bows: new Map()
		});

		const members = cy.$id('lena').union(cy.$id('juri')).boundingBox({ includeLabels: true });
		const top = frameAround(members).y1 * cy.zoom() + cy.pan().y;
		expect(top).toBeGreaterThanOrEqual(TOOLBAR);
	});
});

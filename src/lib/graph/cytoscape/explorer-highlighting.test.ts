import { describe, expect, it } from 'bun:test';
import cytoscape from 'cytoscape';
import type { CyElement } from './elements';
import { HOVERED_CLASS, LIT_CLASS } from './stylesheet';
import { edge, group, tucked, club, core, linkedPair, controller } from './explorer-fixtures';

/*
 * What the canvas lights up (`highlighting.ts`, docs/05 §5.8): a neighbourhood, a traced path,
 * the node the keyboard is on and the lines under the pointer — and where everyone shown stands,
 * for the keyboard to walk.
 */

describe('lighting the map up', () => {
	it('reports where everyone shown stands, for the keyboard to walk', () => {
		const cy = linkedPair();
		const explorer = controller(cy);
		explorer.arrangeAt({
			positions: new Map([
				['a', { x: 0, y: 0 }],
				['b', { x: 120, y: 0 }]
			]),
			bows: new Map()
		});

		expect(explorer.positions()).toEqual(
			new Map([
				['a', { x: 0, y: 0 }],
				['b', { x: 120, y: 0 }]
			])
		);
		// Someone filtered out is not there to step to.
		explorer.setVisible(new Set(['a']), new Set());
		expect([...explorer.positions().keys()]).toEqual(['a']);
	});

	it('marks the one node the keyboard is on, and nobody once it lets go', () => {
		const cy = linkedPair();
		const explorer = controller(cy);

		explorer.markCursor('a');
		explorer.markCursor('b');
		expect(cy.$('.cursor').map((n) => n.id())).toEqual(['b']);

		explorer.markCursor(null);
		expect(cy.$('.cursor').empty()).toBe(true);
	});

	it('names the lines of whoever the pointer rests on, and lets go when it leaves', () => {
		const cy = linkedPair();
		controller(cy);

		cy.$id('b').emit('mouseover');
		expect(cy.$id('a-b').hasClass(HOVERED_CLASS)).toBe(true);

		cy.$id('b').emit('mouseout');
		expect(cy.$id('a-b').hasClass(HOVERED_CLASS)).toBe(false);
	});

	it('names a line the pointer rests on', () => {
		const cy = linkedPair();
		controller(cy);

		cy.$id('a-b').emit('mouseover');
		expect(cy.$id('a-b').hasClass(HOVERED_CLASS)).toBe(true);

		cy.$id('a-b').emit('mouseout');
		expect(cy.$id('a-b').hasClass(HOVERED_CLASS)).toBe(false);
	});

	it("names a member's tucked-away lines when the member is selected, keeping the group lit", () => {
		const cy = core();
		const explorer = controller(cy);
		explorer.setGraph([group('kids'), ...club, tucked('swim', 'lena'), tucked('swim', 'juri')]);

		explorer.highlightNeighborhood('lena');

		expect(cy.$id('swim-lena').hasClass('highlight')).toBe(true);
		expect(cy.$id('swim-juri').hasClass('highlight')).toBe(false);
		expect(cy.$id('kids').hasClass('faded')).toBe(false);
	});

	it("keeps a circle's tucked-away lines tucked away when the circle is selected", () => {
		const cy = core();
		const explorer = controller(cy);
		explorer.setGraph([group('kids'), ...club, tucked('swim', 'lena'), tucked('swim', 'juri')]);

		explorer.highlightNeighborhood('swim');

		expect(cy.$id('swim-lena').hasClass('highlight')).toBe(false);
		expect(cy.$id('lena').hasClass('faded')).toBe(false);
	});

	it('lights a selected group with its members and their lines to the rest', () => {
		const cy = core();
		const explorer = controller(cy);
		const bundle: CyElement = {
			group: 'edges',
			data: { id: 'swim>kids', source: 'swim', target: 'kids' },
			classes: 'bundle'
		};
		explorer.setGraph([
			group('kids'),
			...club,
			bundle,
			tucked('swim', 'lena'),
			{ ...tucked('andy', 'juri') }
		]);

		explorer.highlightNeighborhood('kids');

		expect(cy.$id('kids').hasClass('selected')).toBe(true);
		expect(cy.$id('lena').hasClass('faded')).toBe(false);
		expect(cy.$id('andy-juri').hasClass('highlight')).toBe(true);
		expect(cy.$id('andy').hasClass('faded')).toBe(false);
		// The bundle already joins the group to its circle; a line per member would only repeat it.
		expect(cy.$id('swim>kids').hasClass('highlight')).toBe(true);
		expect(cy.$id('swim-lena').hasClass('highlight')).toBe(false);
	});

	it('keeps the group of a person on a traced path lit', () => {
		const cy = core();
		const explorer = controller(cy);
		explorer.setGraph([group('kids'), ...club, edge('andy', 'lena')]);

		explorer.highlightPath(['andy', 'lena']);

		expect(cy.$id('kids').hasClass('faded')).toBe(false);
		expect(cy.$id('andy-lena').hasClass('onpath')).toBe(true);
	});
});

describe('growing the lit names while zoomed out', () => {
	/** Two linked people drawn with a name size, the way the stylesheet sets it. */
	function namedPair() {
		return cytoscape({
			headless: true,
			styleEnabled: true,
			elements: [
				{ data: { id: 'a' }, classes: 'person', position: { x: 0, y: 0 } },
				{ data: { id: 'b' }, classes: 'person', position: { x: 120, y: 0 } },
				{ data: { id: 'c' }, classes: 'person', position: { x: 240, y: 0 } },
				{ data: { id: 'a-b', source: 'a', target: 'b' } }
			]
		});
	}
	const sheet = [{ selector: 'node.person', style: { 'font-size': 11 } }];
	const sizeOf = (cy: cytoscape.Core, id: string) => cy.$id(id).numericStyle('font-size');

	it('lights the selected person and their neighbours, or a traced path, and nobody else', () => {
		const cy = namedPair();
		const explorer = controller(cy);
		const lit = () =>
			cy
				.$(`.${LIT_CLASS}`)
				.nodes()
				.map((n) => n.id())
				.sort();

		explorer.highlightNeighborhood('a');
		expect(lit()).toEqual(['a', 'b']);
		explorer.highlightPath(['b', 'a']);
		expect(lit()).toEqual(['a', 'b']);
		explorer.highlightNeighborhood(null);
		expect(lit()).toEqual([]);
	});

	it('grows the lit names as the map zooms out, and lets them go back on zooming in', () => {
		const cy = namedPair();
		const explorer = controller(cy);
		explorer.setStylesheet(sheet, { growNames: true });
		explorer.highlightNeighborhood('a');

		cy.zoom(0.5);
		expect([sizeOf(cy, 'a'), sizeOf(cy, 'b'), sizeOf(cy, 'c')]).toEqual([22, 22, 11]);

		cy.zoom(1);
		expect(sizeOf(cy, 'a')).toBe(11);
	});

	it('grows nothing when the caller says not to, as in the family tree', () => {
		const cy = namedPair();
		const explorer = controller(cy);
		explorer.setStylesheet(sheet, { growNames: false });
		explorer.highlightNeighborhood('a');

		cy.zoom(0.5);
		expect(sizeOf(cy, 'a')).toBe(11);
	});

	it('grows at once when restyled while already zoomed out', () => {
		const cy = namedPair();
		const explorer = controller(cy);
		explorer.highlightNeighborhood('a');
		cy.zoom(0.5);

		explorer.setStylesheet(sheet, { growNames: true });
		expect(sizeOf(cy, 'a')).toBe(22);
	});
});

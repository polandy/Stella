import { describe, expect, it } from 'bun:test';
import type { CyElement } from './elements';
import { HOVERED_CLASS } from './stylesheet';
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

import { describe, expect, it } from 'bun:test';
import type { NodeSingular } from 'cytoscape';
import { controller, linkedPair } from './explorer-fixtures';
import { DRAGGED_LINE_CLASS, SLOT_CLASS } from './canvas-classes';
import type { Point } from '../layout/geometry';

/*
 * Dragging in the family tree (docs/dev/05 §5.8, `tree-dragging.ts`), driven through the events
 * Cytoscape's renderer emits for a drag: grab, a drag per step, free.
 */

const place = new Map([
	['a', { x: 0, y: 0 }],
	['b', { x: 120, y: 0 }]
]);

/** The renderer's drag of `node` to `to`, step by step. */
function dragTo(node: NodeSingular, to: Point, during: () => void = () => {}) {
	node.emit('grab');
	node.position(to);
	node.emit('drag');
	during();
	node.emit('free');
}

describe('dragging in the tree', () => {
	it('keeps the person to their row, hides their lines on the way, and reports the drop', () => {
		const cy = linkedPair();
		const drops: [string, Point][] = [];
		const explorer = controller(cy, { onDropNode: (id, at) => drops.push([id, at]) });
		explorer.arrangeAt({ positions: place, bows: new Map() }, { rowDrags: true });

		let hiddenOnTheWay = false;
		dragTo(cy.$id('a'), { x: 300, y: 90 }, () => {
			hiddenOnTheWay = cy.$id('a-b').hasClass(DRAGGED_LINE_CLASS);
		});

		expect(hiddenOnTheWay).toBe(true);
		expect(cy.$id('a-b').hasClass(DRAGGED_LINE_CLASS)).toBe(false);
		expect(drops).toEqual([['a', { x: 300, y: 0 }]]);
	});

	it('reports nothing for a tap that never moved', () => {
		const cy = linkedPair();
		const drops: string[] = [];
		const explorer = controller(cy, { onDropNode: (id) => drops.push(id) });
		explorer.arrangeAt({ positions: place, bows: new Map() }, { rowDrags: true });

		cy.$id('a').emit('grab');
		cy.$id('a').emit('free');

		expect(drops).toEqual([]);
	});

	it('keeps a missing parent’s slot where the tree put it, and reports no drop', () => {
		const cy = linkedPair();
		cy.$id('a').addClass(SLOT_CLASS);
		const drops: string[] = [];
		const explorer = controller(cy, { onDropNode: (id) => drops.push(id) });
		explorer.arrangeAt({ positions: place, bows: new Map() }, { rowDrags: true });

		let hiddenOnTheWay = false;
		dragTo(cy.$id('a'), { x: 300, y: 90 }, () => {
			hiddenOnTheWay = cy.$id('a-b').hasClass(DRAGGED_LINE_CLASS);
		});

		expect(hiddenOnTheWay).toBe(false);
		expect(cy.$id('a').position()).toEqual({ x: 0, y: 0 });
		expect(drops).toEqual([]);
	});

	it('takes the plus over a dragged person along with them, its short line still drawn', () => {
		// The slot `a` asks for a parent of `b`: its line runs from the slot down to the child.
		const cy = linkedPair();
		cy.$id('a').addClass(SLOT_CLASS);
		cy.$id('a-b').addClass(SLOT_CLASS);
		const explorer = controller(cy, { onDropNode: () => {} });
		const over = new Map([
			['a', { x: 120, y: -60 }],
			['b', { x: 120, y: 0 }]
		]);
		explorer.arrangeAt({ positions: over, bows: new Map() }, { rowDrags: true });

		let lineOnTheWay = true;
		dragTo(cy.$id('b'), { x: 300, y: 40 }, () => {
			lineOnTheWay = !cy.$id('a-b').hasClass(DRAGGED_LINE_CLASS);
		});

		expect(cy.$id('a').position()).toEqual({ x: 300, y: -60 });
		expect(lineOnTheWay).toBe(true);
	});

	it('leaves a drag free in any other arrangement', () => {
		const cy = linkedPair();
		const drops: string[] = [];
		const explorer = controller(cy, { onDropNode: (id) => drops.push(id) });
		explorer.arrangeAt({ positions: place, bows: new Map() });

		dragTo(cy.$id('a'), { x: 300, y: 90 });

		expect(cy.$id('a').position()).toEqual({ x: 300, y: 90 });
		expect(drops).toEqual([]);
	});
});

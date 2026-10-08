import { describe, expect, it } from 'bun:test';
import cytoscape, { type Core } from 'cytoscape';
import { controller } from './explorer-fixtures';

/*
 * Entering or leaving full screen frames the map afresh for its new room (docs/05 §5.8) — once
 * the canvas has actually resized, and only while the view is still the one the map framed
 * itself. Exercised against a headless core whose size the test sets, standing in for the
 * container growing to fill the screen.
 */

/** Two people at known places on a canvas of the given size. */
function pairOn(size: { width: number; height: number }) {
	const cy = cytoscape({
		headless: true,
		elements: [
			{ data: { id: 'a' }, position: { x: 0, y: 0 } },
			{ data: { id: 'b' }, position: { x: 400, y: 0 } },
			{ data: { id: 'a-b', source: 'a', target: 'b' } }
		]
	});
	resizeTo(cy, size);
	const explorer = controller(cy);
	explorer.arrangeAt({
		positions: new Map([
			['a', { x: 0, y: 0 }],
			['b', { x: 400, y: 0 }]
		]),
		bows: new Map()
	});
	return { cy, explorer };
}

/** The container takes a new size; Cytoscape is told only when it notices, as `resize`. */
function resizeTo(cy: Core, size: { width: number; height: number }) {
	cy.width = () => size.width;
	cy.height = () => size.height;
}

/** Where the middle of the map is drawn. */
const middle = (cy: Core) => {
	const a = cy.$id('a').renderedPosition();
	const b = cy.$id('b').renderedPosition();
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

describe('reframing on a full-screen change', () => {
	it('frames the map afresh once the canvas has taken its full-screen size', () => {
		const { cy, explorer } = pairOn({ width: 1000, height: 400 });
		expect(middle(cy).x).toBeCloseTo(500);

		explorer.screenChanged();
		resizeTo(cy, { width: 2000, height: 1000 });
		// Not before the canvas has resized: the old size has nothing to say about the new one.
		expect(middle(cy).x).toBeCloseTo(500);
		cy.emit('resize');

		expect(middle(cy).x).toBeCloseTo(1000);
		expect(middle(cy).y).toBeCloseTo(500);
	});

	it('frames the map afresh at once when the canvas had resized before the change was heard', () => {
		const { cy, explorer } = pairOn({ width: 1000, height: 400 });
		resizeTo(cy, { width: 2000, height: 1000 });
		cy.emit('resize');
		expect(middle(cy).x).toBeCloseTo(500);

		explorer.screenChanged();

		expect(middle(cy).x).toBeCloseTo(1000);
		expect(middle(cy).y).toBeCloseTo(500);
	});

	it('keeps the view the reader dragged to', () => {
		const { cy, explorer } = pairOn({ width: 1000, height: 400 });
		cy.panBy({ x: 120, y: 30 });
		cy.emit('dragpan');
		const before = middle(cy);

		explorer.screenChanged();
		resizeTo(cy, { width: 2000, height: 1000 });
		cy.emit('resize');

		expect(middle(cy)).toEqual(before);
	});

	it('keeps the view the reader zoomed, by wheel or by pinch', () => {
		for (const gesture of ['scrollzoom', 'pinchzoom']) {
			const { cy, explorer } = pairOn({ width: 1000, height: 400 });
			cy.zoom(cy.zoom() * 1.5);
			cy.emit(gesture);
			const zoom = cy.zoom();

			explorer.screenChanged();
			resizeTo(cy, { width: 2000, height: 1000 });
			cy.emit('resize');

			expect(cy.zoom()).toBe(zoom);
		}
	});

	it('keeps the view the keyboard brought someone into', () => {
		const { cy, explorer } = pairOn({ width: 1000, height: 400 });
		// The reader has walked off the edge of the view; the view followed the keyboard.
		cy.pan({ x: -2000, y: 0 });
		explorer.markCursor('a');
		const before = middle(cy);

		explorer.screenChanged();
		resizeTo(cy, { width: 2000, height: 1000 });
		cy.emit('resize');

		expect(middle(cy)).toEqual(before);
	});

	it('follows again once the map is arranged afresh', () => {
		const { cy, explorer } = pairOn({ width: 1000, height: 400 });
		cy.emit('dragpan');
		explorer.arrangeAt({
			positions: new Map([
				['a', { x: 0, y: 0 }],
				['b', { x: 400, y: 0 }]
			]),
			bows: new Map()
		});

		explorer.screenChanged();
		resizeTo(cy, { width: 2000, height: 1000 });
		cy.emit('resize');

		expect(middle(cy).x).toBeCloseTo(1000);
	});

	it('leaves the view alone on a resize no full-screen change asked for', () => {
		const { cy } = pairOn({ width: 1000, height: 400 });
		resizeTo(cy, { width: 2000, height: 1000 });
		cy.emit('resize');

		expect(middle(cy).x).toBeCloseTo(500);
	});
});

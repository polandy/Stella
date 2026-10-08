import { describe, expect, it } from 'bun:test';
import cytoscape from 'cytoscape';
import { bendLines, CAPTION_ID, writeCaption } from './tree-canvas';
import { BOWED_CLASS, CAPTION_CLASS, ROUTE_FIELDS, ROUTED_CLASS } from './stylesheet';

/*
 * The arranged maps' lines and the family tree's caption, against a headless core (docs/05
 * §5.8). The controller's own cases (`explorer.test.ts`) cover how it calls these; here, what
 * each leaves on the canvas.
 */

function core() {
	return cytoscape({
		headless: true,
		elements: [
			{ data: { id: 'a' }, position: { x: 0, y: 0 } },
			{ data: { id: 'b' }, position: { x: 200, y: 230 } },
			{ data: { id: 'c' }, position: { x: 400, y: 230 } },
			{ data: { id: 'a-b', source: 'a', target: 'b' } },
			{ data: { id: 'a-c', source: 'a', target: 'c' } }
		]
	});
}

describe('bendLines', () => {
	it('routes the lines it is given, bows the others it is given, and straightens the rest', () => {
		const cy = core();
		const route = {
			waypoints: [
				{ x: 0, y: 126 },
				{ x: 200, y: 126 }
			],
			nameEnd: 'target' as const
		};

		bendLines(cy, { bows: new Map([['a-c', 40]]), routes: new Map([['a-b', route]]) }, (n) =>
			n.position()
		);

		expect(cy.$id('a-b').hasClass(ROUTED_CLASS)).toBe(true);
		expect(cy.$id('a-b').data(ROUTE_FIELDS.nameEnd)).toBe('target');
		expect(cy.$id('a-c').hasClass(BOWED_CLASS)).toBe(true);

		bendLines(cy, { bows: new Map() }, (n) => n.position());

		expect(cy.$id('a-b').hasClass(ROUTED_CLASS)).toBe(false);
		expect(cy.$id('a-c').hasClass(BOWED_CLASS)).toBe(false);
	});
});

describe('writeCaption', () => {
	it('writes one caption above where the shelf begins, and renames it in place', () => {
		const cy = core();

		const placed = writeCaption(cy, { x: 0, y: 500 }, 'Outside the family');
		writeCaption(cy, { x: 0, y: 500 }, 'Außerhalb der Familie');

		const caption = cy.$id(CAPTION_ID);
		expect(cy.nodes(`.${CAPTION_CLASS}`).length).toBe(1);
		expect(caption.data('label')).toBe('Außerhalb der Familie');
		expect(placed.get(CAPTION_ID)!.y).toBeLessThan(500);
		expect(caption.grabbable()).toBe(false);
	});

	it('takes the caption away when there is no shelf or nothing to say', () => {
		const cy = core();
		writeCaption(cy, { x: 0, y: 500 }, 'Outside the family');

		expect(writeCaption(cy, undefined, 'Outside the family').size).toBe(0);
		expect(cy.$id(CAPTION_ID).empty()).toBe(true);
		expect(cy.nodes().length).toBe(3);
	});
});

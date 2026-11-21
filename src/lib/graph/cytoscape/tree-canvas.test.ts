import { describe, expect, it } from 'bun:test';
import cytoscape from 'cytoscape';
import { bendLines, CAPTION_ID, CAPTION_RULE_ID, writeBridges, writeCaption } from './tree-canvas';
import {
	BOWED_CLASS,
	BRIDGE_CLASS,
	BRIDGE_OVER_CLASS,
	DOTTED_CLASS,
	CAPTION_CLASS,
	CAPTION_RULE_CLASS,
	ROUTE_FIELDS,
	ROUTED_CLASS
} from './canvas-classes';

/*
 * The arranged maps' lines and the family tree's caption, against a headless core (docs/dev/05
 * §5.8). The controller's own cases (`explorer-arranging.test.ts`) cover how it calls these; here, what
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

	it('dots exactly the lines it is told to, and undots them on the next arrangement', () => {
		const cy = core();

		bendLines(cy, { bows: new Map(), dottedLines: new Set(['a-c']) }, (n) => n.position());

		expect(cy.$id('a-c').hasClass(DOTTED_CLASS)).toBe(true);
		expect(cy.$id('a-b').hasClass(DOTTED_CLASS)).toBe(false);

		bendLines(cy, { bows: new Map() }, (n) => n.position());

		expect(cy.$id('a-c').hasClass(DOTTED_CLASS)).toBe(false);
	});
});

describe('writeCaption', () => {
	it('writes one caption above where the shelf begins, and renames it in place', () => {
		const cy = core();

		const placed = writeCaption(cy, { x: 0, y: 500, width: 900 }, 'Outside the family');
		writeCaption(cy, { x: 0, y: 500, width: 900 }, 'Außerhalb der Familie');

		const caption = cy.$id(CAPTION_ID);
		expect(cy.nodes(`.${CAPTION_CLASS}`).length).toBe(2);
		expect(caption.data('label')).toBe('Außerhalb der Familie');
		expect(placed.get(CAPTION_ID)!.y).toBeLessThan(500);
		expect(caption.grabbable()).toBe(false);
	});

	it('runs a thin rule across the family’s width over the caption', () => {
		const cy = core();

		const placed = writeCaption(cy, { x: 0, y: 500, width: 900 }, 'Outside the family');
		writeCaption(cy, { x: 0, y: 500, width: 700 }, 'Outside the family');

		const rule = cy.$id(CAPTION_RULE_ID);
		expect(rule.hasClass(CAPTION_RULE_CLASS)).toBe(true);
		expect(rule.hasClass(CAPTION_CLASS)).toBe(true);
		expect(rule.data('width')).toBe(700);
		expect(placed.get(CAPTION_RULE_ID)).toEqual({ x: 450, y: placed.get(CAPTION_ID)!.y - 16 });
		expect(rule.grabbable()).toBe(false);
	});

	it('takes the caption away when there is no shelf or nothing to say', () => {
		const cy = core();
		writeCaption(cy, { x: 0, y: 500, width: 900 }, 'Outside the family');

		expect(writeCaption(cy, undefined, 'Outside the family').size).toBe(0);
		expect(cy.$id(CAPTION_ID).empty()).toBe(true);
		expect(cy.$id(CAPTION_RULE_ID).empty()).toBe(true);
		expect(cy.nodes().length).toBe(3);
	});
});

describe('writeBridges', () => {
	const bridge = { at: { x: 200, y: 126 }, over: ['a-c'] };

	it('masks the bar under each bridge and lifts the crossing line over the mask', () => {
		const cy = core();

		const placed = writeBridges(cy, [bridge]);

		const mask = cy.nodes(`.${BRIDGE_CLASS}`)[0];
		expect(cy.nodes(`.${BRIDGE_CLASS}`).length).toBe(1);
		expect(mask.hasClass(CAPTION_CLASS)).toBe(true);
		expect(mask.grabbable()).toBe(false);
		expect(placed.get(mask.id())).toEqual({ x: 200, y: 126 });
		expect(cy.$id('a-c').hasClass(BRIDGE_OVER_CLASS)).toBe(true);
		expect(cy.$id('a-b').hasClass(BRIDGE_OVER_CLASS)).toBe(false);
	});

	it('takes the masks away, and lowers the line again, once no line crosses', () => {
		const cy = core();
		writeBridges(cy, [bridge]);

		expect(writeBridges(cy, undefined).size).toBe(0);
		expect(cy.nodes(`.${BRIDGE_CLASS}`).empty()).toBe(true);
		expect(cy.$id('a-c').hasClass(BRIDGE_OVER_CLASS)).toBe(false);
		expect(cy.nodes().length).toBe(3);
	});
});

import { describe, expect, it } from 'bun:test';
import {
	node,
	core,
	linkedPair,
	controller,
	layoutNames,
	containerStub,
	coreWithContainer,
	layoutStub,
	announce
} from './explorer-fixtures';

/*
 * The controller's lifecycle, exercised against a headless Cytoscape core — the same core the
 * canvas adapter drives, minus the renderer. What is under test is not the drawing but the
 * teardown: a graph lives inside a page that can be navigated away from at any moment, and a
 * call still in flight when that happens must find a closed door rather than a half-demolished
 * one. Unguarded, Cytoscape throws on the renderer it no longer has (docs/04 §4.11).
 *
 * Layouts overlap: tidying the map up re-arranges it while the opening arrangement may still
 * be moving the nodes. Both of them are still running, so both have to be accounted for — at
 * teardown, and in the settled signal the canvas publishes (`motion.ts`).
 *
 * The controller's other parts have their own cases beside this one: `explorer-arranging`,
 * `explorer-framing`, `explorer-graph-diff`, `explorer-highlighting` and `explorer-reframe`.
 */

describe('explorerFromCore', () => {
	it('drives the core it was handed', () => {
		const cy = core();
		const explorer = controller(cy);

		explorer.setGraph([node('a'), node('b'), node('c')]);
		expect(
			cy
				.nodes()
				.map((n) => n.id())
				.sort()
		).toEqual(['a', 'b', 'c']);

		explorer.setVisible(new Set(['a']), new Set());
		expect(cy.$id('a').hasClass('filtered-out')).toBe(false);
		expect(cy.$id('b').hasClass('filtered-out')).toBe(true);

		explorer.highlightNeighborhood('a');
		expect(cy.$id('a').hasClass('selected')).toBe(true);
	});

	it('arranges the graph itself, rather than leaving the first layout to the constructor', () => {
		const cy = core();
		const names = layoutNames(cy);

		controller(cy);

		// Worked out by the forces, then set in place.
		expect(names).toEqual(['cose', 'preset']);
	});

	it('measures how much room each node takes', () => {
		const cy = linkedPair();
		const explorer = controller(cy);

		const size = explorer.sizeOf('a');

		expect(size.width).toBeGreaterThan(0);
		expect(size.height).toBeGreaterThan(0);
	});

	it('destroys the core once, however often it is asked', () => {
		const cy = core();
		const explorer = controller(cy);

		explorer.destroy();
		expect(cy.destroyed()).toBe(true);
		explorer.destroy();
		expect(cy.destroyed()).toBe(true);
	});

	it('stops a layout that is still running, so no frame lands after the core is gone', () => {
		const cy = core();
		const explorer = controller(cy);
		const stopped: string[] = [];
		announce(cy, 'layoutstart', layoutStub('running', stopped));

		explorer.destroy();

		expect(stopped).toEqual(['running']);
	});

	it('stops every layout that has started, not only the most recent one', () => {
		// A tidy-up re-lays out while the opening arrangement is still moving the nodes, so two
		// layouts are in flight at once. Tracking only the last one leaves the first ticking
		// against a core that is already gone — the very thing the teardown exists to prevent.
		const cy = core();
		const explorer = controller(cy);
		const stopped: string[] = [];
		announce(cy, 'layoutstart', layoutStub('opening', stopped));
		announce(cy, 'layoutstart', layoutStub('tidy', stopped));

		explorer.destroy();

		expect(stopped.sort()).toEqual(['opening', 'tidy']);
	});

	it('leaves a layout that has already come to rest alone', () => {
		const cy = core();
		const explorer = controller(cy);
		const stopped: string[] = [];
		const settledLayout = layoutStub('settled', stopped);
		announce(cy, 'layoutstart', settledLayout);
		announce(cy, 'layoutstop', settledLayout);

		explorer.destroy();

		expect(stopped).toEqual([]);
	});

	it('keeps the canvas marked as moving until the last layout has stopped', () => {
		// The e2e suite reads node positions as soon as this says `settled`, so one layout
		// finishing while another still moves the nodes would hand it a canvas mid-flight.
		const container = containerStub();
		const cy = coreWithContainer(container.element);
		const stopped: string[] = [];
		const opening = layoutStub('opening', stopped);
		const tidy = layoutStub('tidy', stopped);

		controller(cy);
		expect(container.layoutState()).toBe('settling');

		announce(cy, 'layoutstart', opening);
		announce(cy, 'layoutstart', tidy);
		announce(cy, 'layoutstop', opening);
		expect(container.layoutState()).toBe('settling');

		announce(cy, 'layoutstop', tidy);
		expect(container.layoutState()).toBe('settled');
	});

	it('lets every call that arrives after the teardown fall away', () => {
		const cy = core();
		const explorer = controller(cy);
		explorer.destroy();

		// Each of these reaches Cytoscape through a batch or an animation, and a torn-down core
		// has no renderer left to notify — unguarded, setGraph alone throws here.
		expect(() => {
			explorer.setGraph([node('a'), node('c')]);
			explorer.setVisible(new Set(['a']), new Set());
			explorer.highlightNeighborhood('a');
			explorer.highlightPath(['a', 'b']);
			explorer.focus('a');
			explorer.setStylesheet([]);
			explorer.arrange();
			explorer.arrangeAt({ positions: new Map([['a', { x: 1, y: 1 }]]), bows: new Map() });
		}).not.toThrow();
	});
});

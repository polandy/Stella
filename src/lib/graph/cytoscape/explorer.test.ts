import { describe, expect, it } from 'bun:test';
import cytoscape, { type Core, type Layouts } from 'cytoscape';
import { explorerFromCore } from './explorer';
import type { CyElement } from './elements';

/*
 * The controller's lifecycle, exercised against a headless Cytoscape core — the same core the
 * canvas adapter drives, minus the renderer. What is under test is not the drawing but the
 * teardown: a graph lives inside a page that can be navigated away from at any moment, and a
 * call still in flight when that happens must find a closed door rather than a half-demolished
 * one. Unguarded, Cytoscape throws on the renderer it no longer has (docs/04 §4.11).
 *
 * Layouts overlap: tidying the map up re-arranges it while the opening arrangement may still
 * be moving the nodes. Both of them are still running, so both have to be accounted for — at
 * teardown, and in the settled signal the canvas publishes.
 */

const node = (id: string): CyElement => ({ group: 'nodes', data: { id }, classes: 'person' });

/** Reads back the layout state the controller writes onto the container it was given. */
function containerStub() {
	const attributes: Record<string, string> = {};
	return {
		element: {
			setAttribute: (name: string, value: string) => {
				attributes[name] = value;
			}
		} as unknown as HTMLElement,
		layoutState: () => attributes['data-layout']
	};
}

const edge = (source: string, target: string): CyElement => ({
	group: 'edges',
	data: { id: `${source}-${target}`, source, target },
	classes: ''
});

/** Two linked people at known places, the way a settled canvas holds them. */
function linkedPair(): Core {
	return cytoscape({
		headless: true,
		elements: [
			{ data: { id: 'a' }, position: { x: 0, y: 0 } },
			{ data: { id: 'b' }, position: { x: 120, y: 0 } },
			{ data: { id: 'a-b', source: 'a', target: 'b' } }
		]
	});
}

/** Counts every layout the controller asks the core for. */
function countLayouts(cy: Core): () => number {
	let layouts = 0;
	const real = cy.layout.bind(cy);
	cy.layout = ((options: Parameters<Core['layout']>[0]) => {
		layouts++;
		return real(options);
	}) as Core['layout'];
	return () => layouts;
}

function positionsOf(cy: Core, ids: string[]) {
	return ids.map((id) => ({ ...cy.$id(id).position() }));
}

function core(): Core {
	return cytoscape({ headless: true, elements: [{ data: { id: 'a' } }, { data: { id: 'b' } }] });
}

/**
 * A core that reports a container and whose layouts do nothing. Cose measures a real container
 * through the window, which a headless test has none of; these cases are about the signal the
 * canvas publishes, not about the arrangement, so the layouts are stood down.
 */
function coreWithContainer(container: HTMLElement): Core {
	const cy = cytoscape({
		headless: true,
		container,
		elements: [{ data: { id: 'a' } }]
	});
	cy.layout = (() => ({ run: () => {}, stop: () => {} })) as unknown as Core['layout'];
	return cy;
}

function controller(cy: Core) {
	return explorerFromCore(cy, {
		reducedMotion: true,
		onTapNode: () => {},
		onTapBackground: () => {}
	});
}

/** A layout that records being stopped, standing in for one Cytoscape is still running. */
function layoutStub(name: string, stopped: string[]): Layouts {
	return { stop: () => stopped.push(name) } as unknown as Layouts;
}

/** Cytoscape carries the layout instance on both of its lifecycle events; do the same here. */
function announce(cy: Core, type: 'layoutstart' | 'layoutstop', layout: Layouts) {
	(cy.emit as unknown as (event: object) => void)({ type, layout });
}

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
		let layouts = 0;
		const real = cy.layout.bind(cy);
		cy.layout = ((options: Parameters<Core['layout']>[0]) => {
			layouts++;
			return real(options);
		}) as Core['layout'];

		controller(cy);

		expect(layouts).toBe(1);
	});

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

	it('runs no layout for an expand, so nothing re-frames the view', () => {
		const cy = linkedPair();
		const layouts = countLayouts(cy);
		const explorer = controller(cy);

		explorer.setGraph([node('a'), node('b'), node('c'), edge('a', 'b'), edge('b', 'c')]);

		// Only the opening arrangement; the expand placed c without one.
		expect(layouts()).toBe(1);
		expect(cy.$id('c').nonempty()).toBe(true);
	});

	it('arranges nothing when people only leave the canvas', () => {
		const cy = linkedPair();
		const layouts = countLayouts(cy);
		const explorer = controller(cy);
		const before = positionsOf(cy, ['a']);

		explorer.setGraph([node('a')]);

		expect(cy.$id('b').empty()).toBe(true);
		expect(layouts()).toBe(1);
		expect(positionsOf(cy, ['a'])).toEqual(before);
	});

	it('tidies the whole map on request, framing it again', () => {
		const cy = linkedPair();
		const fits: unknown[] = [];
		const real = cy.layout.bind(cy);
		cy.layout = ((options: Parameters<Core['layout']>[0]) => {
			fits.push((options as { fit?: unknown }).fit);
			return real(options);
		}) as Core['layout'];
		const explorer = controller(cy);

		explorer.arrange();

		expect(fits).toEqual([true, true]);
	});

	it('glides the map into its tidied arrangement instead of showing every step', () => {
		const cy = linkedPair();
		const asked: Record<string, unknown>[] = [];
		cy.layout = ((options: Record<string, unknown>) => {
			asked.push(options);
			return { run: () => {}, stop: () => {} };
		}) as unknown as Core['layout'];
		const explorer = explorerFromCore(cy, {
			reducedMotion: false,
			onTapNode: () => {},
			onTapBackground: () => {}
		});

		explorer.arrange();

		const tidy = asked[asked.length - 1];
		expect(tidy.animate).toBe('end');
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
		const explorer = explorerFromCore(cy, {
			reducedMotion: false,
			onTapNode: () => {},
			onTapBackground: () => {}
		});

		explorer.arrangeAt({ positions: new Map([['a', { x: 500, y: 700 }]]), bows: new Map() });

		const handed = asked[asked.length - 1];
		expect(handed.name).toBe('preset');
		expect(handed.animate).toBe(true);
		expect(handed.fit).toBe(true);
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

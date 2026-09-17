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
 * Layouts overlap: an expand re-arranges the graph while the opening arrangement is still
 * moving the nodes. Both of them are still running, so both have to be accounted for — at
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
		// An expand re-lays out while the opening arrangement is still moving the nodes, so two
		// layouts are in flight at once. Tracking only the last one leaves the first ticking
		// against a core that is already gone — the very thing the teardown exists to prevent.
		const cy = core();
		const explorer = controller(cy);
		const stopped: string[] = [];
		announce(cy, 'layoutstart', layoutStub('opening', stopped));
		announce(cy, 'layoutstart', layoutStub('expand', stopped));

		explorer.destroy();

		expect(stopped.sort()).toEqual(['expand', 'opening']);
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
		const expand = layoutStub('expand', stopped);

		controller(cy);
		expect(container.layoutState()).toBe('settling');

		announce(cy, 'layoutstart', opening);
		announce(cy, 'layoutstart', expand);
		announce(cy, 'layoutstop', opening);
		expect(container.layoutState()).toBe('settling');

		announce(cy, 'layoutstop', expand);
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
		}).not.toThrow();
	});
});

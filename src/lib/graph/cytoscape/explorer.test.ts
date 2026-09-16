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
 */

const node = (id: string): CyElement => ({ group: 'nodes', data: { id }, classes: 'person' });

function core(ids: string[] = ['a', 'b']): Core {
	return cytoscape({ headless: true, elements: ids.map((id) => ({ data: { id } })) });
}

function controller(cy: Core) {
	return explorerFromCore(cy, {
		reducedMotion: true,
		onTapNode: () => {},
		onTapBackground: () => {}
	});
}

/** Cytoscape carries the layout instance on its own lifecycle events; stand one in here. */
function announceLayoutStart(cy: Core, layout: Pick<Layouts, 'stop'>) {
	(cy.emit as unknown as (event: object) => void)({ type: 'layoutstart', layout });
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
		let stops = 0;
		announceLayoutStart(cy, { stop: () => ++stops as unknown as Layouts });

		explorer.destroy();

		expect(stops).toBe(1);
	});

	it('leaves a layout that has already come to rest alone', () => {
		const cy = core();
		const explorer = controller(cy);
		let stops = 0;
		announceLayoutStart(cy, { stop: () => ++stops as unknown as Layouts });
		cy.emit('layoutstop');

		explorer.destroy();

		expect(stops).toBe(0);
	});

	it('lets every call that arrives after the teardown fall away', () => {
		const cy = core();
		const explorer = controller(cy);
		explorer.destroy();

		// Each of these reaches Cytoscape through a batch or an animation, and a torn-down core
		// has no renderer left to notify — unguarded, setGraph alone throws here.
		explorer.setGraph([node('a'), node('c')]);
		explorer.setVisible(new Set(['a']), new Set());
		explorer.highlightNeighborhood('a');
		explorer.highlightPath(['a', 'b']);
		explorer.focus('a');
		explorer.setStylesheet([]);

		expect(cy.destroyed()).toBe(true);
	});
});

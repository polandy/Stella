import cytoscape, { type Core, type Layouts } from 'cytoscape';
import { explorerFromCore, type ControllerOptions } from './explorer';
import type { CyElement } from './elements';

/*
 * The headless Cytoscape cores the controller's cases run against (`explorer*.test.ts`) — the
 * same core the canvas adapter drives, minus the renderer — and the elements they hand it.
 */

export const node = (id: string): CyElement => ({
	group: 'nodes',
	data: { id },
	classes: 'person'
});

export const edge = (source: string, target: string): CyElement => ({
	group: 'edges',
	data: { id: `${source}-${target}`, source, target },
	classes: ''
});

/** The frame of a group by role. */
export const group = (id: string): CyElement => ({
	group: 'nodes',
	data: { id, kind: 'group' },
	classes: 'role-group'
});

export const inGroup = (id: string, parent: string): CyElement => ({
	group: 'nodes',
	data: { id, parent },
	classes: 'person'
});

/** A line a group's bundle stands for. */
export const tucked = (source: string, target: string): CyElement => ({
	...edge(source, target),
	classes: 'tucked'
});

/** A circle with a group of two kids in it. */
export const club = [node('swim'), node('andy'), inGroup('lena', 'kids'), inGroup('juri', 'kids')];

/** Two unlinked people, both where the constructor put them. */
export function core(): Core {
	return cytoscape({ headless: true, elements: [{ data: { id: 'a' } }, { data: { id: 'b' } }] });
}

/** Two linked people at known places, the way a settled canvas holds them. */
export function linkedPair(): Core {
	return cytoscape({
		headless: true,
		elements: [
			{ data: { id: 'a' }, position: { x: 0, y: 0 } },
			{ data: { id: 'b' }, position: { x: 120, y: 0 } },
			{ data: { id: 'a-b', source: 'a', target: 'b' } }
		]
	});
}

/** An empty core whose nodes have the sizes a style gives — a group's frame is sized from them. */
export function styledCore(): Core {
	return cytoscape({
		headless: true,
		styleEnabled: true,
		style: [{ selector: 'node', style: { width: 30, height: 30 } }]
	});
}

/** The controller over `cy`, under reduced motion unless `options` say otherwise. */
export function controller(cy: Core, options: Partial<ControllerOptions> = {}) {
	return explorerFromCore(cy, {
		reducedMotion: true,
		onTapNode: () => {},
		onTapBackground: () => {},
		...options
	});
}

export function positionsOf(cy: Core, ids: string[]) {
	return ids.map((id) => ({ ...cy.$id(id).position() }));
}

/** Records the name of every layout the controller asks the core for, in order. */
export function layoutNames(cy: Core): string[] {
	const names: string[] = [];
	const real = cy.layout.bind(cy);
	cy.layout = ((options: Parameters<Core['layout']>[0]) => {
		names.push((options as { name: string }).name);
		return real(options);
	}) as Core['layout'];
	return names;
}

/** Records the options of every layout the controller asks for, and runs none of them. */
export function stubLayouts(cy: Core): Record<string, unknown>[] {
	const asked: Record<string, unknown>[] = [];
	cy.layout = ((options: Record<string, unknown>) => {
		asked.push(options);
		return { run: () => {}, stop: () => {} };
	}) as unknown as Core['layout'];
	return asked;
}

/** Reads back the layout state the controller writes onto the container it was given. */
export function containerStub() {
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

/**
 * A core that reports a container and whose layouts do nothing. Cose measures a real container
 * through the window, which a headless test has none of; these cases are about the signal the
 * canvas publishes, not about the arrangement, so the layouts are stood down.
 */
export function coreWithContainer(container: HTMLElement): Core {
	const cy = cytoscape({
		headless: true,
		container,
		elements: [{ data: { id: 'a' } }]
	});
	cy.layout = (() => ({ run: () => {}, stop: () => {} })) as unknown as Core['layout'];
	// The stub container has no size to measure, so there is no view to frame either.
	cy.width = () => 0;
	cy.height = () => 0;
	return cy;
}

/** A layout that records being stopped, standing in for one Cytoscape is still running. */
export function layoutStub(name: string, stopped: string[]): Layouts {
	return { stop: () => stopped.push(name) } as unknown as Layouts;
}

/** Cytoscape carries the layout instance on both of its lifecycle events; do the same here. */
export function announce(cy: Core, type: 'layoutstart' | 'layoutstop', layout: Layouts) {
	(cy.emit as unknown as (event: object) => void)({ type, layout });
}

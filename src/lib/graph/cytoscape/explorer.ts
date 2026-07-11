import type { Core, CytoscapeOptions, ElementDefinition, LayoutOptions } from 'cytoscape';
import type { CyElement } from './elements';
import type { CyStyle } from './stylesheet';

/*
 * Imperative Cytoscape controller — the one place the library is touched, and it is dynamically
 * imported so the ~400 KB engine only loads on the explorer route (docs/04 §4.11). It holds no
 * domain rules: callers pass in already-built elements/visibility (from the pure model
 * operations) and it renders, lays out, highlights, and reports taps back. Swapping renderers
 * would touch only this file.
 */

export interface ExplorerHandlers {
	onTapNode: (id: string) => void;
	onTapBackground: () => void;
}

export interface ExplorerOptions extends ExplorerHandlers {
	container: HTMLElement;
	elements: CyElement[];
	stylesheet: CyStyle[];
	reducedMotion: boolean;
}

export interface ExplorerController {
	/** Reconcile the full (expanded) element set; re-layouts only when nodes were added. */
	setGraph(elements: CyElement[]): void;
	/** Show only these node/edge ids (filtering), without a re-layout. */
	setVisible(nodeIds: Set<string>, edgeIds: Set<string>): void;
	/** Dim everything except the node and its immediate neighbourhood (null clears). */
	highlightNeighborhood(nodeId: string | null): void;
	/** Emphasise a connection path and dim the rest (null clears). */
	highlightPath(nodeIds: string[] | null): void;
	/** Smoothly centre and zoom onto a node. */
	focus(nodeId: string): void;
	/** Re-theme the canvas from a freshly-resolved palette. */
	setStylesheet(stylesheet: CyStyle[]): void;
	destroy(): void;
}

function layout(reducedMotion: boolean): LayoutOptions {
	return {
		name: 'cose',
		animate: !reducedMotion,
		randomize: false, // start from current positions so expansion stays gentle
		fit: true,
		padding: 48,
		nodeRepulsion: () => 8000,
		idealEdgeLength: () => 90,
		nodeDimensionsIncludeLabels: true
	} as LayoutOptions;
}

export async function createExplorer(opts: ExplorerOptions): Promise<ExplorerController> {
	const cytoscape = (await import('cytoscape')).default;

	const cy: Core = cytoscape({
		container: opts.container,
		elements: opts.elements as unknown as ElementDefinition[],
		style: opts.stylesheet as unknown as CytoscapeOptions['style'],
		layout: layout(opts.reducedMotion),
		minZoom: 0.2,
		maxZoom: 2.5,
		wheelSensitivity: 0.25,
		boxSelectionEnabled: false
	});

	cy.on('tap', 'node', (e) => opts.onTapNode(e.target.id()));
	cy.on('tap', (e) => {
		if (e.target === cy) opts.onTapBackground();
	});

	const duration = opts.reducedMotion ? 0 : 350;

	return {
		setGraph(elements) {
			const incoming = new Set(elements.map((e) => e.data.id as string));
			cy.batch(() => {
				cy.elements().forEach((el) => {
					if (!incoming.has(el.id())) el.remove();
				});
				const existing = new Set(cy.elements().map((el) => el.id()));
				const toAdd = elements.filter((e) => !existing.has(e.data.id as string));
				if (toAdd.length) cy.add(toAdd as unknown as ElementDefinition[]);
			});
			cy.layout(layout(opts.reducedMotion)).run();
		},

		setVisible(nodeIds, edgeIds) {
			cy.batch(() => {
				cy.nodes().forEach((n) => {
					n.toggleClass('filtered-out', !nodeIds.has(n.id()));
				});
				cy.edges().forEach((e) => {
					e.toggleClass('filtered-out', !edgeIds.has(e.id()));
				});
			});
		},

		highlightNeighborhood(nodeId) {
			cy.elements().removeClass('faded highlight selected onpath');
			if (!nodeId) return;
			const node = cy.$id(nodeId);
			if (node.empty()) return;
			const hood = node.closedNeighborhood();
			cy.elements().not(hood).addClass('faded');
			hood.edges().addClass('highlight');
			node.addClass('selected');
		},

		highlightPath(nodeIds) {
			cy.elements().removeClass('faded highlight selected onpath');
			if (!nodeIds || nodeIds.length === 0) return;
			let path = cy.collection();
			for (let i = 0; i < nodeIds.length; i++) {
				const node = cy.$id(nodeIds[i]);
				path = path.union(node);
				if (i > 0) path = path.union(cy.$id(nodeIds[i - 1]).edgesWith(node));
			}
			cy.elements().not(path).addClass('faded');
			path.addClass('onpath');
		},

		focus(nodeId) {
			const node = cy.$id(nodeId);
			if (node.empty()) return;
			cy.animate({ center: { eles: node }, zoom: 1.3 }, { duration });
		},

		setStylesheet(stylesheet) {
			cy.style(stylesheet as unknown as Parameters<typeof cy.style>[0]);
		},

		destroy() {
			cy.destroy();
		}
	};
}

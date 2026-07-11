import type { GraphModel } from '../model/types';

/*
 * Translate the neutral GraphModel into Cytoscape element definitions (docs/04 §4.11). This
 * is the only place the model's shape meets the renderer's; it is pure data-in/data-out so it
 * unit-tests without loading Cytoscape. No domain rules live here — styling is in stylesheet.ts.
 */

/** A deterministic accent per person, so a face keeps its colour across views (docs/05 §5.10). */
const NODE_ACCENTS = [
	'mauve', 'blue', 'green', 'peach', 'pink', 'teal', 'sky', 'yellow', 'maroon', 'rosewater', 'sapphire'
] as const;

export function accentFor(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
	return NODE_ACCENTS[hash % NODE_ACCENTS.length];
}

/** Minimal Cytoscape element shape (avoids importing the library into pure code/tests). */
export interface CyElement {
	group: 'nodes' | 'edges';
	data: Record<string, unknown>;
	classes: string;
}

export interface ElementOptions {
	centerId?: string;
}

export function toCytoscapeElements(model: GraphModel, options: ElementOptions = {}): CyElement[] {
	const present = new Set(model.nodes.map((n) => n.id));

	// degree drives node size (docs/05 §5.8), counting only edges we will actually draw
	const degree = new Map<string, number>();
	for (const e of model.edges) {
		if (!present.has(e.source) || !present.has(e.target)) continue;
		degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
		degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
	}

	const nodes: CyElement[] = model.nodes.map((n) => {
		const classes = [n.kind === 'circle' ? 'circle' : 'person'];
		if (n.id === options.centerId) classes.push('center');
		if (n.deceased) classes.push('deceased');
		return {
			group: 'nodes',
			data: {
				id: n.id,
				label: n.label,
				kind: n.kind,
				accent: n.kind === 'circle' ? 'lavender' : accentFor(n.id),
				degree: degree.get(n.id) ?? 0
			},
			classes: classes.join(' ')
		};
	});

	const edges: CyElement[] = model.edges
		.filter((e) => present.has(e.source) && present.has(e.target))
		.map((e) => ({
			group: 'edges',
			data: {
				id: e.id,
				source: e.source,
				target: e.target,
				kind: e.kind,
				category: e.category ?? '',
				label: e.label ?? '',
				directed: e.directed ? 1 : 0
			},
			classes: e.derived ? 'derived' : ''
		}));

	return [...nodes, ...edges];
}

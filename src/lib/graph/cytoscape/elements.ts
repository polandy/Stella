import { avatarAccent } from '../../avatar';
import { thumbnailUrl } from '../../media/urls';
import type { EdgeBundle, RoleGroup, RoleGrouping } from '../model/role-groups';
import { TUCKED_CLASS } from './stylesheet';
import type { GraphEdge, GraphModel } from '../model/types';

/*
 * Translate the neutral GraphModel into Cytoscape element definitions (docs/04 §4.11). This
 * is the only place the model's shape meets the renderer's; it is pure data-in/data-out so it
 * unit-tests without loading Cytoscape. No domain rules live here — styling is in stylesheet.ts.
 */

/** The accent a circle node wears; people take the same accent as their avatar (docs/05 §5.10). */
const CIRCLE_ACCENT = 'lavender';

/** Minimal Cytoscape element shape (avoids importing the library into pure code/tests). */
export interface CyElement {
	group: 'nodes' | 'edges';
	data: Record<string, unknown>;
	classes: string;
}

export interface ElementOptions {
	centerId?: string;
	/**
	 * How an edge is worded. The model carries the label as it is stored; the caller knows
	 * the viewer's language and can translate a built-in relationship type (docs/02 §2.19).
	 */
	edgeLabel?: (edge: GraphEdge) => string;
	/** The circles grouped by role (docs/02 §2.7), and how a group and a bundle are named. */
	grouping?: {
		grouping: RoleGrouping;
		groupLabel: (group: RoleGroup) => string;
		bundleLabel: (bundle: EdgeBundle) => string;
	};
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
		const parent = options.grouping?.grouping.groupOf.get(n.id);
		const photo = n.kind === 'person' && n.avatarPhotoId ? thumbnailUrl(n.avatarPhotoId) : null;
		if (photo) classes.push('has-photo');
		return {
			group: 'nodes',
			data: {
				id: n.id,
				label: n.label,
				kind: n.kind,
				accent: n.kind === 'circle' ? CIRCLE_ACCENT : avatarAccent(n.id),
				degree: degree.get(n.id) ?? 0,
				...(photo ? { photo } : {}),
				...(parent ? { parent } : {})
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
				label: options.edgeLabel ? options.edgeLabel(e) : (e.label ?? ''),
				directed: e.directed ? 1 : 0
			},
			classes: [
				e.derived ? 'derived' : '',
				options.grouping?.grouping.tucked.has(e.id) ? TUCKED_CLASS : ''
			]
				.filter(Boolean)
				.join(' ')
		}));

	if (!options.grouping) return [...nodes, ...edges];
	const { grouping, groupLabel, bundleLabel } = options.grouping;
	// A group is a frame its members stand in (a compound node), so it goes in before them.
	const groups: CyElement[] = grouping.groups.map((g) => ({
		group: 'nodes',
		data: { id: g.id, label: groupLabel(g), kind: 'group' },
		classes: 'role-group'
	}));
	const bundles: CyElement[] = grouping.bundles.map((b) => ({
		group: 'edges',
		data: {
			id: b.id,
			source: b.source,
			target: b.target,
			kind: b.kind,
			category: b.category ?? '',
			label: bundleLabel(b),
			count: b.edgeIds.length,
			directed: 0
		},
		classes: 'bundle'
	}));
	return [...groups, ...nodes, ...edges, ...bundles];
}

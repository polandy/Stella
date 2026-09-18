import type { KinTerm } from '../../kinship/kinship';
import {
	GRANDPARENT_GRANDCHILD_TYPE_KEY,
	PARENT_CHILD_TYPE_KEY,
	PARTNER_TYPE_KEYS,
	SIBLING_TYPE_KEY
} from '../../relationships/type-keys';
import type { GraphEdge, GraphModel } from './types';

/*
 * Which generation each person on the map belongs to — the rows of the family-tree
 * arrangement (docs/02 §2.7, docs/05 §5.8). Pure: read off the family links the model already
 * carries. The links a household enters decide first; the worked-out kinship lines only place
 * a relative the entered ones cannot reach, since on a partial map a cousin can arrive with
 * nothing but the dotted line.
 */

/** How many generations below the edge's source its target stands, per stored type. */
const STORED_OFFSET: Readonly<Record<string, number>> = {
	[PARENT_CHILD_TYPE_KEY]: 1,
	[GRANDPARENT_GRANDCHILD_TYPE_KEY]: 2,
	[SIBLING_TYPE_KEY]: 0,
	...Object.fromEntries(PARTNER_TYPE_KEYS.map((key) => [key, 0]))
};

/**
 * How many generations below the edge's source its target stands, per derived term. A kinship
 * edge runs from the relative to the subject and names the relative's role, so a grandparent
 * source stands two above its target.
 */
const KIN_OFFSET: Readonly<Record<KinTerm, number>> = {
	sibling: 0,
	'half-sibling': 0,
	grandparent: 2,
	grandchild: -2,
	'aunt-uncle': 1,
	'niece-nephew': -1,
	'great-grandparent': 3,
	'great-grandchild': -3,
	cousin: 0,
	'step-parent': 1,
	'step-child': -1,
	'step-sibling': 0,
	'parent-in-law': 1,
	'child-in-law': -1,
	'sibling-in-law': 0
};

/** Entered links are trusted before worked-out ones. */
const ENTERED = 0;
const WORKED_OUT = 1;

interface Constraint {
	from: string;
	to: string;
	/** Generation of `to` minus generation of `from`. */
	offset: number;
	priority: number;
}

function constraintOf(edge: GraphEdge): Constraint | null {
	if (edge.kind === 'relationship' && edge.typeKey !== undefined) {
		const offset = STORED_OFFSET[edge.typeKey];
		return offset === undefined
			? null
			: { from: edge.source, to: edge.target, offset, priority: ENTERED };
	}
	if (edge.kind === 'kinship' && edge.kin) {
		return {
			from: edge.source,
			to: edge.target,
			offset: KIN_OFFSET[edge.kin.term],
			priority: WORKED_OUT
		};
	}
	return null;
}

/**
 * The separate families on the map, each as its members' generations, 0 at the top of each.
 * Only people tied to someone by a family link belong to one; everyone else (and every circle)
 * is absent rather than guessed at. Links that contradict each other cannot all hold — the
 * first one reached wins, entered links before worked-out ones, so a map is always drawn.
 */
export function familiesOf(model: GraphModel): Map<string, number>[] {
	const present = new Set(model.nodes.map((n) => n.id));
	const constraints = model.edges
		.map(constraintOf)
		.filter((c): c is Constraint => c !== null && present.has(c.from) && present.has(c.to));

	const byNode = new Map<string, Constraint[]>();
	for (const c of constraints) {
		for (const id of [c.from, c.to]) {
			const list = byNode.get(id);
			if (list) list.push(c);
			else byNode.set(id, [c]);
		}
	}

	const placed = new Set<string>();
	const families: Map<string, number>[] = [];
	for (const seed of model.nodes) {
		if (placed.has(seed.id) || !byNode.has(seed.id)) continue;

		// Grow this family from the seed, always taking the most trusted link that reaches
		// someone new.
		const family = new Map<string, number>([[seed.id, 0]]);
		for (;;) {
			let best: { id: string; generation: number; priority: number } | null = null;
			for (const [id, own] of family) {
				for (const c of byNode.get(id)!) {
					const [other, generation] =
						c.from === id ? [c.to, own + c.offset] : [c.from, own - c.offset];
					if (family.has(other)) continue;
					if (!best || c.priority < best.priority) {
						best = { id: other, generation, priority: c.priority };
					}
				}
			}
			if (!best) break;
			family.set(best.id, best.generation);
		}

		const top = Math.min(...family.values());
		for (const [id, generation] of family) family.set(id, generation - top);
		for (const id of family.keys()) placed.add(id);
		families.push(family);
	}
	return families;
}

/** Generation per person across every family on the map — see {@link familiesOf}. */
export function generationsOf(model: GraphModel): Map<string, number> {
	return new Map(familiesOf(model).flatMap((family) => [...family]));
}

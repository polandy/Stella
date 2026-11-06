import type { KinshipGraph } from './kinship';

/*
 * The links of a kinship graph as adjacency (docs/02 §2.4.1): who is whose parent, partner
 * and sibling, read by `kinship.ts`.
 */

/** Adjacency built once per inference; every lookup reads from these. */
export class Links {
	readonly parents = new Map<string, Set<string>>();
	readonly children = new Map<string, Set<string>>();
	readonly partners = new Map<string, Set<string>>();
	readonly explicitSiblings = new Map<string, Set<string>>();

	constructor(graph: KinshipGraph) {
		for (const { parentId, childId } of graph.parentEdges) {
			add(this.parents, childId, parentId);
			add(this.children, parentId, childId);
		}
		for (const { a, b, former } of graph.partnerEdges) {
			// A partnership that is over carries no step- or in-law family with it.
			if (former) continue;
			add(this.partners, a, b);
			add(this.partners, b, a);
		}
		for (const { a, b } of graph.siblingEdges) {
			add(this.explicitSiblings, a, b);
			add(this.explicitSiblings, b, a);
		}
	}

	get = (map: Map<string, Set<string>>, id: string): string[] => [...(map.get(id) ?? [])];

	/** Everyone sharing at least one parent with `id`, plus the explicitly linked siblings. */
	siblingsOf(id: string): string[] {
		const found = new Set(this.explicitSiblings.get(id) ?? []);
		for (const parent of this.parents.get(id) ?? []) {
			for (const child of this.children.get(parent) ?? []) {
				if (child !== id) found.add(child);
			}
		}
		return [...found];
	}

	/** The parents the two have in common — its size decides full versus half. */
	sharedParentIds(x: string, y: string): string[] {
		const theirs = this.parents.get(y) ?? new Set();
		return [...(this.parents.get(x) ?? [])].filter((parent) => theirs.has(parent));
	}

	parentCount = (id: string): number => (this.parents.get(id) ?? new Set()).size;
}

function add(map: Map<string, Set<string>>, key: string, value: string): void {
	const set = map.get(key);
	if (set) set.add(value);
	else map.set(key, new Set([value]));
}

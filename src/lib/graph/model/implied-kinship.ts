import {
	PARENT_CHILD_TYPE_KEY,
	PARTNER_TYPE_KEYS,
	SIBLING_TYPE_KEY
} from '../../relationships/type-keys';
import type { GraphEdge, GraphModel } from './types';

/*
 * Which derived kinship lines the map already says (docs/02 §2.7).
 *
 * A derived line is shorthand for a chain of entered links: Frederick is Andy's nephew because
 * Frederick is Steve's son and Steve is Andy's brother. When that chain is drawn, the dotted
 * "Nephew" line only repeats it — and in a family with a few children per sibling those
 * repeats outnumber the links themselves. So a derived line is left off the map while its two
 * ends are joined by the links the kinship engine reasons from, and drawn only where it is the
 * one thing connecting them: someone on the chain not opened up, filtered away, or private.
 *
 * Pure and cheap: one bounded walk per person a derived line touches.
 */

/** The links kinship is inferred from (`kinship-graph-read.ts`), so a chain of them explains it. */
const CHAIN_TYPE_KEYS: ReadonlySet<string> = new Set([
	PARENT_CHILD_TYPE_KEY,
	SIBLING_TYPE_KEY,
	...PARTNER_TYPE_KEYS
]);

/**
 * The longest chain behind any term Stella works out: a cousin whose parents' sibling link was
 * never entered runs up to the shared grandparent and down again — four links. A longer route
 * on the map is one the reader cannot follow by eye, so the line stays.
 */
const MAX_CHAIN_LINKS = 4;

const isChainLink = (edge: GraphEdge) =>
	edge.kind === 'relationship' && edge.typeKey !== undefined && CHAIN_TYPE_KEYS.has(edge.typeKey);

/**
 * The ids of the derived kinship edges in `model` whose chain of entered links it also holds.
 * The lines of `selectedId` are never among them: selecting a person names every line around
 * them, and "Nephew" is exactly the word the chain leaves the reader to work out.
 */
export function impliedKinshipEdgeIds(model: GraphModel, selectedId?: string | null): Set<string> {
	const neighbours = new Map<string, string[]>();
	const connect = (from: string, to: string) => {
		const list = neighbours.get(from);
		if (list) list.push(to);
		else neighbours.set(from, [to]);
	};
	for (const edge of model.edges) {
		if (!isChainLink(edge)) continue;
		connect(edge.source, edge.target);
		connect(edge.target, edge.source);
	}

	const withinReach = new Map<string, Set<string>>();
	const reachOf = (start: string): Set<string> => {
		const known = withinReach.get(start);
		if (known) return known;
		const reached = new Set([start]);
		let frontier = [start];
		for (let step = 0; step < MAX_CHAIN_LINKS && frontier.length > 0; step++) {
			const next: string[] = [];
			for (const id of frontier) {
				for (const neighbour of neighbours.get(id) ?? []) {
					if (reached.has(neighbour)) continue;
					reached.add(neighbour);
					next.push(neighbour);
				}
			}
			frontier = next;
		}
		withinReach.set(start, reached);
		return reached;
	};

	const implied = new Set<string>();
	for (const edge of model.edges) {
		if (edge.kind !== 'kinship') continue;
		if (edge.source === selectedId || edge.target === selectedId) continue;
		if (reachOf(edge.source).has(edge.target)) implied.add(edge.id);
	}
	return implied;
}

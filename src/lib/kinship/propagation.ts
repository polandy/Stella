import type { KinshipGraph } from './kinship';

/*
 * Propagation suggestions (docs/02 §2.4.1).
 *
 * Adding one primary link usually implies others: a mother added to one child is the mother
 * of that child's siblings too. Stella works those out and **offers** them — one confirmation
 * each, never a silent write (docs/02 §2.4.1, "suggestions are always opt-in").
 *
 * Only links that have a built-in relationship type are proposed, which means parent and
 * sibling. A partner's tie to existing children is a *step* relationship: it has no stored
 * type and needs none, because the kinship engine already names it on the profile.
 *
 * Pure: the caller passes the graph as it stands after storing the new link.
 */

/** The link that was just stored. For `parent`, `fromId` is the parent and `toId` the child. */
export interface PrimaryLink {
	kind: 'parent' | 'sibling' | 'partner';
	fromId: string;
	toId: string;
}

/** A link Stella offers to store, with the sentence explaining why it is offered. */
export interface SuggestedLink {
	kind: 'parent' | 'sibling';
	/** Parent side for `parent`; either side for `sibling`. */
	fromId: string;
	toId: string;
	/** One sentence naming the reason, e.g. "Lisa is Hans's sibling." */
	reason: string;
}

const pairKey = (x: string, y: string) => (x < y ? `${x} ${y}` : `${y} ${x}`);

/** Possessive with the typographic apostrophe the interface uses elsewhere. A name ending
 * in s keeps the s — "Hans’s sibling" reads the way the sentence is spoken. */
const possessive = (name: string) => `${name}’s`;

/** Parents per child and children per parent, plus the sibling sets they imply. */
function index(graph: KinshipGraph) {
	const parents = new Map<string, Set<string>>();
	const children = new Map<string, Set<string>>();
	const siblings = new Map<string, Set<string>>();
	const link = (map: Map<string, Set<string>>, key: string, value: string) => {
		const set = map.get(key);
		if (set) set.add(value);
		else map.set(key, new Set([value]));
	};

	for (const { parentId, childId } of graph.parentEdges) {
		link(parents, childId, parentId);
		link(children, parentId, childId);
	}
	for (const { a, b } of graph.siblingEdges) {
		link(siblings, a, b);
		link(siblings, b, a);
	}
	// Sharing a parent makes siblings just as surely as an explicit link does.
	for (const brood of children.values()) {
		for (const one of brood) {
			for (const other of brood) if (one !== other) link(siblings, one, other);
		}
	}
	return { parents, children, siblings };
}

/**
 * The links implied by `added` that are not stored yet, in a stable order. Empty when the
 * new link stands alone, and empty for a partner link by design.
 */
export function suggestPropagation(graph: KinshipGraph, added: PrimaryLink): SuggestedLink[] {
	if (added.kind === 'partner') return [];

	const { parents, siblings } = index(graph);
	const names = new Map(graph.people.map((person) => [person.id, person.displayName]));
	const nameOf = (id: string) => names.get(id) ?? id;

	// Pairs the household has already spoken about, in any form.
	const linked = new Set<string>();
	for (const { parentId, childId } of graph.parentEdges) linked.add(pairKey(parentId, childId));
	for (const { a, b } of [...graph.siblingEdges, ...graph.partnerEdges, ...graph.storedPairs]) {
		linked.add(pairKey(a, b));
	}

	const found: SuggestedLink[] = [];
	const seen = new Set<string>();
	const propose = (parentId: string, childId: string, reason: string): void => {
		if (parentId === childId) return;
		if (linked.has(pairKey(parentId, childId)) || seen.has(pairKey(parentId, childId))) return;
		seen.add(pairKey(parentId, childId));
		found.push({ kind: 'parent', fromId: parentId, toId: childId, reason });
	};

	if (added.kind === 'parent') {
		// The new parent belongs to the child's siblings too.
		const child = added.toId;
		for (const sibling of siblings.get(child) ?? []) {
			propose(added.fromId, sibling, `${nameOf(sibling)} is ${possessive(nameOf(child))} sibling.`);
		}
	} else {
		// New siblings share the parents each side already has.
		for (const [one, other] of [
			[added.fromId, added.toId],
			[added.toId, added.fromId]
		] as const) {
			for (const parent of parents.get(one) ?? []) {
				propose(parent, other, `${nameOf(parent)} is ${possessive(nameOf(one))} parent.`);
			}
		}
	}

	return found.sort(
		(x, y) => nameOf(x.fromId).localeCompare(nameOf(y.fromId)) || nameOf(x.toId).localeCompare(nameOf(y.toId))
	);
}

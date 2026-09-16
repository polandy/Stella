import type { KinshipGraph } from '$lib/kinship/kinship';
import { indexDismissals, pairKey, type AnswerTo, type Dismissal } from './claims';
import type { PrimaryLink } from './types';

/*
 * The read model a suggestion evaluation works over (docs/concepts/relationship-suggestions-
 * implementation.md §2).
 *
 * The graph arrives as edge lists — the shape a repository can read cheaply — but rules ask
 * about people: who are this child's parents, are these two already linked. Walking the lists
 * per rule would answer the same question a different way in each one, and the suppressions
 * that keep Stella from offering what is already known would each need their own scan. So the
 * lists are indexed once, here, and every rule asks the view.
 *
 * Pure, and built from a graph the repository has already scoped to one viewer: a rule cannot
 * reach a person the view was not given, so a suggestion can never name someone hidden.
 */

/** The graph as the rules read it: the edges as given, plus the questions they ask of them. */
export interface SuggestionView extends KinshipGraph {
	/** The people recorded as this person's parents. */
	parentsOf(personId: string): ReadonlySet<string>;
	/** The people this person is recorded as a parent of. */
	childrenOf(personId: string): ReadonlySet<string>;
	/**
	 * This person's siblings — entered as such, or implied by a shared parent, which makes
	 * siblings just as surely.
	 */
	siblingsOf(personId: string): ReadonlySet<string>;
	/**
	 * Whether the household has already linked these two in any way. A pair that carries a
	 * stored relationship keeps the name the household gave it and is never suggested again.
	 */
	isLinked(x: string, y: string): boolean;
	/** This person's display name, falling back to the id so a sentence is never empty. */
	nameOf(personId: string): string;
	/** Whether this person is in the view at all — and so may be named in a suggestion. */
	has(personId: string): boolean;
	/**
	 * The primary links a review of this person has to read: the ones they stand in, plus the
	 * ones their siblings stand in. A link-scoped evaluation is handed its one link; a review
	 * (docs/concepts/relationship-suggestions.md §6.5) is handed the sibling group, because
	 * that is the group the link rules move a parent across — read from the other side, "my
	 * sister's father is my father" is a claim about *me* that no link of mine mentions.
	 */
	primaryLinksAround(personId: string): PrimaryLink[];
	/**
	 * Every primary link in the view, for a household-wide pass (§6.6), in the same fixed order
	 * as `primaryLinksAround`. The view is already scoped to one viewer, so "every" means every
	 * link this viewer may see and never more.
	 */
	allPrimaryLinks(): PrimaryLink[];
	/** The household's answer to this claim, or null while it stands unanswered (§6.4). */
	answerTo: AnswerTo;
}

const EMPTY: ReadonlySet<string> = new Set();

/** Adds `value` to the set at `key`, creating it on first use. Never links a person to self. */
function link(map: Map<string, Set<string>>, key: string, value: string): void {
	if (key === value) return;
	const set = map.get(key);
	if (set) set.add(value);
	else map.set(key, new Set([value]));
}

/**
 * The primary links standing between anyone in `people` and anyone at all, in a fixed order —
 * parents before siblings before partners — so a review lists the same claims in the same
 * order on every run. `people` of `null` means *everyone*, which is the household-wide pass.
 */
function primaryLinksTouching(
	graph: KinshipGraph,
	people: ReadonlySet<string> | null
): PrimaryLink[] {
	const touches = (...ends: string[]) => people === null || ends.some((end) => people.has(end));
	const found: PrimaryLink[] = [];
	for (const { parentId, childId } of graph.parentEdges) {
		if (touches(parentId, childId)) {
			found.push({ kind: 'parent', fromId: parentId, toId: childId });
		}
	}
	for (const [kind, edges] of [
		['sibling', graph.siblingEdges],
		['partner', graph.partnerEdges]
	] as const) {
		for (const { a, b } of edges) {
			if (touches(a, b)) found.push({ kind, fromId: a, toId: b });
		}
	}
	return found;
}

/** Indexes one viewer's graph into the view the rules read. */
export function buildView(
	graph: KinshipGraph,
	dismissals: readonly Dismissal[] = []
): SuggestionView {
	const parents = new Map<string, Set<string>>();
	const children = new Map<string, Set<string>>();
	const siblings = new Map<string, Set<string>>();
	const names = new Map(graph.people.map((person) => [person.id, person.displayName]));
	const linked = new Set<string>();

	for (const { parentId, childId } of graph.parentEdges) {
		link(parents, childId, parentId);
		link(children, parentId, childId);
		linked.add(pairKey(parentId, childId));
	}
	for (const { a, b } of graph.siblingEdges) {
		link(siblings, a, b);
		link(siblings, b, a);
	}
	for (const { a, b } of [...graph.siblingEdges, ...graph.partnerEdges, ...graph.storedPairs]) {
		linked.add(pairKey(a, b));
	}
	// Sharing a parent makes siblings just as surely as an entered link does.
	for (const brood of children.values()) {
		for (const one of brood) for (const other of brood) link(siblings, one, other);
	}

	const answerTo = indexDismissals(dismissals);

	return {
		...graph,
		parentsOf: (personId) => parents.get(personId) ?? EMPTY,
		childrenOf: (personId) => children.get(personId) ?? EMPTY,
		siblingsOf: (personId) => siblings.get(personId) ?? EMPTY,
		isLinked: (x, y) => linked.has(pairKey(x, y)),
		nameOf: (personId) => names.get(personId) ?? personId,
		has: (personId) => names.has(personId),
		primaryLinksAround: (personId) =>
			primaryLinksTouching(graph, new Set([personId, ...(siblings.get(personId) ?? EMPTY)])),
		allPrimaryLinks: () => primaryLinksTouching(graph, null),
		answerTo
	};
}

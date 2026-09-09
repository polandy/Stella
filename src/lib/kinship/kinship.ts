/*
 * Kinship inference (docs/02 §2.4.1).
 *
 * Households enter the few links they actually think in — parent/child, sibling, partner —
 * and Stella names the rest: grandparents, aunts and uncles, cousins, in-laws, step-family.
 * Everything here is **derived for display only**. Nothing is written, and a pair that is
 * already linked (primary or any stored relationship) is never given a second, inferred name.
 *
 * Pure and dependency-free: the caller passes the people and links the viewer may see, so
 * visibility is settled before inference starts and can never leak through a derived label.
 */

/** A person the engine may name. `gender` is free text; only `male`/`female` gender a label. */
export interface KinPerson {
	id: string;
	displayName: string;
	gender?: string | null;
}

export interface ParentEdge {
	parentId: string;
	childId: string;
}

/** An undirected link between two people. */
export interface Pair {
	a: string;
	b: string;
}

/** The primary links to reason over, plus every pair that must not be re-derived. */
export interface KinshipGraph {
	people: readonly KinPerson[];
	parentEdges: readonly ParentEdge[];
	siblingEdges: readonly Pair[];
	partnerEdges: readonly Pair[];
	/** Pairs already carrying a stored relationship of any type (docs/02 §2.4). */
	storedPairs: readonly Pair[];
}

export type KinTerm =
	| 'sibling'
	| 'half-sibling'
	| 'grandparent'
	| 'grandchild'
	| 'aunt-uncle'
	| 'niece-nephew'
	| 'great-grandparent'
	| 'great-grandchild'
	| 'cousin'
	| 'step-parent'
	| 'step-child'
	| 'step-sibling'
	| 'parent-in-law'
	| 'child-in-law'
	| 'sibling-in-law';

/** One inferred relative, from the subject's perspective. */
export interface DerivedKin {
	personId: string;
	displayName: string;
	term: KinTerm;
	/**
	 * Which wording the term takes: gendered where the gender is recorded, neutral
	 * otherwise. The word itself lives in the message catalogue (docs/02 §2.19), so the
	 * engine stays language-free.
	 */
	variant: KinVariant;
	/** Display names of the people the inference runs through, for "via Bettina". */
	via: string[];
}

/** Closeness, lowest first — the order relatives are shown in. */
const TERM_RANK: Record<KinTerm, number> = {
	sibling: 0,
	'half-sibling': 1,
	grandparent: 2,
	grandchild: 3,
	'aunt-uncle': 4,
	'niece-nephew': 5,
	'great-grandparent': 6,
	'great-grandchild': 7,
	cousin: 8,
	'step-parent': 9,
	'step-child': 10,
	'step-sibling': 11,
	'parent-in-law': 12,
	'child-in-law': 13,
	'sibling-in-law': 14
};

/** Which wording a term takes for a person. */
export type KinVariant = 'male' | 'female' | 'neutral';


/** Half-sibling is only claimed when both sides have this many parents on record. */
const PARENTS_FOR_HALF = 2;

/** Unordered key for a pair. The separator cannot occur in an id, which is generated. */
const pairKey = (x: string, y: string) => (x < y ? `${x} ${y}` : `${y} ${x}`);

function variantFor(person: KinPerson): KinVariant {
	const gender = (person.gender ?? '').trim().toLowerCase();
	if (gender === 'male') return 'male';
	if (gender === 'female') return 'female';
	return 'neutral';
}

/** Adjacency built once per call; every lookup below reads from these. */
class Links {
	readonly parents = new Map<string, Set<string>>();
	readonly children = new Map<string, Set<string>>();
	readonly partners = new Map<string, Set<string>>();
	readonly explicitSiblings = new Map<string, Set<string>>();

	constructor(graph: KinshipGraph) {
		for (const { parentId, childId } of graph.parentEdges) {
			add(this.parents, childId, parentId);
			add(this.children, parentId, childId);
		}
		for (const { a, b } of graph.partnerEdges) {
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

/**
 * The adjacency and exclusions a graph implies, built once so a caller asking about every
 * person pays for them once rather than once per subject (the explorer asks about everyone).
 */
class Inference {
	private readonly links: Links;
	private readonly byId: Map<string, KinPerson>;
	/** A pair that is already linked keeps the name the household gave it. */
	private readonly excluded = new Set<string>();

	constructor(graph: KinshipGraph) {
		this.links = new Links(graph);
		this.byId = new Map(graph.people.map((person) => [person.id, person]));
		for (const { parentId, childId } of graph.parentEdges) {
			this.excluded.add(pairKey(parentId, childId));
		}
		for (const { a, b } of [...graph.siblingEdges, ...graph.partnerEdges, ...graph.storedPairs]) {
			this.excluded.add(pairKey(a, b));
		}
	}

	relativesOf(subjectId: string): DerivedKin[] {
		const { links, byId, excluded } = this;

		/** Best (closest) term per person wins; the first `via` for that term is kept. */
		const best = new Map<string, { term: KinTerm; via: string[] }>();
		const claim = (personId: string, term: KinTerm, via: string[]): void => {
			if (personId === subjectId || !byId.has(personId)) return;
			if (excluded.has(pairKey(subjectId, personId))) return;
			const current = best.get(personId);
			if (current && TERM_RANK[current.term] <= TERM_RANK[term]) return;
			best.set(personId, { term, via });
		};

		const nameOf = (id: string) => byId.get(id)?.displayName ?? id;
		const parents = links.get(links.parents, subjectId);
		const children = links.get(links.children, subjectId);
		const siblings = links.siblingsOf(subjectId);

		// Siblings, half where both sides have two parents on record and share exactly one.
		for (const sibling of siblings) {
			const shared = links.sharedParentIds(subjectId, sibling);
			const bothComplete =
				links.parentCount(subjectId) >= PARENTS_FOR_HALF &&
				links.parentCount(sibling) >= PARENTS_FOR_HALF;
			const term: KinTerm = bothComplete && shared.length === 1 ? 'half-sibling' : 'sibling';
			claim(sibling, term, shared.map(nameOf));
		}

		// Ancestors and descendants, two and three generations out.
		for (const parent of parents) {
			for (const grandparent of links.get(links.parents, parent)) {
				claim(grandparent, 'grandparent', [nameOf(parent)]);
				for (const great of links.get(links.parents, grandparent)) {
					claim(great, 'great-grandparent', [nameOf(parent), nameOf(grandparent)]);
				}
			}
			// Parent's siblings and their children.
			for (const auntUncle of links.siblingsOf(parent)) {
				claim(auntUncle, 'aunt-uncle', [nameOf(parent)]);
				for (const cousin of links.get(links.children, auntUncle)) {
					claim(cousin, 'cousin', [nameOf(parent), nameOf(auntUncle)]);
				}
			}
			// A parent's partner who is not also a parent is a step-parent, and their other
			// children — the ones sharing no parent with the subject — are step-siblings.
			for (const stepParent of links.get(links.partners, parent)) {
				if (parents.includes(stepParent)) continue;
				claim(stepParent, 'step-parent', [nameOf(parent)]);
				for (const stepSibling of links.get(links.children, stepParent)) {
					if (links.sharedParentIds(subjectId, stepSibling).length > 0) continue;
					claim(stepSibling, 'step-sibling', [nameOf(stepParent)]);
				}
			}
		}

		for (const child of children) {
			for (const grandchild of links.get(links.children, child)) {
				claim(grandchild, 'grandchild', [nameOf(child)]);
				for (const great of links.get(links.children, grandchild)) {
					claim(great, 'great-grandchild', [nameOf(child), nameOf(grandchild)]);
				}
			}
			for (const childInLaw of links.get(links.partners, child)) {
				claim(childInLaw, 'child-in-law', [nameOf(child)]);
			}
		}

		for (const sibling of siblings) {
			for (const nieceNephew of links.get(links.children, sibling)) {
				claim(nieceNephew, 'niece-nephew', [nameOf(sibling)]);
			}
			for (const siblingInLaw of links.get(links.partners, sibling)) {
				claim(siblingInLaw, 'sibling-in-law', [nameOf(sibling)]);
			}
		}

		// Through a partner: their parents and siblings, and their children from before.
		for (const partner of links.get(links.partners, subjectId)) {
			for (const parentInLaw of links.get(links.parents, partner)) {
				claim(parentInLaw, 'parent-in-law', [nameOf(partner)]);
			}
			for (const siblingInLaw of links.siblingsOf(partner)) {
				claim(siblingInLaw, 'sibling-in-law', [nameOf(partner)]);
			}
			for (const stepChild of links.get(links.children, partner)) {
				if (children.includes(stepChild)) continue;
				claim(stepChild, 'step-child', [nameOf(partner)]);
			}
		}

		return [...best.entries()]
			.map(([personId, { term, via }]) => {
				const person = byId.get(personId)!;
				return { personId, displayName: person.displayName, term, variant: variantFor(person), via };
			})
			.sort(
				(x, y) => TERM_RANK[x.term] - TERM_RANK[y.term] || x.displayName.localeCompare(y.displayName)
			);
	}
}

/**
 * The relatives of `subjectId` that follow from the primary links, best term per person,
 * closest first. Returns an empty list for a person with no links to reason from.
 */
export function deriveKinship(graph: KinshipGraph, subjectId: string): DerivedKin[] {
	return new Inference(graph).relativesOf(subjectId);
}

/**
 * The same answer for everyone in the graph, sharing the one set-up. Asking person by person
 * rebuilds the adjacency each time — on a household-sized graph that is the difference between
 * a page load feeling instant and not.
 */
export function deriveKinshipForAll(graph: KinshipGraph): Map<string, DerivedKin[]> {
	const inference = new Inference(graph);
	return new Map(graph.people.map((person) => [person.id, inference.relativesOf(person.id)]));
}

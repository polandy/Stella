import type { Phrase } from '$lib/i18n/phrase';
import { parentOf, siblingOf } from '$lib/suggestions/reasons';
import { buildView, pairKey } from '$lib/suggestions/view';
import type { KinshipGraph } from './kinship';

/*
 * Propagation suggestions (docs/02 §2.4.1).
 *
 * Adding one primary link usually implies others: a mother added to one child is the mother
 * of that child's siblings too. Stella works those out and **offers** them — one confirmation
 * each, never a silent write (docs/02 §2.4.1, "suggestions are always opt-in").
 *
 * What comes back is always a parent link — the one primary type an implication can be
 * written to. A partner's tie to existing children is a *step* relationship: it has no stored
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

/**
 * A link Stella offers to store, with the sentence explaining why it is offered. Always a
 * parent link: a new sibling implies the parents each side has, and a new parent implies the
 * same parent for the siblings — the sibling ties themselves are already there either way.
 */
export interface SuggestedLink {
	kind: 'parent';
	/** The parent, and the child the link would be stored against. */
	fromId: string;
	toId: string;
	/** One sentence naming the reason, unsaid until the edge knows the reader's language. */
	reason: Phrase;
}

/**
 * The links implied by `added` that are not stored yet, in a stable order. Empty when the
 * new link stands alone, and empty for a partner link by design.
 */
export function suggestPropagation(graph: KinshipGraph, added: PrimaryLink): SuggestedLink[] {
	if (added.kind === 'partner') return [];

	const view = buildView(graph);
	const nameOf = (id: string) => view.nameOf(id);

	const found: SuggestedLink[] = [];
	const seen = new Set<string>();
	const propose = (parentId: string, childId: string, reason: Phrase): void => {
		if (parentId === childId) return;
		if (view.isLinked(parentId, childId) || seen.has(pairKey(parentId, childId))) return;
		seen.add(pairKey(parentId, childId));
		found.push({ kind: 'parent', fromId: parentId, toId: childId, reason });
	};

	if (added.kind === 'parent') {
		// The new parent belongs to the child's siblings too.
		const child = added.toId;
		for (const sibling of view.siblingsOf(child)) {
			propose(added.fromId, sibling, siblingOf(nameOf(sibling), nameOf(child)));
		}
	} else {
		// New siblings share the parents each side already has.
		for (const [one, other] of [
			[added.fromId, added.toId],
			[added.toId, added.fromId]
		] as const) {
			for (const parent of view.parentsOf(one)) {
				propose(parent, other, parentOf(nameOf(parent), nameOf(one)));
			}
		}
	}

	return found.sort(
		(x, y) => nameOf(x.fromId).localeCompare(nameOf(y.fromId)) || nameOf(x.toId).localeCompare(nameOf(y.toId))
	);
}

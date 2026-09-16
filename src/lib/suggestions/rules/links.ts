import { parentOf, siblingOf } from '../reasons';
import type { LinkSuggestion, PrimaryLink, Rule, Trigger } from '../types';
import type { SuggestionView } from '../view';

/*
 * The link rules (docs/concepts/relationship-suggestions.md §2, L1 and L2).
 *
 * Adding one primary link usually implies others: a mother added to one child is the mother
 * of that child's siblings too. Stella works those out and **offers** them — one confirmation
 * each, never a silent write (docs/02 §2.4.1, "suggestions are always opt-in").
 *
 * A rule says only what follows. It does not ask whether the claim is already stored, already
 * derived, or fit to show: the engine applies those suppressions to every rule's output at
 * once, because a rule that filters is a rule that can forget to.
 *
 * Both rules offer a **parent** link — the one relation an implication can be written to. A
 * partner's tie to existing children is a step relationship: it has no stored type and needs
 * none, because the kinship engine already names it on the profile.
 *
 * Neither rule knows which trigger pointed it at a link. A write names one link; a review names
 * the whole neighbourhood of one person (§6.5) — and that difference belongs in `linksInScope`,
 * not spread through every rule that would otherwise grow a second branch.
 */

/**
 * The primary links a trigger puts in front of the rules: the one that was just stored, the
 * links standing around one subject and their siblings, or — for a household pass (§6.6) —
 * every link there is. A review therefore reaches claims that were raised and lost long before
 * anyone thought to look at them, and a household pass reaches the families nobody opened.
 */
function linksInScope(trigger: Trigger, view: SuggestionView): readonly PrimaryLink[] {
	switch (trigger.kind) {
		case 'link-stored':
			return [trigger.link];
		case 'person-reviewed':
			return view.primaryLinksAround(trigger.subjectId);
		case 'household-reviewed':
			return view.allPrimaryLinks();
	}
}

/** A `certain` parent claim: a logical consequence of what the household entered, not a guess. */
function parentLink(
	ruleId: 'L1' | 'L2',
	parentId: string,
	childId: string,
	reason: LinkSuggestion['reason']
): LinkSuggestion {
	return {
		kind: 'link',
		ruleId,
		confidence: 'certain',
		relation: 'parent',
		fromId: parentId,
		toId: childId,
		reason,
		// Never a rule's to answer: the engine drops or marks a declined claim (§6.4).
		dismissed: null
	};
}

/** L1 — a parent stored for one child is a parent of that child's siblings. */
export const L1: Rule = (trigger: Trigger, view: SuggestionView): LinkSuggestion[] =>
	linksInScope(trigger, view)
		.filter((link) => link.kind === 'parent')
		.flatMap(({ fromId: parentId, toId: childId }) =>
			[...view.siblingsOf(childId)].map((sibling) =>
				parentLink('L1', parentId, sibling, siblingOf(view.nameOf(sibling), view.nameOf(childId)))
			)
		);

/** L2 — a stored sibling link means each side's known parents are the other's parents. */
export const L2: Rule = (trigger: Trigger, view: SuggestionView): LinkSuggestion[] => {
	const found: LinkSuggestion[] = [];
	for (const link of linksInScope(trigger, view)) {
		if (link.kind !== 'sibling') continue;
		for (const [one, other] of [
			[link.fromId, link.toId],
			[link.toId, link.fromId]
		] as const) {
			for (const parent of view.parentsOf(one)) {
				found.push(parentLink('L2', parent, other, parentOf(view.nameOf(parent), view.nameOf(one))));
			}
		}
	}
	return found;
};

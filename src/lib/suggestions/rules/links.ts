import { parentOf, siblingOf } from '../reasons';
import type { LinkSuggestion, Rule, Trigger } from '../types';
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
 */

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
		reason
	};
}

/** L1 — a parent stored for one child is a parent of that child's siblings. */
export const L1: Rule = (trigger: Trigger, view: SuggestionView): LinkSuggestion[] => {
	if (trigger.link.kind !== 'parent') return [];
	const { fromId: parentId, toId: childId } = trigger.link;
	return [...view.siblingsOf(childId)].map((sibling) =>
		parentLink('L1', parentId, sibling, siblingOf(view.nameOf(sibling), view.nameOf(childId)))
	);
};

/** L2 — a stored sibling link means each side's known parents are the other's parents. */
export const L2: Rule = (trigger: Trigger, view: SuggestionView): LinkSuggestion[] => {
	if (trigger.link.kind !== 'sibling') return [];
	const { fromId, toId } = trigger.link;
	const found: LinkSuggestion[] = [];
	for (const [one, other] of [
		[fromId, toId],
		[toId, fromId]
	] as const) {
		for (const parent of view.parentsOf(one)) {
			found.push(parentLink('L2', parent, other, parentOf(view.nameOf(parent), view.nameOf(one))));
		}
	}
	return found;
};

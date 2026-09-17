import type { LinkedPhrase, PersonRef } from '$lib/i18n/linked';

/*
 * The sentence a suggestion carries (docs/concepts/relationship-suggestions-implementation.md
 * §6). A rule knows *why* it fires long before anything knows who will read it, so the reason
 * leaves the domain unsaid — the sentence's slots and the people in them — and the edge renders
 * it in the reader's language, with every name still a way to that person's page.
 *
 * One builder per reason shape. Rules name a builder; they never name a message key.
 */

/**
 * Why a parent link is offered: the parent is on record for one child, and that child and this
 * one are siblings.
 *
 * Both facts, because either alone leaves the question open — the sibling pair never mentions
 * the person being offered, and the parent link never mentions the child it is offered for.
 * `via` is the sibling the claim travels through, whom the sentence names twice.
 */
export const parentThroughSibling = (
	parent: PersonRef,
	via: PersonRef,
	child: PersonRef
): LinkedPhrase<'parent' | 'via' | 'child'> => {
	return (t) => ({
		people: { parent, via, child },
		say: (names) => t('kinship.reason.parentThroughSibling', names)
	});
};

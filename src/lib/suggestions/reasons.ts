import type { LinkedPhrase, PersonRef } from '$lib/i18n/linked';

/*
 * The sentence a suggestion carries (docs/04 ADR-014). A rule knows *why* it fires long
 * before anything knows who will read it, so the reason
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

/**
 * Why a likely second parent is offered (L3): they are the parent's partner, and the parent is
 * on record for the child. Both facts, for the same reason as above — and because the claim is
 * only *likely*, the reader needs to see what it rests on to judge it.
 */
export const partnerOfParent = (
	partner: PersonRef,
	parent: PersonRef,
	child: PersonRef
): LinkedPhrase<'partner' | 'parent' | 'child'> => {
	return (t) => ({
		people: { partner, parent, child },
		say: (names) => t('kinship.reason.partnerOfParent', names)
	});
};

/**
 * Why a worked-out relative is offered: Stella reached them through these people, and nobody
 * has entered the tie. Each person the inference ran through is named and followable.
 */
export const workedOutThrough = (via: readonly PersonRef[]): LinkedPhrase => {
	return (t) => {
		const people = Object.fromEntries(via.map((person, index) => [`via${index}`, person]));
		return {
			people,
			say: (names) =>
				t('kinship.reason.workedOutThrough', {
					via: via.map((_, index) => names[`via${index}`]!).join(t('contact.relationships.viaAnd'))
				})
		};
	};
};

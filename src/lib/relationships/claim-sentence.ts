import type { LinkedPhrase, PersonRef } from '$lib/i18n/linked';
import type { KinVariant } from '../kinship/kinship';
import type { Relation } from '../suggestions/types';

/**
 * The claim one suggestion row makes — *Otto Meier is a parent of Lisa Meier* — with both
 * people still separable from the words around them, so each name is a way to that page.
 *
 * Built here rather than interpolated in the component: German orders the sentence its own way,
 * and a sentence with slots can be tested where a string built in markup cannot.
 */
export const claimSentence = (
	relation: Relation,
	from: PersonRef,
	to: PersonRef,
	variant: KinVariant = 'neutral'
): LinkedPhrase => {
	switch (relation) {
		case 'parent':
			return (t) => ({
				people: { parent: from, child: to },
				say: (names) =>
					t('contact.relationships.parentProposal', {
						parent: names.parent!,
						child: names.child!
					})
			});
		case 'sibling':
			return (t) => ({
				people: { one: from, other: to },
				say: (names) =>
					t('contact.relationships.siblingProposal', { one: names.one!, other: names.other! })
			});
		default:
			// A worked-out relation, naming the elder where it has one and the relative (`to`)
			// otherwise, in the gender on record (docs/02 §2.4.1).
			return (t) => ({
				people: { from, to },
				say: (names) =>
					t(`kinship.claim.${relation}.${variant}`, { from: names.from!, to: names.to! })
			});
	}
};

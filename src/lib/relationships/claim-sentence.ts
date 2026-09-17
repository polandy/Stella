import type { LinkedPhrase, PersonRef } from '$lib/i18n/linked';

/**
 * The claim one suggestion row makes — *Otto Meier is a parent of Lisa Meier* — with both
 * people still separable from the words around them, so each name is a way to that page.
 *
 * Built here rather than interpolated in the component: German orders the sentence its own way,
 * and a sentence with slots can be tested where a string built in markup cannot.
 */
export const claimSentence = (
	relation: 'parent' | 'sibling',
	from: PersonRef,
	to: PersonRef
): LinkedPhrase =>
	relation === 'parent'
		? (t) => ({
				people: { parent: from, child: to },
				say: (names) =>
					t('contact.relationships.parentProposal', {
						parent: names.parent!,
						child: names.child!
					})
			})
		: (t) => ({
				people: { one: from, other: to },
				say: (names) =>
					t('contact.relationships.siblingProposal', { one: names.one!, other: names.other! })
			});

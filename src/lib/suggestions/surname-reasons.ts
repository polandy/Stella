import type { LinkedPhrase, PersonRef } from '$lib/i18n/linked';

/*
 * Why a last name is proposed (docs/02 §2.2.4.1), as sentences that are said only
 * once the reader's language is known — and whose names still lead to those people. One
 * builder per rule; the rules name a builder, never a message key.
 */

/** F1: a parent carries the name. */
export const childOf =
	(parent: PersonRef): LinkedPhrase<'parent'> =>
	(t) => ({ people: { parent }, say: (names) => t('surnames.reason.child', names) });

/** F2: a sibling carries it. */
export const siblingOf =
	(sibling: PersonRef): LinkedPhrase<'sibling'> =>
	(t) => ({ people: { sibling }, say: (names) => t('surnames.reason.sibling', names) });

/** F3: a partner carries it — with the name they had before, when it is on record. */
export const partnerOf =
	(partner: PersonRef, formerName: string | null): LinkedPhrase<'partner'> =>
	(t) => ({
		people: { partner },
		say: (names) =>
			formerName
				? t('surnames.reason.partnerBorn', { partner: names.partner, former: formerName })
				: t('surnames.reason.partner', names)
	});

/** F9: the shown name already holds it. */
export const shownAs =
	(shownName: string): LinkedPhrase<never> =>
	(t) => ({ people: {}, say: () => t('surnames.reason.shownName', { name: shownName }) });

/** F10: their children carry it. */
export const parentOf =
	(child: PersonRef): LinkedPhrase<'child'> =>
	(t) => ({ people: { child }, say: (names) => t('surnames.reason.parent', names) });

/** F11: the family circle they are in carries it; a circle has no page to follow here. */
export const inCircle =
	(circleName: string): LinkedPhrase<never> =>
	(t) => ({ people: {}, say: () => t('surnames.reason.circle', { circle: circleName }) });

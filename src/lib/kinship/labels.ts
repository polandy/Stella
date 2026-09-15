import { hasMessage, type Translate } from '$lib/i18n/translate';
import { SIBLING_TYPE_KEY } from '$lib/relationships/type-keys';
import type { DirectClaim } from './claims';
import type { KinTerm, KinVariant } from './kinship';

/*
 * What a worked-out relative is called (docs/02 §2.4.1). The kinship engine is pure and
 * language-free: it decides the term and whether the person is named male, female or
 * neutrally, and the wording is looked up here.
 */

/** "Grandmother", "Großmutter" — the term in the viewer's language. */
export function kinshipLabel(
	t: Translate,
	kin: { term: KinTerm; variant: KinVariant }
): string {
	const key = `kinship.term.${kin.term}.${kin.variant}`;
	return hasMessage(key) ? t(key) : kin.term;
}

/** "Actually the child" — what confirming a step relative's direct link is called. */
export function directClaimLabel(t: Translate, claim: DirectClaim): string {
	if (claim.typeKey === SIBLING_TYPE_KEY) return t('contact.relationships.reallySibling');
	return claim.parent === 'subject'
		? t('contact.relationships.reallyChild')
		: t('contact.relationships.reallyParent');
}
